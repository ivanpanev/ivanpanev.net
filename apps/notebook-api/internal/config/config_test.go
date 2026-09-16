package config

import (
	"testing"
	"time"
)

func TestFromEnvRequiresDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := FromEnv(); err == nil {
		t.Fatal("expected error")
	}
}

func TestFromEnvDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://n:n@127.0.0.1:5432/n")
	t.Setenv("CORS_ORIGINS", "https://ivanpanev.net, https://example.test/")
	c, err := FromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if c.MaxItemBytes != 20<<20 || c.MaxItems != 50 || c.MaxNotebookBytes != 100<<20 {
		t.Fatalf("caps %+v", c)
	}
	if c.MinTTL != time.Hour || c.MaxTTL != 7*24*time.Hour {
		t.Fatalf("ttl %+v", c)
	}
	if len(c.CORSOrigins) != 2 || c.CORSOrigins[1] != "https://example.test" {
		t.Fatalf("cors %v", c.CORSOrigins)
	}
}
