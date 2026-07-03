"""Test that the full Alembic migration chain produces the correct schema.

RED (before migration 004): running 001->002->003 leaves documents_fts with only
4 columns (file_path missing) because migration 002's CREATE VIRTUAL TABLE IF NOT
EXISTS is dead code when 001 already created the table.

GREEN (after migration 004): rebuild step detects the missing column and fixes it.
"""
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine

BACKEND_DIR = Path(__file__).parent.parent


def _make_cfg(url: str) -> Config:
    """Build an Alembic Config pointing at the given SQLite URL (same pattern as app/migrations.py)."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    # Prevent alembic's env.py from calling fileConfig, which would clobber our loggers.
    cfg.config_file_name = None
    return cfg


def test_migration_chain_produces_correct_schema(tmp_path):
    """Full alembic chain (001->002->003->004) must produce the expected schema on a fresh DB."""
    db_file = tmp_path / "test_migration_chain.db"
    url = f"sqlite:///{db_file}"

    cfg = _make_cfg(url)
    command.upgrade(cfg, "head")

    engine = create_engine(url)
    with engine.connect() as conn:
        # 1. documents table must have excluded and page_count columns (added in migration 002)
        doc_col_rows = conn.exec_driver_sql("PRAGMA table_info(documents)").fetchall()
        doc_cols = {row[1] for row in doc_col_rows}
        assert "excluded" in doc_cols, f"documents.excluded column missing; got: {sorted(doc_cols)}"
        assert "page_count" in doc_cols, f"documents.page_count column missing; got: {sorted(doc_cols)}"

        # 2. FTS columns must be exactly the 5-column set (title, authors, full_text, summary, file_path)
        fts_col_rows = conn.exec_driver_sql("PRAGMA table_info(documents_fts)").fetchall()
        fts_cols = [row[1] for row in fts_col_rows]
        assert fts_cols == ["title", "authors", "full_text", "summary", "file_path"], (
            f"FTS columns mismatch (expected 5 with file_path, got): {fts_cols}"
        )

        # 3. All three sync triggers must exist
        trig_rows = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='documents'"
        ).fetchall()
        trig_names = {row[0] for row in trig_rows}
        assert "documents_ai" in trig_names, f"documents_ai trigger missing; triggers: {trig_names}"
        assert "documents_ad" in trig_names, f"documents_ad trigger missing; triggers: {trig_names}"
        assert "documents_au" in trig_names, f"documents_au trigger missing; triggers: {trig_names}"

    engine.dispose()
