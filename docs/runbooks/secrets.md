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

## Rotate or add a recipient

1. Add the new public key to `.sops.yaml` under `keys` and to every
   `key_groups` entry that should include it.
2. Re-encrypt every managed file with the new recipient set:
   ```
   git ls-files | grep -E '\.(enc|secret)\.' | xargs -n1 sops updatekeys --yes
   ```
3. To remove a recipient, delete it from `.sops.yaml` and repeat step 2.
   Values encrypted before removal remain readable to the removed key in Git
   history; rotate the underlying secrets themselves if the key was
   compromised.
4. Commit `.sops.yaml` and the re-encrypted files together.

## Verify nothing leaked

Run before every push (CI enforces the same check from Milestone 3):

```
git ls-files | grep -E '\.(enc|secret)\.' | while read -r f; do
  grep -q '"sops":\|^sops:' "$f" || { echo "NOT ENCRYPTED: $f"; exit 1; }
done
```

## Rollback

Encrypted files are ordinary Git content; revert the commit. The age key
itself is never versioned; if a key file is lost, restore it from the backup
made in the preconditions.
