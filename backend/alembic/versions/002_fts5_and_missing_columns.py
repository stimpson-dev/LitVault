"""FTS5 virtual table, triggers, and columns added after 001

Revision ID: 002
Revises: 001
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Spaltenliste aus Task-Step 1 übernehmen:
MISSING_COLUMNS = {
    "excluded": "BOOLEAN NOT NULL DEFAULT 0",
    "page_count": "INTEGER",
}

FTS_CREATE = (
    "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5("
    "title, authors, full_text, summary, file_path, "
    "content=documents, content_rowid=id, "
    "tokenize='porter unicode61 remove_diacritics 1')"
)

TRIGGERS = [
    """CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
    """CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
    END""",
    """CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(documents)")}
    for col, ddl in MISSING_COLUMNS.items():
        if col not in existing:
            conn.exec_driver_sql(f"ALTER TABLE documents ADD COLUMN {col} {ddl}")
    had_fts = conn.exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents_fts'"
    ).fetchone() is not None
    conn.exec_driver_sql(FTS_CREATE)
    for trig in TRIGGERS:
        conn.exec_driver_sql(trig)
    if not had_fts:
        conn.exec_driver_sql(
            "INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path) "
            "SELECT id, title, authors, full_text, summary, file_path FROM documents"
        )


def downgrade() -> None:
    raise NotImplementedError("Downgrade nicht unterstützt")
