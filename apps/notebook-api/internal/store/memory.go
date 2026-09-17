package store

import (
	"context"
	"crypto/subtle"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Memory is an in-process Store used by handler tests. Not for production.
type authState struct {
	failures    int
	windowStart time.Time
	lockedUntil time.Time
}

type Memory struct {
	mu        sync.Mutex
	notebooks map[string]Notebook
	items     map[string]Item
	auth      map[string]authState
	now       func() time.Time
}

func NewMemory() *Memory {
	return &Memory{
		notebooks: make(map[string]Notebook),
		items:     make(map[string]Item),
		auth:      make(map[string]authState),
		now:       time.Now,
	}
}

func (m *Memory) UpsertNotebook(_ context.Context, id string, authHash []byte, expiresAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if nb, ok := m.notebooks[id]; ok {
		expired := !nb.ExpiresAt.After(m.now())
		if !expired && subtle.ConstantTimeCompare(nb.AuthHash, authHash) != 1 {
			return ErrForbidden
		}
		if expired {
			hash := append([]byte(nil), authHash...)
			m.notebooks[id] = Notebook{ID: id, AuthHash: hash, CreatedAt: m.now(), ExpiresAt: expiresAt}
			return nil
		}
		if expiresAt.After(nb.ExpiresAt) {
			nb.ExpiresAt = expiresAt
			m.notebooks[id] = nb
		}
		return nil
	}
	hash := append([]byte(nil), authHash...)
	m.notebooks[id] = Notebook{ID: id, AuthHash: hash, CreatedAt: m.now(), ExpiresAt: expiresAt}
	return nil
}

func (m *Memory) GetNotebook(_ context.Context, id string) (Notebook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	nb, ok := m.notebooks[id]
	if !ok || !nb.ExpiresAt.After(m.now()) {
		return Notebook{}, ErrNotFound
	}
	return nb, nil
}

func (m *Memory) ExtendNotebook(_ context.Context, id string, authHash []byte, expiresAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	nb, ok := m.notebooks[id]
	if !ok || !nb.ExpiresAt.After(m.now()) {
		return ErrNotFound
	}
	if subtle.ConstantTimeCompare(nb.AuthHash, authHash) != 1 {
		return ErrForbidden
	}
	nb.ExpiresAt = expiresAt
	m.notebooks[id] = nb
	for id, it := range m.items {
		if it.NotebookID == nb.ID {
			it.ExpiresAt = expiresAt
			m.items[id] = it
		}
	}
	return nil
}

func (m *Memory) ListItems(_ context.Context, notebookID string) ([]ItemMeta, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	nb, ok := m.notebooks[notebookID]
	if !ok || !nb.ExpiresAt.After(m.now()) {
		return []ItemMeta{}, nil
	}
	out := make([]ItemMeta, 0)
	now := m.now()
	for _, it := range m.items {
		if it.NotebookID == notebookID && it.ExpiresAt.After(now) {
			out = append(out, ItemMeta{ID: it.ID, Kind: it.Kind, Size: it.Size, CreatedAt: it.CreatedAt, ExpiresAt: it.ExpiresAt})
		}
	}
	return out, nil
}

func (m *Memory) InsertItem(_ context.Context, item Item, maxItems int, maxNotebookBytes int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	nb, ok := m.notebooks[item.NotebookID]
	if !ok || !nb.ExpiresAt.After(m.now()) {
		return ErrNotFound
	}
	count := 0
	var total int64
	now := m.now()
	for _, it := range m.items {
		if it.NotebookID == item.NotebookID && it.ExpiresAt.After(now) {
			count++
			total += int64(it.Size)
		}
	}
	if count >= maxItems || total+int64(item.Size) > maxNotebookBytes {
		return ErrLimit
	}
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	if _, exists := m.items[item.ID]; exists {
		return ErrConflict
	}
	item.CreatedAt = now
	m.items[item.ID] = item
	return nil
}

func (m *Memory) GetItem(_ context.Context, id string) (Item, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	it, ok := m.items[id]
	if !ok || !it.ExpiresAt.After(m.now()) {
		return Item{}, ErrNotFound
	}
	nb, ok := m.notebooks[it.NotebookID]
	if !ok || !nb.ExpiresAt.After(m.now()) {
		return Item{}, ErrNotFound
	}
	return it, nil
}

func (m *Memory) DeleteItem(_ context.Context, id string, authHash []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	it, ok := m.items[id]
	if !ok {
		return ErrNotFound
	}
	nb, ok := m.notebooks[it.NotebookID]
	if !ok || !nb.ExpiresAt.After(m.now()) {
		return ErrNotFound
	}
	if subtle.ConstantTimeCompare(nb.AuthHash, authHash) != 1 {
		return ErrForbidden
	}
	delete(m.items, id)
	return nil
}

func (m *Memory) Sweep(_ context.Context, now time.Time) (int64, int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var nNB, nIt int64
	for id, it := range m.items {
		if !it.ExpiresAt.After(now) {
			delete(m.items, id)
			nIt++
		}
	}
	for id, nb := range m.notebooks {
		if !nb.ExpiresAt.After(now) {
			delete(m.notebooks, id)
			nNB++
		}
	}
	return nNB, nIt, nil
}

func (m *Memory) Ping(context.Context) error { return nil }

func (m *Memory) AuthLocked(_ context.Context, notebookID string, now time.Time) (time.Time, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	st, ok := m.auth[notebookID]
	if !ok || !st.lockedUntil.After(now) {
		return time.Time{}, false, nil
	}
	return st.lockedUntil, true, nil
}

func (m *Memory) RecordAuthFailure(_ context.Context, notebookID string, now time.Time, maxFails int, window, lockFor time.Duration) (time.Time, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	st := m.auth[notebookID]
	if now.Sub(st.windowStart) > window {
		st.failures = 0
		st.windowStart = now
	}
	st.failures++
	if st.failures >= maxFails {
		st.lockedUntil = now.Add(lockFor)
		m.auth[notebookID] = st
		return st.lockedUntil, true, nil
	}
	m.auth[notebookID] = st
	return time.Time{}, false, nil
}

func (m *Memory) ClearAuthFailures(_ context.Context, notebookID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.auth, notebookID)
	return nil
}
