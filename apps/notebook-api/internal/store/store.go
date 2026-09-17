package store

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrForbidden    = errors.New("forbidden")
	ErrConflict     = errors.New("conflict")
	ErrLimit        = errors.New("limit exceeded")
	ErrInvalidInput = errors.New("invalid input")
	ErrLocked       = errors.New("locked")
)

type Kind string

const (
	KindText      Kind = "text"
	KindCode      Kind = "code"
	KindImage     Kind = "image"
	KindWorkspace Kind = "workspace"
)

func ParseKind(s string) (Kind, bool) {
	switch Kind(s) {
	case KindText, KindCode, KindImage, KindWorkspace:
		return Kind(s), true
	default:
		return "", false
	}
}

type Notebook struct {
	ID        string
	AuthHash  []byte
	CreatedAt time.Time
	ExpiresAt time.Time
}

type Item struct {
	ID         string
	NotebookID string
	Kind       Kind
	Nonce      []byte
	Ciphertext []byte
	Size       int
	CreatedAt  time.Time
	ExpiresAt  time.Time
}

type ItemMeta struct {
	ID        string
	Kind      Kind
	Size      int
	CreatedAt time.Time
	ExpiresAt time.Time
}

type Store interface {
	UpsertNotebook(ctx context.Context, id string, authHash []byte, expiresAt time.Time) error
	GetNotebook(ctx context.Context, id string) (Notebook, error)
	ExtendNotebook(ctx context.Context, id string, authHash []byte, expiresAt time.Time) error
	ListItems(ctx context.Context, notebookID string) ([]ItemMeta, error)
	InsertItem(ctx context.Context, item Item, maxItems int, maxNotebookBytes int64) error
	GetItem(ctx context.Context, id string) (Item, error)
	DeleteItem(ctx context.Context, id string, authHash []byte) error
	Sweep(ctx context.Context, now time.Time) (notebooks, items int64, err error)
	Ping(ctx context.Context) error
	AuthLocked(ctx context.Context, notebookID string, now time.Time) (lockedUntil time.Time, ok bool, err error)
	RecordAuthFailure(ctx context.Context, notebookID string, now time.Time, maxFails int, window, lockFor time.Duration) (lockedUntil time.Time, locked bool, err error)
	ClearAuthFailures(ctx context.Context, notebookID string) error
}
