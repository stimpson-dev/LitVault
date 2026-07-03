"""db_path aus den Settings muss die tatsaechlich genutzte DB bestimmen.

Hintergrund: database.py hartkodierte backend/litvault.db, wodurch die
db_path-Einstellung wirkungslos war (und Test-Crawls in der Produktiv-DB
landeten).
"""
from pathlib import Path

from app import database, migrations

BACKEND_DIR = Path(database.__file__).resolve().parent.parent


def test_default_db_path_bleibt_backend_litvault_db():
    # Bestehende Installationen (db_path="litvault.db") duerfen sich nicht aendern
    assert database.resolve_db_path("litvault.db") == BACKEND_DIR / "litvault.db"


def test_absoluter_db_path_wird_unveraendert_uebernommen(tmp_path):
    target = tmp_path / "isolierte.db"
    assert database.resolve_db_path(str(target)) == target


def test_relativer_db_path_aufgeloest_gegen_backend_dir():
    # relativ zum backend/-Verzeichnis, nicht zum cwd
    assert database.resolve_db_path("data/custom.db") == BACKEND_DIR / "data" / "custom.db"


def test_migrationen_nutzen_dieselbe_db_wie_die_engine():
    # Eine Quelle der Wahrheit: migrations.py darf keinen eigenen Pfad bauen
    assert migrations.DB_PATH is database.DB_PATH
    cfg = migrations._alembic_config()
    assert cfg.get_main_option("sqlalchemy.url") == f"sqlite:///{database.DB_PATH}"
