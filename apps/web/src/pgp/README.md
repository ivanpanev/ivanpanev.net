# Site OpenPGP key

Place the **public** key here as `publickey.asc` (armoured). The `wkd`
integration publishes it at build time:

- `/pgp/ivan.asc`
- `/.well-known/openpgpkey/hu/<hash>` (binary, WKD direct method)
- `/.well-known/openpgpkey/policy`

The build refuses private key material and a key without a user ID for the
site address. Until the file exists, `/pgp` and `/verify` render a
"not yet published" state and the build logs a warning.

How to generate the key hierarchy (offline certify key, signing subkey on a
hardware token) is in `docs/runbooks/pgp-key-ceremony.md`.
