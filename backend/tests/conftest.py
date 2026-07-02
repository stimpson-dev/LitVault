import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.documents import models  # noqa: F401 — Modelle registrieren

FTS_SETUP = [
    """CREATE VIRTUAL TABLE documents_fts USING fts5(
        title, authors, full_text, summary, file_path,
        content=documents, content_rowid=id,
        tokenize='porter unicode61 remove_diacritics 1')""",
    """CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
    """CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
        VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
        INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
        VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
    END""",
]

SEED = [
    # (file_path, title, year, doc_type, file_type, processing_status, full_text)
    ("a/kegelrad.pdf", "Kegelrad Tragfähigkeit", 2019, "bericht", "pdf", "done", "Untersuchung der Tragfähigkeit von Kegelrädern unter Last"),
    ("a/stirnrad.pdf", "Stirnradgetriebe NVH", 2021, "paper", "pdf", "done", "NVH Analyse von Stirnradgetrieben"),
    ("b/norm.pdf", "ISO 10300", 2014, "norm", "pdf", "done", "Tragfähigkeitsberechnung von Kegelrädern nach ISO"),
    ("b/notiz.docx", "Interne Notiz", None, "interne_notiz", "docx", "error", None),
]


@pytest.fixture
async def db_session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in FTS_SETUP:
            await conn.execute(text(stmt))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        for fp, title, year, dt, ft, status, ftxt in SEED:
            await session.execute(text(
                "INSERT INTO documents (file_path, file_hash, file_type, title, year, doc_type,"
                " processing_status, has_text, excluded, full_text, created_at, updated_at)"
                " VALUES (:fp, :fh, :ft, :title, :year, :dt, :status, :has_text, 0, :ftxt,"
                " datetime('now'), datetime('now'))"
            ), {"fp": fp, "fh": f"hash-{fp}", "ft": ft, "title": title, "year": year,
                "dt": dt, "status": status, "has_text": ftxt is not None, "ftxt": ftxt})
        await session.commit()
        yield session
    await engine.dispose()
