---
title: "Encrypted quick notebook"
section: software
order: 10
status: idea
stack: [Go, PostgreSQL, WebCrypto, Argon2id]
summary: "Paste text, code or an image behind a passcode; the server stores ciphertext it cannot read and forgets it after a week."
updated: 2026-09-16
---

## Problem

I want to move a snippet between machines without a messaging app, a cloud
drive or trusting the thing in the middle. The requirements are small:

- a passcode is the only credential; no accounts;
- the same passcode from any device opens the same notebook;
- the server never sees plaintext;
- items expire on their own (default 24 hours, maximum 7 days).

## Design

The passcode is stretched with Argon2id in the browser into 96 bytes, split
into three keys:

| Key | Purpose | Leaves the browser? |
| --- | --- | --- |
| lookup key | `notebookId = SHA-256(lookupKey)` names the notebook | as its hash only |
| auth key | `authProof = SHA-256(authKey)` authorises writes | as the proof; server stores `SHA-256(authProof)` |
| encryption key | AES-256-GCM for every item | never |

A leaked database yields ciphertext plus hashes of hashes: nothing replayable
and nothing readable. A compromised running server could delete or overwrite
items for notebooks that were open during the compromise window, but not
read them.

## Trade-off

Two people who choose the same passcode share a notebook. That is inherent to
"passcode is the only credential". The UI enforces a minimum length, offers a
generated passphrase and says so plainly.

## Status

Design accepted (ADR-0009). Implementation is Milestone 4.
