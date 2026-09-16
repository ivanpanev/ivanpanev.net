package migrate

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/ivanpanev/ivanpanev.net/apps/notebook-api/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func UpURL(ctx context.Context, url string) error {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return err
	}
	defer db.Close()
	return Up(ctx, db)
}

func Up(ctx context.Context, db *sql.DB) error {
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}
	// Two API replicas must not run CREATE TABLE concurrently. goose's
	// legacy UpContext does not take a session lock (M4-R1-F01).
	if _, err := db.ExecContext(ctx, `SELECT pg_advisory_lock($1)`, notebookLock); err != nil {
		return fmt.Errorf("advisory lock: %w", err)
	}
	defer func() { _, _ = db.ExecContext(context.Background(), `SELECT pg_advisory_unlock($1)`, notebookLock) }()
	if err := goose.UpContext(ctx, db, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

const notebookLock int64 = 0x6e6f7465626f6f6b // "notebook" truncated to int64
