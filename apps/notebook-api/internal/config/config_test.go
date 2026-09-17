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
	if c.MinTTL != 3*time.Minute || c.MaxTTL != 5*time.Hour+18*time.Minute || c.DefaultTTL != 18*time.Minute {
		t.Fatalf("ttl %+v", c)
	}
	if len(c.CORSOrigins) != 2 || c.CORSOrigins[1] != "https://example.test" {
		t.Fatalf("cors %v", c.CORSOrigins)
	}
}
