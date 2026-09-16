package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ListenAddr        string
	DatabaseURL       string
	CORSOrigins       []string
	MaxItemBytes      int64
	MaxNotebookBytes  int64
	MaxItems          int
	MinTTL            time.Duration
	MaxTTL            time.Duration
	DefaultTTL        time.Duration
	RatePerSec        float64
	RateBurst         int
	LogLevel          string
	OTLPEndpoint      string
	SweepInterval     time.Duration
	ReadHeaderTimeout time.Duration
}

func FromEnv() (Config, error) {
	c := Config{
		ListenAddr:        getenv("LISTEN_ADDR", ":8080"),
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		CORSOrigins:       splitCSV(getenv("CORS_ORIGINS", "https://ivanpanev.net")),
		MaxItemBytes:      getenvInt64("MAX_ITEM_BYTES", 20<<20),
		MaxNotebookBytes:  getenvInt64("MAX_NOTEBOOK_BYTES", 100<<20),
		MaxItems:          int(getenvInt64("MAX_ITEMS", 50)),
		MinTTL:            getenvDuration("MIN_TTL", time.Hour),
		MaxTTL:            getenvDuration("MAX_TTL", 7*24*time.Hour),
		DefaultTTL:        getenvDuration("DEFAULT_TTL", 24*time.Hour),
		RatePerSec:        getenvFloat("RATE_PER_SEC", 2),
		RateBurst:         int(getenvInt64("RATE_BURST", 20)),
		LogLevel:          getenv("LOG_LEVEL", "info"),
		OTLPEndpoint:      os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
		SweepInterval:     getenvDuration("SWEEP_INTERVAL", time.Minute),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if c.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if c.MaxItemBytes < 1 || c.MaxNotebookBytes < c.MaxItemBytes || c.MaxItems < 1 {
		return Config{}, fmt.Errorf("invalid size caps")
	}
	if c.MinTTL <= 0 || c.MaxTTL < c.MinTTL || c.DefaultTTL < c.MinTTL || c.DefaultTTL > c.MaxTTL {
		return Config{}, fmt.Errorf("invalid TTL bounds")
	}
	return c, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getenvInt64(k string, def int64) int64 {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return def
	}
	return n
}

func getenvFloat(k string, def float64) float64 {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def
	}
	return n
}

func getenvDuration(k string, def time.Duration) time.Duration {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, strings.TrimRight(p, "/"))
		}
	}
	return out
}
