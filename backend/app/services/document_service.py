from app.db.models import Document
from sqlalchemy.orm import Session
from fastapi import UploadFile
from typing import List
from app.enums.workspace import DocumentStatus
from app.db.crud import document as document_crud
from app.db.models import Document
import os
import time
import logging 
import shutil 
import uuid

logger = logging.getLogger(__name__)

def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


def process_upload_documents(
    db: Session,
    workspace_id: str,
    files: List[UploadFile],
) -> dict:
    """Persist uploaded files as workspace :class:`Document` rows.

    Written to guarantee that every Document row maps to its own unique bytes
    on disk:

    * Each upload is stored under a ``<uuid>-<name>`` filename, so Documents
      never share a ``file_path``. The original ``filename`` is kept untouched
      for display in the UI.
    * A file whose display name already exists in the workspace *replaces* the
      previous Document instead of adding a duplicate row.

    The previous implementation saved every upload to ``<workspace>/<name>``,
    so re-uploading a file with the same name overwrote the single on-disk file
    while creating extra Document rows — all pointing at identical bytes. At
    compile time those identical copies were collapsed by the LLM into one
    ``document_id``, which tripped the per-document validation and surfaced as
    ``InvalidLLMResponseError`` ("missing document_ids").

    Returns ``{"documents": [Document, ...]}`` to match the upload response
    schema.
    """
    start = time.perf_counter()
    logger.info("upload_documents entry workspace_id=%s files=%d", workspace_id, len(files))

    # Directory that holds every physical upload for this workspace.
    upload_dir = f"./claimgraph/data/{workspace_id}"
    os.makedirs(upload_dir, exist_ok=True)

    # The display filename is the identity of a document inside a workspace:
    # re-uploading a file updates that document rather than duplicating its
    # content (which previously broke graph compilation).
    existing_by_filename = {
        doc.filename: doc
        for doc in db.query(Document).filter(Document.workspace_id == workspace_id).all()
    }

    # Filenames already accepted within this batch, so a file listed twice in
    # a single request resolves to one document instead of conflicting rows.
    seen_filenames = set()

    created_documents = []
    for file in files:
        # Clients can send a full path; store only the safe base name.
        original_name = os.path.basename(file.filename or "upload")

        if original_name in seen_filenames:
            logger.info("upload_documents skipping duplicate filename=%s", original_name)
            continue
        seen_filenames.add(original_name)

        # Unique on-disk name (uuid prefix) so documents never collide on the
        # same path even when their display names match.
        storage_name = f"{uuid.uuid4()}-{original_name}"
        file_path = os.path.join(upload_dir, storage_name)

        # Write the new file BEFORE touching the existing document, so a
        # failed write cannot destroy the previous version being replaced.
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception:
            # Remove any partial file so a failed upload leaves no orphan.
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
            except OSError:
                pass
            raise

        # Replace the previous document with the same display name, including
        # its stale physical file. Best effort: failing to delete old bytes
        # must not fail the upload.
        existing = existing_by_filename.get(original_name)
        if existing is not None:
            db.delete(existing)
            try:
                if os.path.isfile(existing.file_path):
                    os.remove(existing.file_path)
            except OSError:
                logger.warning(
                    "upload_documents failed to remove replaced file path=%s",
                    existing.file_path,
                )

        # Save the new document record.
        doc = document_crud.create_document(
            db,
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            filename=original_name,
            file_path=file_path,
            status=DocumentStatus.NOT_ANALYZED,
            claim_count=0,
            evidence_count=0,
        )
        created_documents.append(doc)

    db.commit()
    for doc in created_documents:
        db.refresh(doc)

    logger.info(
        "upload_documents success in %dms documents=%d",
        _elapsed_ms(start),
        len(created_documents),
    )
    return {"documents": created_documents}