-- +goose Up
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE items ADD CONSTRAINT items_kind_check CHECK (kind IN ('text', 'code', 'image', 'workspace'));

CREATE TABLE auth_attempts (
    notebook_id TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ
);

CREATE INDEX auth_attempts_locked_until_idx ON auth_attempts (locked_until);

-- +goose Down
DROP TABLE IF EXISTS auth_attempts;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE items ADD CONSTRAINT items_kind_check CHECK (kind IN ('text', 'code', 'image'));
