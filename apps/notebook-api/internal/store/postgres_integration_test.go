//go:build integration

package store_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/migrate"
	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/internal/store"
)

func TestPostgresRoundTrip(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	if err := migrate.UpURL(ctx, url); err != nil {
		t.Fatal(err)
	}
	pg, err := store.NewPostgres(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pg.Close)

	id := "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	hash := make([]byte, 32)
	hash[0] = 1
	if err := pg.UpsertNotebook(ctx, id, hash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	item := store.Item{
		ID: uuid.NewString(), NotebookID: id, Kind: store.KindText,
		Nonce: make([]byte, 12), Ciphertext: []byte("ct"), Size: 2,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := pg.InsertItem(ctx, item, 50, 100<<20); err != nil {
		t.Fatal(err)
	}
	got, err := pg.GetItem(ctx, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Size != 2 {
		t.Fatalf("size %d", got.Size)
	}
}
