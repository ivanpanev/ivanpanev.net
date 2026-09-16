---
title: "Why this site exists"
date: 2026-09-16
summary: "A personal site as a long-running engineering project: what it is for, what it deliberately is not, and how it is built."
tags: [meta, sre]
draft: false
signed: false
---

I run infrastructure for a living. Most of what I learn doing that never gets
written down anywhere durable: it lives in incident channels, in runbooks that
rot, in the heads of the two people who were on call that night. This site is
an attempt to fix that for the part of it that is mine.

## What goes here

Three kinds of things:

1. **Essays.** Longer pieces about reliability, networking, security and the
   craft of operating systems other people depend on. Opinionated, revised
   when I change my mind, dated so you can tell.
2. **Project notes.** A small wiki of what I am building at home and on the
   side, written the way I would want a colleague's design doc to be written:
   decisions, alternatives, what broke.
3. **Tools.** The handful of calculators I keep reaching for. They run
   entirely in the browser and work offline.

## What deliberately is not here

No analytics, no third-party scripts, no cookie banner because there is
nothing to consent to. The site is a directory of static files served from an
edge cache; everything interactive is an island of JavaScript that loads only
where it is needed.

## How it is built

The site is an [Astro](https://astro.build) project with React islands,
deployed as static assets. Anything that needs a server lives on a separate
subdomain on a small Kubernetes cluster, so the site itself has no runtime to
break. The whole thing is a monorepo, and the decisions behind it are
recorded as architecture decision records.

Posts can be signed. When one is, the footer links to the raw Markdown, a
detached OpenPGP signature, and a page that verifies the pair in your browser
against the key published at this domain. Longer term that is the trust
anchor for everything else I publish.

```sh
# verify a post offline
curl -sO https://ivanpanev.net/raw/hello-world.md
curl -sO https://ivanpanev.net/signatures/hello-world.md.asc
gpg --locate-keys ivan@ivanpanev.net
gpg --verify hello-world.md.asc hello-world.md
```

More soon.
