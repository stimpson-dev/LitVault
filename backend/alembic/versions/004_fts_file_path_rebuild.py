"""Rebuild FTS5 table if file_path column is missing (fresh-install gap).

Revision ID: 004
Revises: 003
Create Date: 2026-07-03

Background
----------
Migration 001 created documents_fts with 4 columns (no file_path) and matching
triggers. Migration 002's CREATE VIRTUAL TABLE IF NOT EXISTS with 5 columns was
dead code when the table already existed — so a fresh install ends up with a
4-column FTS table and 4-column triggers, missing file_path.

The user's existing (pre-migration) DB already has 5 columns and is unaffected
because the stamp-at-001 path skips this rebuild (file_path is present in the SQL).
"""
from typing import Sequence, Union
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# DDL duplicated verbatim from migration 002 constants
_FTS_CREATE = (
    "CREATE VIRTUAL TABLE documents_fts USING fts5("
    "title, authors, full_text, summary, file_path, "
    "content=documents, content_rowid=id, "
    "tokenize='porter unicode61 remove_diacritics 1')"
)

_TRIGGERS = [
    """CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
    """CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
    END""",
    """CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
]


def upgrade() -> None:
    conn = op.get_bind()

    # Check whether the existing FTS table already has file_path
    row = conn.exec_driver_sql(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents_fts'"
    ).fetchone()
    fts_sql = row[0] if row else ""

    if "file_path" not in fts_sql:
        # Fresh-install case: 4-column FTS table from migration 001.
        # Drop old triggers, drop table, recreate everything with 5 columns.
        for trig in ("documents_ai", "documents_ad", "documents_au"):
            conn.exec_driver_sql(f"DROP TRIGGER IF EXISTS {trig}")
        conn.exec_driver_sql("DROP TABLE IF EXISTS documents_fts")
        conn.exec_driver_sql(_FTS_CREATE)
        for trig_sql in _TRIGGERS:
            conn.exec_driver_sql(trig_sql)
        conn.exec_driver_sql(
            "INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path) "
            "SELECT id, title, authors, full_text, summary, file_path FROM documents"
        )
    # else: file_path already present (real DB stamped at 001) — no-op


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported")
