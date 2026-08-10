from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.models import Document

def create_document(
    db: Session, id: str, 
    workspace_id: str, filename: str,
    claim_count: int, evidence_count: int, 
    tradeoff_count: int    
) -> Document:
    document = Document(
        id=id,
        workspace_id= workspace_id,
        filename=filename,
        claim_count=claim_count,
        evidence_count=evidence_count,
        tradeoff_count=tradeoff_count
    )
    
    db.add(document)
    db.commit()
    db.refresh(document)

    return document

def get_document(db: Session, id: str) -> Document | None:
    stmt = select(Document).where(Document.id == id)
    
    return db.scalar(stmt)

def update_document(db: Session, document: Document) -> Document:
    db.commit()
    db.refresh(document)
    return document

def delete_document(db: Session, document: Document) -> None:
    db.delete(document)
    db.commit
    