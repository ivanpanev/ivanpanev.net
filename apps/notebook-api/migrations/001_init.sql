-- +goose Up
CREATE TABLE notebooks (
    id TEXT PRIMARY KEY,
    auth_hash BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX notebooks_expires_at_idx ON notebooks (expires_at);

CREATE TABLE items (
    id UUID PRIMARY KEY,
    notebook_id TEXT NOT NULL REFERENCES notebooks (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'code', 'image')),
    nonce BYTEA NOT NULL,
    ciphertext BYTEA NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX items_notebook_id_idx ON items (notebook_id);
CREATE INDEX items_expires_at_idx ON items (expires_at);

-- +goose Down
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS notebooks;
