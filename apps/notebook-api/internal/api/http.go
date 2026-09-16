package api

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/config"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/store"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"golang.org/x/time/rate"
)

const maxAuthHeader = 128
const maxJSONOverhead = 1 << 20

func wireLimit(maxItemBytes int64) int64 {
	// Ciphertext is unpadded base64url in JSON (~4/3) plus envelope wrapping.
	return maxItemBytes*2 + maxJSONOverhead
}

type Server struct {
	cfg     config.Config
	store   store.Store
	log     *slog.Logger
	now     func() time.Time
	limiters sync.Map // ip -> *rate.Limiter
	ready   func(context.Context) error
}

func New(cfg config.Config, st store.Store, log *slog.Logger, ready func(context.Context) error) *Server {
	if log == nil {
		log = slog.Default()
	}
	if ready == nil {
		ready = st.Ping
	}
	return &Server{cfg: cfg, store: st, log: log, now: time.Now, ready: ready}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /readyz", s.readyz)
	mux.HandleFunc("GET /openapi.yaml", s.openapi)
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.HandleFunc("PUT /v1/notebooks/{id}", s.putNotebook)
	mux.HandleFunc("GET /v1/notebooks/{id}/items", s.listItems)
	mux.HandleFunc("POST /v1/notebooks/{id}/items", s.postItem)
	mux.HandleFunc("POST /v1/notebooks/{id}/extend", s.extendNotebook)
	mux.HandleFunc("GET /v1/items/{itemId}", s.getItem)
	mux.HandleFunc("DELETE /v1/items/{itemId}", s.deleteItem)

	h := s.instrument(s.cors(s.rateLimit(s.securityHeaders(mux))))
	return otelhttp.NewHandler(h, "notebook-api")
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.ready(ctx); err != nil {
		s.log.Error("ready check", "err", err)
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) putNotebook(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNotebookID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid notebook id")
		return
	}
	proof, err := parseAuth(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "missing or invalid X-Auth")
		return
	}
	ttl := s.parseTTL(r)
	hash := sha256.Sum256(proof)
	if err := withRetry(r.Context(), func() error {
		return s.store.UpsertNotebook(r.Context(), id, hash[:], s.now().Add(ttl))
	}); err != nil {
		s.writeStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "expiresIn": int(ttl.Seconds())})
}

func (s *Server) listItems(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNotebookID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid notebook id")
		return
	}
	items, err := retryStore(r.Context(), func() ([]store.ItemMeta, error) {
		return s.store.ListItems(r.Context(), id)
	})
	if err != nil {
		s.writeStoreErr(w, err)
		return
	}
	type row struct {
		ID        string `json:"id"`
		Kind      string `json:"kind"`
		Size      int    `json:"size"`
		CreatedAt string `json:"createdAt"`
		ExpiresAt string `json:"expiresAt"`
	}
	out := make([]row, 0, len(items))
	for _, it := range items {
		out = append(out, row{
			ID: it.ID, Kind: string(it.Kind), Size: it.Size,
			CreatedAt: it.CreatedAt.UTC().Format(time.RFC3339),
			ExpiresAt: it.ExpiresAt.UTC().Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

type postItemBody struct {
	Kind       string `json:"kind"`
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
	TTLSeconds int    `json:"ttlSeconds"`
}

func (s *Server) postItem(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNotebookID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid notebook id")
		return
	}
	proof, err := parseAuth(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "missing or invalid X-Auth")
		return
	}
	nb, err := retryStore(r.Context(), func() (store.Notebook, error) {
		return s.store.GetNotebook(r.Context(), id)
	})
	if err != nil {
		s.writeStoreErr(w, err)
		return
	}
	want := sha256.Sum256(proof)
	if subtle.ConstantTimeCompare(nb.AuthHash, want[:]) != 1 {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, wireLimit(s.cfg.MaxItemBytes))
	var body postItemBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	kind, ok := store.ParseKind(body.Kind)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid kind")
		return
	}
	nonce, err := b64(body.Nonce)
	if err != nil || len(nonce) != 12 {
		writeError(w, http.StatusBadRequest, "invalid nonce")
		return
	}
	ct, err := b64(body.Ciphertext)
	if err != nil || len(ct) == 0 {
		writeError(w, http.StatusBadRequest, "invalid ciphertext")
		return
	}
	if int64(len(ct)) > s.cfg.MaxItemBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "item too large")
		return
	}
	ttl := s.cfg.DefaultTTL
	if body.TTLSeconds > 0 {
		ttl = time.Duration(body.TTLSeconds) * time.Second
	}
	if ttl < s.cfg.MinTTL || ttl > s.cfg.MaxTTL {
		writeError(w, http.StatusBadRequest, "ttl out of range")
		return
	}
	item := store.Item{
		ID:         uuid.NewString(),
		NotebookID: id,
		Kind:       kind,
		Nonce:      nonce,
		Ciphertext: ct,
		Size:       len(ct),
		ExpiresAt:  s.now().Add(ttl),
	}
	if err := s.store.InsertItem(r.Context(), item, s.cfg.MaxItems, s.cfg.MaxNotebookBytes); err != nil {
		s.writeStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        item.ID,
		"expiresAt": item.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

func (s *Server) extendNotebook(w http.ResponseWriter, r *http.Request) {
	id, ok := parseNotebookID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid notebook id")
		return
	}
	proof, err := parseAuth(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "missing or invalid X-Auth")
		return
	}
	var body struct {
		TTLSeconds int `json:"ttlSeconds"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	ttl := s.cfg.DefaultTTL
	if body.TTLSeconds > 0 {
		ttl = time.Duration(body.TTLSeconds) * time.Second
	}
	if ttl < s.cfg.MinTTL || ttl > s.cfg.MaxTTL {
		writeError(w, http.StatusBadRequest, "ttl out of range")
		return
	}
	hash := sha256.Sum256(proof)
	if err := withRetry(r.Context(), func() error {
		return s.store.ExtendNotebook(r.Context(), id, hash[:], s.now().Add(ttl))
	}); err != nil {
		s.writeStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"expiresIn": int(ttl.Seconds())})
}

func (s *Server) getItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("itemId")
	if _, err := uuid.Parse(id); err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	it, err := retryStore(r.Context(), func() (store.Item, error) {
		return s.store.GetItem(r.Context(), id)
	})
	if err != nil {
		s.writeStoreErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":          it.ID,
		"kind":        string(it.Kind),
		"nonce":       base64.RawURLEncoding.EncodeToString(it.Nonce),
		"ciphertext":  base64.RawURLEncoding.EncodeToString(it.Ciphertext),
		"size":        it.Size,
		"createdAt":   it.CreatedAt.UTC().Format(time.RFC3339),
		"expiresAt":   it.ExpiresAt.UTC().Format(time.RFC3339),
	})
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("itemId")
	if _, err := uuid.Parse(id); err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id")
		return
	}
	proof, err := parseAuth(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "missing or invalid X-Auth")
		return
	}
	hash := sha256.Sum256(proof)
	if err := withRetry(r.Context(), func() error {
		return s.store.DeleteItem(r.Context(), id, hash[:])
	}); err != nil {
		s.writeStoreErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func retryable(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, store.ErrNotFound) || errors.Is(err, store.ErrForbidden) ||
		errors.Is(err, store.ErrLimit) || errors.Is(err, store.ErrConflict) ||
		errors.Is(err, store.ErrInvalidInput) || errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	return true
}

func withRetry(ctx context.Context, fn func() error) error {
	_, err := retryStore(ctx, func() (struct{}, error) {
		return struct{}{}, fn()
	})
	return err
}

func retryStore[T any](ctx context.Context, fn func() (T, error)) (T, error) {
	var zero T
	var err error
	wait := 50 * time.Millisecond
	for i := 0; i < 3; i++ {
		v, e := fn()
		if e == nil || !retryable(e) {
			return v, e
		}
		err = e
		select {
		case <-ctx.Done():
			return zero, ctx.Err()
		case <-time.After(wait):
		}
		wait *= 2
	}
	return zero, err
}

func (s *Server) writeStoreErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, store.ErrForbidden):
		writeError(w, http.StatusUnauthorized, "unauthorized")
	case errors.Is(err, store.ErrLimit):
		writeError(w, http.StatusRequestEntityTooLarge, "notebook full")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "conflict")
	case errors.Is(err, store.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "invalid input")
	default:
		s.log.Error("store", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

func (s *Server) parseTTL(r *http.Request) time.Duration {
	q := r.URL.Query().Get("ttl")
	if q == "" {
		return s.cfg.DefaultTTL
	}
	d, err := time.ParseDuration(q)
	if err != nil {
		sec, err2 := time.ParseDuration(q + "s")
		if err2 != nil {
			return s.cfg.DefaultTTL
		}
		d = sec
	}
	if d < s.cfg.MinTTL {
		return s.cfg.MinTTL
	}
	if d > s.cfg.MaxTTL {
		return s.cfg.MaxTTL
	}
	return d
}

func (s *Server) cors(next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(s.cfg.CORSOrigins))
	for _, o := range s.cfg.CORSOrigins {
		allowed[o] = struct{}{}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowed[strings.TrimRight(origin, "/")]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Auth")
				w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type limiterEntry struct {
	lim  *rate.Limiter
	seen time.Time
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/healthz") || strings.HasPrefix(r.URL.Path, "/readyz") || r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		ip := clientIP(r)
		now := s.now()
		v, _ := s.limiters.LoadOrStore(ip, &limiterEntry{lim: rate.NewLimiter(rate.Limit(s.cfg.RatePerSec), s.cfg.RateBurst), seen: now})
		ent := v.(*limiterEntry)
		ent.seen = now
		s.pruneLimiters(now)
		if !ent.lim.Allow() {
			writeError(w, http.StatusTooManyRequests, "rate limited")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) pruneLimiters(now time.Time) {
	n := 0
	s.limiters.Range(func(k, v any) bool {
		n++
		ent := v.(*limiterEntry)
		if now.Sub(ent.seen) > 10*time.Minute {
			s.limiters.Delete(k)
		}
		return true
	})
	if n > 4096 {
		s.limiters.Range(func(k, _ any) bool {
			s.limiters.Delete(k)
			return true
		})
	}
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Request-Id", requestID(r))
		next.ServeHTTP(w, r)
	})
}

func (s *Server) SweepLoop(ctx context.Context) {
	t := time.NewTicker(s.cfg.SweepInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			n, i, err := s.store.Sweep(ctx, now)
			if err != nil {
				s.log.Error("sweep", "err", err)
				continue
			}
			if n+i > 0 {
				s.log.Info("sweep", "notebooks", n, "items", i)
			}
		}
	}
}

func parseNotebookID(id string) (string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil || len(raw) != sha256.Size {
		return "", false
	}
	return id, true
}

func parseAuth(r *http.Request) ([]byte, error) {
	h := r.Header.Get("X-Auth")
	if h == "" || len(h) > maxAuthHeader {
		return nil, errors.New("missing")
	}
	raw, err := base64.RawURLEncoding.DecodeString(h)
	if err != nil || len(raw) != sha256.Size {
		return nil, errors.New("invalid")
	}
	return raw, nil
}

func b64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func clientIP(r *http.Request) string {
	if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
		return cf
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func requestID(r *http.Request) string {
	if id := r.Header.Get("X-Request-Id"); id != "" {
		return id
	}
	return uuid.NewString()
}
