package api

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/config"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/store"
)

func testServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	cfg := config.Config{
		CORSOrigins:      []string{"https://ivanpanev.net"},
		MaxItemBytes:     1024,
		MaxNotebookBytes: 4096,
		MaxItems:         3,
		MinTTL:           time.Hour,
		MaxTTL:           7 * 24 * time.Hour,
		DefaultTTL:       24 * time.Hour,
		RatePerSec:       1000,
		RateBurst:        1000,
		SweepInterval:    time.Hour,
	}
	s := New(cfg, store.NewMemory(), nil, nil)
	return s, s.Handler()
}

func notebookID() string {
	sum := sha256.Sum256([]byte("lookup"))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func authProof() string {
	sum := sha256.Sum256([]byte("auth-key"))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func TestHealthz(t *testing.T) {
	_, h := testServer(t)
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
}

func TestWrongPasscodeLooksEmpty(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/v1/notebooks/"+id+"/items", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
	var body struct {
		Items []any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 0 {
		t.Fatalf("expected empty list")
	}
}

func TestPutRequiresAuthAndRejectsWrongProof(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	req.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("create status %d %s", w.Code, w.Body.String())
	}

	other := sha256.Sum256([]byte("other"))
	req = httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	req.Header.Set("X-Auth", base64.RawURLEncoding.EncodeToString(other[:]))
	w = httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong proof status %d", w.Code)
	}
}

func TestPostGetDeleteRoundTrip(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)
	if w.Code != 200 {
		t.Fatalf("put %d %s", w.Code, w.Body.String())
	}

	nonce := base64.RawURLEncoding.EncodeToString(make([]byte, 12))
	ct := base64.RawURLEncoding.EncodeToString([]byte("ciphertext-bytes!!"))
	body := `{"kind":"text","nonce":"` + nonce + `","ciphertext":"` + ct + `","ttlSeconds":3600}`
	post := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/v1/notebooks/"+id+"/items", strings.NewReader(body))
	post.Header.Set("X-Auth", authProof())
	post.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, post)
	if w.Code != http.StatusCreated {
		t.Fatalf("post %d %s", w.Code, w.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	get := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/v1/items/"+created.ID, nil)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, get)
	if w.Code != 200 {
		t.Fatalf("get %d %s", w.Code, w.Body.String())
	}

	del := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/v1/items/"+created.ID, nil)
	del.Header.Set("X-Auth", authProof())
	w = httptest.NewRecorder()
	h.ServeHTTP(w, del)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete %d %s", w.Code, w.Body.String())
	}

	get = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/v1/items/"+created.ID, nil)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, get)
	if w.Code != http.StatusNotFound {
		t.Fatalf("get after delete %d", w.Code)
	}
}

func TestCORSAllowlist(t *testing.T) {
	_, h := testServer(t)
	r := httptest.NewRequestWithContext(context.Background(), http.MethodOptions, "/v1/notebooks/x", nil)
	r.Header.Set("Origin", "https://ivanpanev.net")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Access-Control-Allow-Origin") != "https://ivanpanev.net" {
		t.Fatalf("missing cors origin: %v", w.Header())
	}

	r = httptest.NewRequestWithContext(context.Background(), http.MethodOptions, "/v1/notebooks/x", nil)
	r.Header.Set("Origin", "https://evil.example")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("unexpected cors for evil origin")
	}
}

func TestItemCap(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)

	nonce := base64.RawURLEncoding.EncodeToString(make([]byte, 12))
	ct := base64.RawURLEncoding.EncodeToString([]byte("x"))
	body := `{"kind":"text","nonce":"` + nonce + `","ciphertext":"` + ct + `","ttlSeconds":3600}`
	for i := 0; i < 3; i++ {
		post := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/v1/notebooks/"+id+"/items", strings.NewReader(body))
		post.Header.Set("X-Auth", authProof())
		w = httptest.NewRecorder()
		h.ServeHTTP(w, post)
		if w.Code != http.StatusCreated {
			t.Fatalf("item %d: %d %s", i, w.Code, w.Body.String())
		}
	}
	post := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/v1/notebooks/"+id+"/items", strings.NewReader(body))
	post.Header.Set("X-Auth", authProof())
	w = httptest.NewRecorder()
	h.ServeHTTP(w, post)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("cap status %d %s", w.Code, w.Body.String())
	}
}

func TestOpenAPI(t *testing.T) {
	_, h := testServer(t)
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/openapi.yaml", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "notebook-api") {
		t.Fatalf("missing title")
	}
}

func TestRateLimit(t *testing.T) {
	cfg := config.Config{
		CORSOrigins:      []string{"https://ivanpanev.net"},
		MaxItemBytes:     1024,
		MaxNotebookBytes: 4096,
		MaxItems:         3,
		MinTTL:           time.Hour,
		MaxTTL:           7 * 24 * time.Hour,
		DefaultTTL:       24 * time.Hour,
		RatePerSec:       1,
		RateBurst:        1,
		SweepInterval:    time.Hour,
	}
	h := New(cfg, store.NewMemory(), nil, nil).Handler()
	id := notebookID()
	req := func() int {
		r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/v1/notebooks/"+id+"/items", nil)
		r.Header.Set("CF-Connecting-IP", "203.0.113.9")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if req() != 200 {
		t.Fatal("first should pass")
	}
	if req() != http.StatusTooManyRequests {
		t.Fatal("second should 429")
	}
}

func TestItemTooLarge(t *testing.T) {
	cfg := config.Config{
		CORSOrigins: []string{"https://ivanpanev.net"}, MaxItemBytes: 8, MaxNotebookBytes: 64,
		MaxItems: 3, MinTTL: time.Hour, MaxTTL: 7 * 24 * time.Hour, DefaultTTL: 24 * time.Hour,
		RatePerSec: 1000, RateBurst: 1000, SweepInterval: time.Hour,
	}
	h := New(cfg, store.NewMemory(), nil, nil).Handler()
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)
	nonce := base64.RawURLEncoding.EncodeToString(make([]byte, 12))
	ct := base64.RawURLEncoding.EncodeToString(make([]byte, 16))
	body := `{"kind":"text","nonce":"` + nonce + `","ciphertext":"` + ct + `","ttlSeconds":3600}`
	post := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/v1/notebooks/"+id+"/items", strings.NewReader(body))
	post.Header.Set("X-Auth", authProof())
	post.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, post)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status %d %s", w.Code, w.Body.String())
	}
}

func TestTTLOutOfRange(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)
	nonce := base64.RawURLEncoding.EncodeToString(make([]byte, 12))
	ct := base64.RawURLEncoding.EncodeToString([]byte("x"))
	body := `{"kind":"text","nonce":"` + nonce + `","ciphertext":"` + ct + `","ttlSeconds":1}`
	post := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/v1/notebooks/"+id+"/items", strings.NewReader(body))
	post.Header.Set("X-Auth", authProof())
	post.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, post)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d %s", w.Code, w.Body.String())
	}
}

func TestStoredAuthIsHashOfProof(t *testing.T) {
	s, h := testServer(t)
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	nb, err := s.store.GetNotebook(put.Context(), id)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := base64.RawURLEncoding.DecodeString(authProof())
	if err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256(raw)
	if string(nb.AuthHash) != string(want[:]) {
		t.Fatalf("server must store SHA-256(authProof)")
	}
}

func TestExtend(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)
	ext := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/v1/notebooks/"+id+"/extend", strings.NewReader(`{"ttlSeconds":3600}`))
	ext.Header.Set("X-Auth", authProof())
	w = httptest.NewRecorder()
	h.ServeHTTP(w, ext)
	if w.Code != 200 {
		t.Fatalf("status %d %s", w.Code, w.Body.String())
	}
}

type flakyStore struct {
	store.Store
	remain int
}

func (f *flakyStore) UpsertNotebook(ctx context.Context, id string, authHash []byte, expiresAt time.Time) error {
	if f.remain > 0 {
		f.remain--
		return errors.New("connection reset by peer")
	}
	return f.Store.UpsertNotebook(ctx, id, authHash, expiresAt)
}

func TestRetryIdempotentStore(t *testing.T) {
	cfg := config.Config{
		CORSOrigins: []string{"https://ivanpanev.net"}, MaxItemBytes: 1024, MaxNotebookBytes: 4096,
		MaxItems: 3, MinTTL: time.Hour, MaxTTL: 7 * 24 * time.Hour, DefaultTTL: 24 * time.Hour,
		RatePerSec: 1000, RateBurst: 1000, SweepInterval: time.Hour,
	}
	h := New(cfg, &flakyStore{Store: store.NewMemory(), remain: 1}, nil, nil).Handler()
	id := notebookID()
	put := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	put.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, put)
	if w.Code != 200 {
		t.Fatalf("status %d %s", w.Code, w.Body.String())
	}
}

func TestAuthLockoutAfterFailures(t *testing.T) {
	_, h := testServer(t)
	id := notebookID()
	good := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	good.Header.Set("X-Auth", authProof())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, good)
	if w.Code != 200 {
		t.Fatalf("seed %d %s", w.Code, w.Body.String())
	}
	other := sha256.Sum256([]byte("other"))
	wrong := base64.RawURLEncoding.EncodeToString(other[:])
	for i := 0; i < authFailMax; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
		req.Header.Set("X-Auth", wrong)
		rw := httptest.NewRecorder()
		h.ServeHTTP(rw, req)
		if i < authFailMax-1 && rw.Code != http.StatusUnauthorized {
			t.Fatalf("fail %d status %d", i, rw.Code)
		}
		if i == authFailMax-1 && rw.Code != http.StatusTooManyRequests {
			t.Fatalf("lock status %d %s", rw.Code, rw.Body.String())
		}
	}
	again := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/v1/notebooks/"+id, nil)
	again.Header.Set("X-Auth", authProof())
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, again)
	if rw.Code != http.StatusTooManyRequests {
		t.Fatalf("expected lock, got %d", rw.Code)
	}
}

func TestInvalidNotebookID(t *testing.T) {
	_, h := testServer(t)
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/v1/notebooks/not-a-hash/items", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d", w.Code)
	}
}
