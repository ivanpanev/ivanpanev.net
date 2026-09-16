package store

import (
	"context"
	"testing"
	"time"
)

func TestMemoryExpiredNotebookCanBeRecreated(t *testing.T) {
	m := NewMemory()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	m.now = func() time.Time { return now }
	id := "nb"
	hash := []byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	if err := m.UpsertNotebook(context.Background(), id, hash, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Hour)
	other := []byte("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
	if err := m.UpsertNotebook(context.Background(), id, other, now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	nb, err := m.GetNotebook(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if string(nb.AuthHash) != string(other) {
		t.Fatal("expected replacement hash")
	}
}

func TestMemorySweep(t *testing.T) {
	m := NewMemory()
	now := time.Now()
	_ = m.UpsertNotebook(context.Background(), "a", []byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), now.Add(-time.Minute))
	n, _, err := m.Sweep(context.Background(), now)
	if err != nil || n != 1 {
		t.Fatalf("sweep notebooks=%d err=%v", n, err)
	}
}
