# Entity-Relationship Diagram

The PostgreSQL schema (via TypeORM entities in `packages/database`). The schema is
the **[type-A](concepts.md#type-a)** tables (the generalized framework — `contacts`, `companies`,
`categories`, `tags`, `contact_tags`, and the Crate/music tables) plus the generic
`row_revisions` log and the framework `users`/`app_meta`. (The original single-note
feature and its `notes`/`note_revisions` tables were retired — migration
`DropNotes`.)

Every type-A table shares the same spine: a **client-generated `uuid` PK**, an
`int version` (optimistic concurrency), a `bool deleted` soft-delete tombstone, a
`jsonb metadata` escape hatch, and `created_at`/`updated_at`. They are driven by
`TableDescriptor`s and served by the generic engine (ADR 0009/0010).

```mermaid
erDiagram
  companies ||--o{ contacts : "company_id (soft ref)"
  categories ||--o{ categories : "parent_id (deferrable FK, set null)"
  contacts ||--o{ contact_tags : "deferrable FK (cascade)"
  tags ||--o{ contact_tags : "deferrable FK (cascade)"
  contacts ||--o{ row_revisions : "history (polymorphic, no FK)"

  users {
    uuid id PK
    text email UK
    text password_hash
    timestamp created_at
    timestamp updated_at
  }
  contacts {
    uuid id PK
    text first_name
    text last_name
    text email
    text phone
    uuid company_id "soft ref -> companies"
    int version
    bool deleted
    jsonb metadata
  }
  companies {
    uuid id PK
    text name
    int version
    bool deleted
    jsonb metadata
  }
  categories {
    uuid id PK
    text name
    uuid parent_id FK "self, deferrable"
    int version
    bool deleted
    jsonb metadata
  }
  tags {
    uuid id PK
    text name
    int version
    bool deleted
    jsonb metadata
  }
  contact_tags {
    uuid id PK
    uuid contact_id FK "deferrable"
    uuid tag_id FK "deferrable"
    int version
    bool deleted
    jsonb metadata
  }
  row_revisions {
    uuid id PK
    text table_name "which table"
    uuid row_id "polymorphic ref"
    jsonb data
    int version
    text client_id
    enum conflict_status
  }
```

## Relationship / constraint legend

The diagram's cardinalities are standard, but the **kind** of link varies — this
is deliberate and central to the offline-first design:

| Link | Kind | Why |
|------|------|-----|
| `contacts.company_id → companies` | **Soft reference — no DB FK** | ADR 0005: rows sync offline-first from independent collections; a hard FK would reject a child that reaches the server before its parent. Integrity is advisory; a dangling id renders as `(unknown)`. |
| `categories.parent_id → categories` | **Deferrable FK** (`SET NULL`, `INITIALLY DEFERRED`) | Self-referential tree; deferring lets a parent + child sync in one batch in any order (ADR 0006). |
| `contact_tags.contact_id/tag_id → contacts/tags` | **Deferrable FKs** (`CASCADE`) | The M:N join row has two parents; deferred constraints + DB∪batch validation let the whole graph commit atomically (ADR 0007). A partial unique index `(contact_id, tag_id) WHERE deleted = false` keeps one active link. |
| `row_revisions → (any revisioned table)` | **Polymorphic, no FK** | Keyed by `(table_name, row_id)`; one log serves every revisioned table (today only `contacts`). ADR 0010. |

## Notes on the type-A spine

- **`version`** drives optimistic concurrency; the generic applier bumps it on
  every accepted write and detects conflicts on a mismatch.
- **`deleted`** is a tombstone (not a row removal) so deletions replicate.
- **`row_revisions`** is the field-aware history + the 3-way-merge common
  ancestor for `revisioned` tables (ADR 0010).
- **`conflict_status`** (`none` / `detected` / `resolved`) is the
  `row_revisions_conflict_status_enum` on `row_revisions`.

## See also

- [../platform-architecture.md](../platform-architecture.md) `## Data model` — points at this doc; also the deployment topology and ADR index.
- [adr/0010-generic-revisions-merge-conflict.md](adr/0010-generic-revisions-merge-conflict.md) — the revision-log design that shapes the polymorphic `row_revisions`.
- [adr/0005-soft-foreign-key-references.md](adr/0005-soft-foreign-key-references.md) — why some references are soft (un-enforced) rather than hard FKs.
- [example-app-spec.md](example-app-spec.md) — the type-A app-spec template (worked for Crate); the ERD is the shape a spec expands into.
- [README.md](README.md) — the documentation landing index.
