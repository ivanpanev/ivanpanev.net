package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	httpRequests = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "notebook-api HTTP requests",
		},
		[]string{"method", "code", "handler"},
	)
	httpDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "notebook-api HTTP request duration",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "code", "handler"},
	)
)

type statusWriter struct {
	http.ResponseWriter
	code int
}

func (w *statusWriter) WriteHeader(code int) {
	w.code = code
	w.ResponseWriter.WriteHeader(code)
}

func (s *Server) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		sw := &statusWriter{ResponseWriter: w, code: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(sw, r)
		handler := routeLabel(r.Method, r.URL.Path)
		code := strconv.Itoa(sw.code)
		httpRequests.WithLabelValues(r.Method, code, handler).Inc()
		httpDuration.WithLabelValues(r.Method, code, handler).Observe(time.Since(start).Seconds())
	})
}

func routeLabel(method, path string) string {
	switch {
	case path == "/healthz":
		return "healthz"
	case path == "/readyz":
		return "readyz"
	case path == "/openapi.yaml":
		return "openapi"
	case strings.HasPrefix(path, "/v1/items/"):
		return method + " /v1/items/{itemId}"
	case strings.HasSuffix(path, "/extend"):
		return "POST /v1/notebooks/{id}/extend"
	case strings.HasSuffix(path, "/items") && method == http.MethodGet:
		return "GET /v1/notebooks/{id}/items"
	case strings.HasSuffix(path, "/items") && method == http.MethodPost:
		return "POST /v1/notebooks/{id}/items"
	case strings.HasPrefix(path, "/v1/notebooks/"):
		return method + " /v1/notebooks/{id}"
	default:
		return "other"
	}
}
