# Runbook: OpenPGP key ceremony

Creates the site's OpenPGP identity, publishes it, and wires post signing.
Run once; the "rotate" and "revoke" sections cover later events.

## Outcome

- One **certify-only primary key** (Ed25519), kept offline. It signs the
  subkeys and user IDs and nothing else.
- Three **subkeys**: sign (Ed25519), encrypt (Curve25519), authenticate
  (Ed25519). Only these live on the day-to-day machine, ideally on a hardware
  token (YubiKey/Nitrokey).
- Public key published at `/pgp/ivan.asc`, via WKD (direct method) at
  `/.well-known/openpgpkey/hu/<hash>`, and to `keys.openpgp.org`.
- Fingerprint printed on `/pgp`; Keyoxide profile linking the key to the
  domain and GitHub account.
- Git commit signing and `scripts/sign-post.sh` use the signing subkey.

The public half is committed as `apps/web/src/pgp/publickey.asc`. Private
material never enters the repository: `.gitignore` refuses `*secret*.asc`,
`*private*.asc`, `*.gpg`, `*.key`, and the build (`src/integrations/wkd.ts`)
fails if the file contains a private key.

## Preconditions

- GnuPG 2.4+ (`gpg --version`). Windows: `winget install GnuPG.Gpg4win` or
  use WSL. The commands below are identical on both.
- A clean, offline-capable machine or live USB for the primary key
  (recommended, not mandatory for a personal site; decide and note it in the
  "Ceremony record" at the end).
- Two storage devices for the primary key backup (e.g. two USB sticks or
  paper via `paperkey`).
- Optional: a hardware token with OpenPGP applet.

Set the identity once:

```bash
export IVP_NAME="Ivan Panev"
export IVP_EMAIL="ivan@ivanpanev.net"
export GNUPGHOME="$(mktemp -d)"   # scratch keyring for the ceremony
chmod 700 "$GNUPGHOME"
```

## 1. Generate the primary (certify-only) key

```bash
gpg --quick-generate-key "$IVP_NAME <$IVP_EMAIL>" ed25519 cert 5y
FPR=$(gpg --list-options show-only-fpr-mfpr --list-keys --with-colons "$IVP_EMAIL" | awk -F: '/^fpr/{print $10; exit}')
echo "$FPR"
```

Choose a strong passphrase (a 6-word diceware phrase from `/tools/secrets`
is fine). The 5-year expiry on the primary is a forcing function to revisit;
it can be extended later with the offline key.

## 2. Add the subkeys (1-year expiry, renewed annually)

```bash
gpg --quick-add-key "$FPR" ed25519 sign 1y
gpg --quick-add-key "$FPR" cv25519 encr 1y
gpg --quick-add-key "$FPR" ed25519 auth 1y
gpg -K --with-subkey-fingerprint "$IVP_EMAIL"
```

## 3. Export and back up

```bash
mkdir -p ceremony && cd ceremony
gpg --armor --export-secret-keys "$FPR"    > primary-secret.asc   # FULL secret key: offline media only
gpg --armor --export-secret-subkeys "$FPR" > subkeys-secret.asc   # what the daily machine / token gets
gpg --armor --export "$FPR"                > publickey.asc
gpg --gen-revoke "$FPR"                    > revocation.asc        # keep with the primary; anyone holding it can revoke
sha256sum *.asc > SHA256SUMS
```

Copy `primary-secret.asc`, `revocation.asc`, `SHA256SUMS` to both offline
devices. Verify each copy with `sha256sum -c SHA256SUMS`. Then wipe the
scratch keyring at the end of the ceremony (`rm -rf "$GNUPGHOME"`); the
primary secret must exist only on the offline media.

Never copy `primary-secret.asc` or `subkeys-secret.asc` into the repository
tree, not even temporarily; `.gitignore` is a backstop, not the control.

## 4. Provision the daily machine

Without a token:

```bash
unset GNUPGHOME
gpg --import ceremony/subkeys-secret.asc
gpg --import ceremony/publickey.asc
gpg -K "$IVP_EMAIL"    # primary shows as `sec#` (stub), subkeys as `ssb`
```

With a hardware token: import the full secret into the scratch keyring,
`gpg --edit-key "$FPR"`, `key 1` … `keytocard` for each subkey (slots 1
signature, 2 encryption, 3 authentication), save, then export the resulting
stubs (`--export-secret-subkeys`) and import those on the daily machine.
Set a PIN and admin PIN on the token first (`gpg --card-edit`, `admin`,
`passwd`).

Trust your own key: `gpg --edit-key "$FPR" trust` → `5` (ultimate).

## 5. Publish

1. Commit the public key:

   ```bash
   cp ceremony/publickey.asc apps/web/src/pgp/publickey.asc
   cd apps/web && pnpm build      # wkd integration validates the key and emits WKD files
   pnpm test -- wkd               # unit tests over the integration
   ```

   The build prints the WKD path; it must equal
   `/.well-known/openpgpkey/hu/$(gpg --with-wkd-hash -k "$IVP_EMAIL" | awk '/@ivanpanev.net/ && !/uid/ {print $1}' | cut -d@ -f1)`.

2. After deploy, verify WKD from a machine that has never seen the key:

   ```bash
   GNUPGHOME=$(mktemp -d) gpg --auto-key-locate clear,wkd --locate-keys "$IVP_EMAIL"
   ```

   and `curl -sI https://ivanpanev.net/.well-known/openpgpkey/policy` must
   return `200` with `access-control-allow-origin: *` (set in `public/_headers`).

3. Upload to the verifying keyserver and confirm the email it sends:
   `gpg --keyserver hkps://keys.openpgp.org --send-keys "$FPR"`.

4. Keyoxide: add proofs as notations and re-export/re-publish:

   ```bash
   gpg --edit-key "$FPR"
   # notation proof@ariadne.id=dns:ivanpanev.net?type=TXT
   # notation proof@ariadne.id=https://github.com/<user>/<gist-id>
   # save
   ```

   Add the DNS TXT `openpgp4fpr:<FPR>` in Cloudflare and the GitHub gist per
   the Keyoxide docs. `/pgp` links to `https://keyoxide.org/<FPR>`.

## 6. Configure signing

Git:

```bash
SIGN_KEYID=$(gpg -K --with-colons "$IVP_EMAIL" | awk -F: '$1=="ssb" && $12 ~ /s/ {print $5; exit}')
git config --global user.signingkey "${SIGN_KEYID}!"
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Add `publickey.asc` to GitHub → Settings → SSH and GPG keys so commits show
"Verified".

Posts:

```bash
export IVP_PGP_SIGNING_KEY="${SIGN_KEYID}!"
apps/web/scripts/sign-post.sh hello-world
```

This writes `src/content/signatures/hello-world.md.asc` and `.sha256` and
sets `signed: true`. The build re-hashes the post and fails if the bytes
changed after signing. `/verify?post=hello-world` must show "Good signature".

## 7. Annual renewal (subkeys)

On the offline machine with the primary imported into a scratch keyring:

```bash
gpg --quick-set-expire "$FPR" 1y '*'      # extend all subkeys
gpg --armor --export "$FPR" > publickey.asc
```

Re-publish (step 5). Existing signatures stay valid; the WKD hash does not
change because the user ID is unchanged.

## 8. Compromise or loss

- Signing subkey compromised: with the primary, `gpg --edit-key "$FPR"`,
  select the subkey, `revkey`, save, generate a replacement (step 2),
  re-publish. Re-sign posts with `sign-post.sh` (the old signatures were made
  by a revoked key and `/verify` will say so).
- Primary compromised or both backups lost: publish `revocation.asc`
  (`gpg --import revocation.asc && gpg --send-keys "$FPR"`), commit the
  revoked public key so WKD serves it too, and start this runbook again with
  a new key.

## Ceremony record

Append to `docs/security/pgp-ceremony-log.md` (create on first run; public
information only):

```
date, fingerprint, primary algo/expiry, subkey ids + expiry, where the
primary backups live (description, not location details), whether a token
is used (model, no serial), who performed it
```
