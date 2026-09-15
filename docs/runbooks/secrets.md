# Secrets with SOPS and age

## Model

- Encrypted files are committed; plaintext never is. `.sops.yaml` at the
  repository root decides which files must be encrypted and for whom.
- Recipients are age public keys: the operator's workstation key and, from
  Milestone 3, one key per Kubernetes cluster (held by Argo CD's repo-server
  as a Secret). Adding a cluster means adding a recipient; no re-encryption
  ceremony tied to cluster hardware.
- File naming convention decides the rule: `*.enc.yaml`, `*.secret.yaml`
  (Kubernetes, only `data`/`stringData` encrypted), `*.enc.tfvars`,
  `*.enc.env`, and any other `*.enc.<ext>` (fully encrypted).

## Preconditions

- `sops` and `age` installed (`docs/toolchain.md`).
- Operator key generated with `scripts/sops-init.ps1` or `scripts/sops-init.sh`
  and its public key present in `.sops.yaml`.
- Private key backed up outside the machine (password manager). Loss of the
  key with no other recipient means loss of every encrypted value.

## Create an encrypted Kubernetes Secret

```
# write plaintext to a file that matches the naming rule
cat > k8s/infrastructure/example/credentials.secret.yaml <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: example-credentials
  namespace: example
type: Opaque
stringData:
  password: change-me
EOF

sops --encrypt --in-place k8s/infrastructure/example/credentials.secret.yaml
git add k8s/infrastructure/example/credentials.secret.yaml
```

Only the values under `stringData` are encrypted; the manifest remains
diffable and `kustomize build` sees a valid Secret once KSOPS decrypts it.

## Edit an encrypted file

```
sops k8s/infrastructure/example/credentials.secret.yaml
```

SOPS decrypts into your editor and re-encrypts on save.

## Decrypt for local use without writing plaintext to disk

```
sops --decrypt infra/terraform/hetzner/secrets.enc.tfvars > /dev/null   # sanity
terraform plan -var-file=<(sops --decrypt infra/terraform/hetzner/secrets.enc.tfvars)   # bash
```

On Windows PowerShell use a temporary file in `$env:TEMP` and delete it
afterwards, or pass values through `TF_VAR_*` environment variables read from
`sops --decrypt --output-type json`.

## How SOPS encryption is layered (read before rotating anything)

Each file has one random symmetric **data key** that encrypts the values.
The data key is then wrapped once per recipient (age public key). Two
commands touch this and they are not interchangeable:

| Command | Effect |
| --- | --- |
| `sops updatekeys FILE` | Re-wraps the *existing* data key for the current recipient set in `.sops.yaml`. Fast; does not change the data key. |
| `sops rotate --in-place FILE` | Generates a *new* data key, re-encrypts every value with it, wraps it for the current recipients. |

Consequence: removing a recipient with `updatekeys` alone does **not** revoke
them. Anyone who held the removed key and once decrypted the file (or
extracted its data key) can still decrypt every future revision, because the
data key is unchanged. Only `rotate` closes that.

## Add a recipient (new cluster, new operator machine)

1. Add the public key to `.sops.yaml` under `keys` and to every `key_groups`
   entry that should include it.
2. Re-wrap every managed file:
   ```
   scripts/sops-files.sh | xargs -n1 sops updatekeys --yes
   ```
3. Commit `.sops.yaml` and the files together.

## Remove a recipient, or respond to a suspected key compromise

1. Delete the recipient from `.sops.yaml` (all `key_groups` entries).
2. Rotate the data key of every managed file, then re-wrap:
   ```
   scripts/sops-files.sh | xargs -n1 sops rotate --in-place
   scripts/sops-files.sh | xargs -n1 sops updatekeys --yes
   ```
3. Verify the removed key can no longer decrypt (see the drill below).
4. Commit.
5. Every revision **before** this commit remains decryptable by the removed
   key in Git history forever. If the key was compromised (not merely
   retired), the underlying credentials in those files (Hetzner token,
   Cloudflare token, S3 keys, Grafana password, tunnel token...) must be
   regenerated at their source and the new values committed. Rotation of the
   SOPS layer protects future values only.

### Revocation drill (run once when setting this up, and after any real rotation)

```
# two throwaway keys standing in for "operator" and "compromised"
age-keygen -o /tmp/k1.txt; age-keygen -o /tmp/k2.txt
P1=$(grep -o 'age1[0-9a-z]*' /tmp/k1.txt); P2=$(grep -o 'age1[0-9a-z]*' /tmp/k2.txt)
printf 'apiVersion: v1\nkind: Secret\nmetadata: {name: t}\nstringData: {x: hello}\n' > /tmp/t.secret.yaml
sops --encrypt --age "$P1,$P2" --encrypted-regex '^(data|stringData)$' -i /tmp/t.secret.yaml
SOPS_AGE_KEY_FILE=/tmp/k2.txt sops -d /tmp/t.secret.yaml >/dev/null && echo "k2 can read (expected)"
# "remove" k2: rotate data key to k1 only
SOPS_AGE_KEY_FILE=/tmp/k1.txt sops rotate -i --rm-age "$P2" /tmp/t.secret.yaml
SOPS_AGE_KEY_FILE=/tmp/k2.txt sops -d /tmp/t.secret.yaml >/dev/null 2>&1 && echo "FAIL: k2 still reads" || echo "k2 revoked (expected)"
rm /tmp/k1.txt /tmp/k2.txt /tmp/t.secret.yaml
```

## Verify nothing leaked

Run before every push. CI (`.github/workflows/hygiene.yml`) runs the same
check: it derives the list of files from the `path_regex` rules in
`.sops.yaml` and asks SOPS itself whether each is encrypted.

```
scripts/sops-files.sh | while read -r f; do
  sops filestatus "$f" | grep -q '"encrypted": *true' || { echo "NOT ENCRYPTED: $f"; exit 1; }
done
```

`scripts/sops-files.sh` lists tracked files matching any creation rule; it is
the single definition used by the runbook and CI so the two cannot disagree.

## Rollback

Encrypted files are ordinary Git content; revert the commit. The age key
itself is never versioned; if a key file is lost, restore it from the backup
made in the preconditions.
