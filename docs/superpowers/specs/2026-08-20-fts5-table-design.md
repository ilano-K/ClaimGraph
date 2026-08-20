# FTS5 Table Creation Design

Date: 2026-08-20

## Summary

Add a SQLite FTS5 virtual table `documents_fts` to the ClaimGraph backend for
full-text search over document content. Scope is limited to **table creation
only** — no ORM model, no CRUD helpers, no search routes, no triggers.

## Background

- The backend uses SQLAlchemy 2.0.51 on SQLite (`sqlite:///app.db`).
- Tables are created at startup in `main.py` lifespan via
  `Base.metadata.create_all(bind=engine)`.
- `Document` rows already store parsed markdown in `Document.content` (Text);
  documents are scoped by `workspace_id` and have a string `id`.
- FTS5 is built into SQLite; SQLAlchemy has no native FTS5 column type, so the
  virtual table must be created via raw DDL.

## Approach

Raw DDL executed at startup, idempotently with `IF NOT EXISTS`.

### New module: `backend/app/db/fts.py`

- Constant `FTS5_DDL`:

  ```sql
  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
  USING fts5(workspace_id UNINDEXED, document_id UNINDEXED, content)
  ```

- Function `ensure_fts5_table(engine) -> None`:
  - Opens a connection on the engine.
  - Runs `conn.exec_driver_sql(FTS5_DDL)`.
  - Uses the connection as a context manager so the transaction
    commits/rolls back cleanly.
  - No ORM session (`Session`) is involved.

### Wiring: `backend/app/main.py`

- In the `lifespan` context manager, immediately after
  `Base.metadata.create_all(bind=engine)`, call `ensure_fts5_table(engine)`.

### Schema details

- `workspace_id` — `UNINDEXED`: kept as a key so searches can be scoped to a
  workspace; not tokenized/ranked.
- `document_id` — `UNINDEXED`: identifies the source document row; not
  tokenized/ranked.
- `content` — the indexed, searchable content column.

## Out of scope (explicitly not built)

- ORM model for the FTS table.
- CRUD / search helper functions.
- Triggers keeping `documents_fts` in sync with `documents`.
- Any API routes or frontend search.

## Verification

1. Start the backend (or run a one-liner against the engine).
2. Confirm the table exists: introspect `app.db` and assert `documents_fts`
   appears in the schema.
3. Re-run startup a second time to confirm idempotency (`IF NOT EXISTS`),
   i.e. no error about an existing virtual table.