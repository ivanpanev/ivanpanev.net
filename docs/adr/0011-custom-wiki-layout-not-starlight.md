# ADR-0011: Projects wiki as a custom Astro layout rather than Starlight

- Status: Accepted
- Date: 2026-09-16
- Deciders: Ivan Panev

## Context

The portfolio should read like a documentation wiki (sidebar, table of
contents, search). Starlight is Astro's excellent docs theme, but it owns the
page shell, ships its own theme tokens and components, and expects to be the
site. This project also has a blog, tools pages, and a multi-skin theme
system that must apply uniformly.

## Decision

The projects wiki is a `WikiLayout` inside `apps/web`: a sidebar generated
from the `projects` content collection (grouped by `section`, ordered by
`order`), a right-hand table of contents from Markdown headings, previous and
next navigation, and Pagefind search indexed at build time across posts and
projects. It shares `BaseLayout`, tokens, and components with the rest of
the site.

## Alternatives considered

- Starlight for the whole site with custom pages for blog and tools: two
  competing design systems; every skin would need to be re-implemented in
  Starlight's variables; upgrades could break overrides.
- A second Astro project (Starlight) deployed under a path: Workers Static
  Assets serve one asset collection per Worker; path-based multi-Worker
  routing is possible but adds a moving part for little gain.

## Consequences

- We write and maintain the sidebar/TOC/search wiring (a few hundred lines).
- Full control over look and behaviour; the skin switcher works everywhere.
- Revisit if the wiki grows beyond a few dozen pages and needs versioning or
  i18n, which Starlight handles well.
