# ADR 0003 — Field-aware change control with client-generated UUIDs

- **Status:** Accepted (2026-06-14)
- **Context area:** Type-A generalization — change-control granularity and identity

## Context

Two foundational choices for editing type-A rows: at what granularity changes are
tracked, and how new rows are identified under offline-first.

## Decision

**Field-aware change control.** A row is tracked as a structured set of fields,
not an opaque blob. This is what enables a structural diff (which fields changed),
per-field conflict detection, and auto-merge of non-overlapping edits (ADR 0004).
Within-field diffing (e.g. long text) remains the hard string-merge problem and
is deferred; field-awareness cleanly isolates it.

**Client-generated UUIDs.** The client mints a row's primary key
(`identity.clientGenerated = true`) rather than relying on a server
auto-increment. This lets rows be created offline with no coordination and no
create-time key collisions; the create is conflict-free on identity.

## Consequences

- **Positive:** offline-first create works with no server round-trip for an id;
  field-awareness unlocks structural diff and disjoint-field auto-merge; identity
  is stable across the client/server boundary from creation.
- **Negative / notes:** UUID keys are larger than serial ints (acceptable);
  field-level structure adds some bookkeeping vs a blob (paid back by merge/diff).
- Entities use `@PrimaryColumn('uuid')` (not generated). Inputs that carry the id
  need validation decorators (`@IsUUID`) because the global `ValidationPipe`
  (`whitelist: true`) strips undecorated properties.
