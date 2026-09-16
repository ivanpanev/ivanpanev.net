# Post signatures

One pair of files per signed post, produced by `scripts/sign-post.sh <id>`:

- `<id>.md.asc` — detached ASCII-armoured OpenPGP signature over the exact
  bytes of `src/content/posts/<id>.md`.
- `<id>.md.sha256` — SHA-256 of those bytes at signing time. The
  `signed-posts` integration recomputes it at build and fails the build if
  the post changed after it was signed.

The build copies `.asc` files to `/signatures/` and every published post to
`/raw/`. Nothing here is secret. The private key never enters this
repository; see `docs/runbooks/pgp-key-ceremony.md`.
