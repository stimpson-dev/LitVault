"""Indexes for search/browse hot paths

Revision ID: 003
Revises: 002

Index decisions based on EXPLAIN QUERY PLAN + data distribution (2969 rows):

CREATED:
- ix_documents_created_at  : browse sort path shows SCAN + USE TEMP B-TREE FOR ORDER BY;
                              index eliminates the sort step (default browse, highest priority)
- ix_documents_doc_type    : filter path shows SCAN; doc_type has good selectivity —
                              67.5 % NULL, and specific values like bericht (7 rows),
                              dissertation (34), artikel (119) are highly selective
- ix_documents_year        : filter path shows SCAN; year is sparsely populated (~18 non-NULL),
                              very selective for range queries

SKIPPED:
- ix_documents_file_type        : 95 % of rows are 'pdf' → near-zero selectivity for the most
                                   common filter value; SQLite correctly prefers a scan
- ix_documents_processing_status: 89.5 % of rows have status 'done' (the value used in facet
                                   queries) → index would not be used; SQLite prefers a scan
"""
from typing import Sequence, Union
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_documents_created_at", "documents", ["created_at"], if_not_exists=True)
    op.create_index("ix_documents_doc_type", "documents", ["doc_type"], if_not_exists=True)
    op.create_index("ix_documents_year", "documents", ["year"], if_not_exists=True)


def downgrade() -> None:
    for name in ("ix_documents_created_at", "ix_documents_doc_type", "ix_documents_year"):
        op.drop_index(name, table_name="documents", if_exists=True)
