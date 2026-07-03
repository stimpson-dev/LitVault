"""Startup-Migrationen: Alembic ist die einzige Schema-Quelle."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.database import DB_PATH

logger = logging.getLogger("litvault.migrations")

BACKEND_DIR = Path(__file__).parent.parent


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{DB_PATH}")
    # Prevent alembic's env.py from calling fileConfig, which would disable
    # existing loggers (litvault.*) and suppress our startup log messages.
    cfg.config_file_name = None
    return cfg


def run_startup_migrations() -> None:
    cfg = _alembic_config()
    engine = create_engine(f"sqlite:///{DB_PATH}")
    with engine.connect() as conn:
        tables = set(inspect(conn).get_table_names())
    engine.dispose()
    if "documents" in tables and "alembic_version" not in tables:
        # Bestands-DB aus der create_all-Ära: Basis stempeln, dann Deltas fahren
        logger.info("Bestands-DB erkannt — stamp auf 001, dann upgrade")
        command.stamp(cfg, "001")
    command.upgrade(cfg, "head")
    logger.info("Alembic-Migrationen abgeschlossen (head)")
