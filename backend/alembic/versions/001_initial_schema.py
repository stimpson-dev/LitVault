"""Initial schema with FTS5

Revision ID: 001
Revises:
Create Date: 2026-03-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Create all tables via autogenerate-like approach
    op.create_table('documents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('file_hash', sa.String(), nullable=False),
        sa.Column('file_type', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mtime', sa.Float(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('authors', sa.String(), nullable=True),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('doc_type', sa.String(), nullable=True),
        sa.Column('source', sa.String(), nullable=True),
        sa.Column('language', sa.String(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('full_text', sa.Text(), nullable=True),
        sa.Column('has_text', sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column('doi', sa.String(), nullable=True),
        sa.Column('processing_status', sa.String(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column('classification_confidence', sa.Float(), nullable=True),
        sa.Column('classification_source', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False, server_default=sa.text("datetime('now')")),
        sa.Column('updated_at', sa.String(), nullable=False, server_default=sa.text("datetime('now')")),
        sa.Column('indexed_at', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('file_path')
    )

    op.create_table('tags',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    op.create_table('categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    op.create_table('document_tags',
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(), nullable=False, server_default=sa.text("'ai'")),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('document_id', 'tag_id')
    )

    op.create_table('document_categories',
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(), nullable=False, server_default=sa.text("'ai'")),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('document_id', 'category_id')
    )

    op.create_table('saved_searches',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('query', sa.Text(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False, server_default=sa.text("datetime('now')")),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    op.create_table('favorites',
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('added_at', sa.String(), nullable=False, server_default=sa.text("datetime('now')")),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('document_id')
    )

    op.create_table('embeddings',
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('vector', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False, server_default=sa.text("datetime('now')")),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('document_id')
    )

    # FTS5 virtual table (external content, synced via triggers)
    op.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            title, authors, full_text, summary,
            content=documents, content_rowid=id,
            tokenize='porter unicode61 remove_diacritics 1'
        )
    """)

    # Triggers to keep FTS5 in sync
    op.execute("""
        CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
            INSERT INTO documents_fts(rowid, title, authors, full_text, summary)
            VALUES (new.id, new.title, new.authors, new.full_text, new.summary);
        END
    """)

    op.execute("""
        CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
            INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary)
            VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary);
        END
    """)

    op.execute("""
        CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
            INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary)
            VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary);
            INSERT INTO documents_fts(rowid, title, authors, full_text, summary)
            VALUES (new.id, new.title, new.authors, new.full_text, new.summary);
        END
    """)

    # Seed categories
    op.execute("INSERT INTO categories (name) VALUES ('Verzahnungsgrundlagen')")
    op.execute("INSERT INTO categories (name) VALUES ('Kegelrad / Hypoid / Stirnrad')")
    op.execute("INSERT INTO categories (name) VALUES ('Tragbild / Kontakt / NVH')")
    op.execute("INSERT INTO categories (name) VALUES ('FEM / Spannungen / Lebensdauer')")
    op.execute("INSERT INTO categories (name) VALUES ('Werkstoffe / Wärmebehandlung')")
    op.execute("INSERT INTO categories (name) VALUES ('Fertigung / Schleifen / Honen / Härten')")
    op.execute("INSERT INTO categories (name) VALUES ('Prüfstand / Versuch / Schadensanalyse')")
    op.execute("INSERT INTO categories (name) VALUES ('Normen / ISO / DIN / AGMA / FVA')")
    op.execute("INSERT INTO categories (name) VALUES ('Anwendungen / Differential / E-Achse / Nutzfahrzeug')")
    op.execute("INSERT INTO categories (name) VALUES ('Interne Berichte / Projektdokumente')")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS documents_au")
    op.execute("DROP TRIGGER IF EXISTS documents_ad")
    op.execute("DROP TRIGGER IF EXISTS documents_ai")
    op.execute("DROP TABLE IF EXISTS documents_fts")
    op.drop_table('embeddings')
    op.drop_table('favorites')
    op.drop_table('saved_searches')
    op.drop_table('document_categories')
    op.drop_table('document_tags')
    op.drop_table('categories')
    op.drop_table('tags')
    op.drop_table('documents')
