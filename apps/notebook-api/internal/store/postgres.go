package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func NewPostgres(ctx context.Context, url string) (*Postgres, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "15000"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Postgres{pool: pool}, nil
}

func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }

func (p *Postgres) UpsertNotebook(ctx context.Context, id string, authHash []byte, expiresAt time.Time) error {
	tag, err := p.pool.Exec(ctx, `
		INSERT INTO notebooks (id, auth_hash, expires_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE
		  SET auth_hash = EXCLUDED.auth_hash,
		      expires_at = GREATEST(notebooks.expires_at, EXCLUDED.expires_at)
		  WHERE notebooks.auth_hash = EXCLUDED.auth_hash
		     OR notebooks.expires_at <= now()`,
		id, authHash, expiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var exists bool
	if err := p.pool.QueryRow(ctx, `SELECT true FROM notebooks WHERE id = $1 AND expires_at > now()`, id).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return ErrForbidden
}

func (p *Postgres) GetNotebook(ctx context.Context, id string) (Notebook, error) {
	var nb Notebook
	err := p.pool.QueryRow(ctx, `
		SELECT id, auth_hash, created_at, expires_at
		FROM notebooks WHERE id = $1 AND expires_at > now()`, id).
		Scan(&nb.ID, &nb.AuthHash, &nb.CreatedAt, &nb.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Notebook{}, ErrNotFound
	}
	return nb, err
}

func (p *Postgres) ExtendNotebook(ctx context.Context, id string, authHash []byte, expiresAt time.Time) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	tag, err := tx.Exec(ctx, `
		UPDATE notebooks SET expires_at = $3
		WHERE id = $1 AND auth_hash = $2 AND expires_at > now()`,
		id, authHash, expiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		err := tx.QueryRow(ctx, `SELECT true FROM notebooks WHERE id = $1 AND expires_at > now()`, id).Scan(&exists)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		return ErrForbidden
	}
	if _, err := tx.Exec(ctx, `UPDATE items SET expires_at = $2 WHERE notebook_id = $1`, id, expiresAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *Postgres) ListItems(ctx context.Context, notebookID string) ([]ItemMeta, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT i.id, i.kind, i.size, i.created_at, i.expires_at
		FROM items i
		JOIN notebooks n ON n.id = i.notebook_id
		WHERE i.notebook_id = $1 AND i.expires_at > now() AND n.expires_at > now()
		ORDER BY i.created_at`, notebookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ItemMeta, 0)
	for rows.Next() {
		var m ItemMeta
		if err := rows.Scan(&m.ID, &m.Kind, &m.Size, &m.CreatedAt, &m.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (p *Postgres) InsertItem(ctx context.Context, item Item, maxItems int, maxNotebookBytes int64) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var exists bool
	err = tx.QueryRow(ctx, `SELECT true FROM notebooks WHERE id = $1 AND expires_at > now() FOR UPDATE`, item.NotebookID).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	var count int
	var total int64
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(size), 0)
		FROM items WHERE notebook_id = $1 AND expires_at > now()`, item.NotebookID).
		Scan(&count, &total); err != nil {
		return err
	}
	if count >= maxItems || total+int64(item.Size) > maxNotebookBytes {
		return ErrLimit
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO items (id, notebook_id, kind, nonce, ciphertext, size, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		item.ID, item.NotebookID, string(item.Kind), item.Nonce, item.Ciphertext, item.Size, item.ExpiresAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrConflict
		}
		return err
	}
	return tx.Commit(ctx)
}

func (p *Postgres) GetItem(ctx context.Context, id string) (Item, error) {
	var it Item
	var kind string
	err := p.pool.QueryRow(ctx, `
		SELECT i.id, i.notebook_id, i.kind, i.nonce, i.ciphertext, i.size, i.created_at, i.expires_at
		FROM items i
		JOIN notebooks n ON n.id = i.notebook_id
		WHERE i.id = $1 AND i.expires_at > now() AND n.expires_at > now()`, id).
		Scan(&it.ID, &it.NotebookID, &kind, &it.Nonce, &it.Ciphertext, &it.Size, &it.CreatedAt, &it.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, ErrNotFound
	}
	if err != nil {
		return Item{}, err
	}
	it.Kind = Kind(kind)
	return it, nil
}

func (p *Postgres) DeleteItem(ctx context.Context, id string, authHash []byte) error {
	tag, err := p.pool.Exec(ctx, `
		DELETE FROM items i
		USING notebooks n
		WHERE i.id = $1 AND i.notebook_id = n.id AND n.auth_hash = $2 AND n.expires_at > now()`,
		id, authHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var exists bool
	err = p.pool.QueryRow(ctx, `
		SELECT true FROM items i JOIN notebooks n ON n.id = i.notebook_id
		WHERE i.id = $1 AND n.expires_at > now()`, id).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	return ErrForbidden
}

func (p *Postgres) AuthLocked(ctx context.Context, notebookID string, now time.Time) (time.Time, bool, error) {
	var until time.Time
	err := p.pool.QueryRow(ctx, `
		SELECT locked_until FROM auth_attempts
		WHERE notebook_id = $1 AND locked_until IS NOT NULL AND locked_until > $2`,
		notebookID, now).Scan(&until)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	return until, true, nil
}

func (p *Postgres) RecordAuthFailure(ctx context.Context, notebookID string, now time.Time, maxFails int, window, lockFor time.Duration) (time.Time, bool, error) {
	var until *time.Time
	err := p.pool.QueryRow(ctx, `
		INSERT INTO auth_attempts (notebook_id, failures, window_start, locked_until)
		VALUES ($1, 1, $2, NULL)
		ON CONFLICT (notebook_id) DO UPDATE SET
		  failures = CASE
		    WHEN auth_attempts.window_start < $2 - make_interval(secs => $3) THEN 1
		    ELSE auth_attempts.failures + 1
		  END,
		  window_start = CASE
		    WHEN auth_attempts.window_start < $2 - make_interval(secs => $3) THEN $2
		    ELSE auth_attempts.window_start
		  END,
		  locked_until = CASE
		    WHEN (CASE
		      WHEN auth_attempts.window_start < $2 - make_interval(secs => $3) THEN 1
		      ELSE auth_attempts.failures + 1
		    END) >= $4 THEN $2 + make_interval(secs => $5)
		    ELSE auth_attempts.locked_until
		  END
		RETURNING locked_until`,
		notebookID, now, int(window.Seconds()), maxFails, int(lockFor.Seconds())).Scan(&until)
	if err != nil {
		return time.Time{}, false, err
	}
	if until != nil && until.After(now) {
		return *until, true, nil
	}
	return time.Time{}, false, nil
}

func (p *Postgres) ClearAuthFailures(ctx context.Context, notebookID string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM auth_attempts WHERE notebook_id = $1`, notebookID)
	return err
}

func (p *Postgres) Sweep(ctx context.Context, now time.Time) (int64, int64, error) {
	it, err := p.pool.Exec(ctx, `DELETE FROM items WHERE expires_at <= $1`, now)
	if err != nil {
		return 0, 0, err
	}
	nb, err := p.pool.Exec(ctx, `DELETE FROM notebooks WHERE expires_at <= $1`, now)
	if err != nil {
		return 0, 0, err
	}
	return nb.RowsAffected(), it.RowsAffected(), nil
}
