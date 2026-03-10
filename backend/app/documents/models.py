from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean,
    ForeignKey, LargeBinary, PrimaryKeyConstraint, text,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_path = Column(String, unique=True, nullable=False)
    file_hash = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mtime = Column(Float, nullable=True)
    title = Column(String, nullable=True)
    authors = Column(String, nullable=True)  # JSON array as string
    year = Column(Integer, nullable=True)
    doc_type = Column(String, nullable=True)
    source = Column(String, nullable=True)
    language = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    full_text = Column(Text, nullable=True)
    page_count = Column(Integer, nullable=True)
    has_text = Column(Boolean, default=False, nullable=False)
    doi = Column(String, nullable=True)
    processing_status = Column(String, default="pending", nullable=False)  # pending/processing/done/error
    classification_confidence = Column(Float, nullable=True)
    classification_source = Column(String, nullable=True)
    created_at = Column(String, server_default=text("datetime('now')"), nullable=False)
    updated_at = Column(String, server_default=text("datetime('now')"), nullable=False)
    indexed_at = Column(String, nullable=True)

    tags = relationship("Tag", secondary="document_tags", back_populates="documents")
    categories = relationship("Category", secondary="document_categories", back_populates="documents")
    embedding = relationship("Embedding", back_populates="document", uselist=False)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)

    documents = relationship("Document", secondary="document_tags", back_populates="tags")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)

    documents = relationship("Document", secondary="document_categories", back_populates="categories")


class DocumentTag(Base):
    __tablename__ = "document_tags"

    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, default="ai", nullable=False)

    __table_args__ = (PrimaryKeyConstraint("document_id", "tag_id"),)


class DocumentCategory(Base):
    __tablename__ = "document_categories"

    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, default="ai", nullable=False)

    __table_args__ = (PrimaryKeyConstraint("document_id", "category_id"),)


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    query = Column(Text, nullable=False)  # JSON encoded filter state
    created_at = Column(String, server_default=text("datetime('now')"), nullable=False)


class Favorite(Base):
    __tablename__ = "favorites"

    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    added_at = Column(String, server_default=text("datetime('now')"), nullable=False)


class Embedding(Base):
    __tablename__ = "embeddings"

    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    model = Column(String, nullable=False)
    vector = Column(LargeBinary, nullable=False)
    created_at = Column(String, server_default=text("datetime('now')"), nullable=False)

    document = relationship("Document", back_populates="embedding")
