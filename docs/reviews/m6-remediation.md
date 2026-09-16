# Milestone 6 remediation (round 1 → 2)

| ID | Change |
| --- | --- |
| M6-R1-F01 | `global.env` sets `AUTHENTIK_POSTGRESQL__HOST=authentik-rw` (plus name/port). `k8s-validate.sh` fails if HOST is missing. Dead `authentik.postgresql.*` removed. |
| M6-R1-F02 | CNPG mints `authentik-app`; password/user via `secretKeyRef`. Removed `authentik-db` SOPS secret. `authentik-config` is `AUTHENTIK_SECRET_KEY` only. |
| M6-R1-F03 | `ivp.net/config-epoch` podAnnotation on server/worker; runbook + secrets.md require bump or `rollout restart`. |
| M6-R1-F04 | `serviceAccount.create: false` (no outpost Role). |
| M6-R1-F06 | CNPG incident checks name both `notebook` and `authentik` prefixes. |
| M6-R1-F07 | Architecture mermaid tunnel list includes `auth.` |
| M6-R1-F08 | cost.md and platform-threat-model.md titles say updated Milestone 6. |
