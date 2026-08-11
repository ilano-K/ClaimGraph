from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.models import Document
from app.enums.workspace import DocumentStatus

def create_document(
    db: Session,
    *,
    id: str,
    workspace_id: str,
    filename: str,
    file_path: str, 
    status: DocumentStatus,
    claim_count: int,
    evidence_count: int,
    tradeoff_count: int,
) -> Document:
    document = Document(
        id=id,
        workspace_id=workspace_id,
        filename=filename,
        file_path=file_path,
        status=status,
        claim_count=claim_count,
        evidence_count=evidence_count,
        tradeoff_count=tradeoff_count,
    )

    db.add(document)

    return document

def create_documents(
    db: Session,
    documents: list[Document],
) -> list[Document]:
    db.add_all(documents)

    return documents

def get_document(
    db: Session,
    id: str,
) -> Document | None:
    stmt = select(Document).where(Document.id == id)

    return db.scalar(stmt)

def update_document(
    db: Session,
    document: Document,
) -> Document:
    return document

def delete_document(
    db: Session,
    document: Document,
) -> None:
    db.delete(document)