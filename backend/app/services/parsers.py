"""Document parsing layer.

Converts uploaded source files into Markdown (and optionally semantic chunks)
via the Docling library. The converter and chunker are module-level singletons
because model loading is expensive and must happen only once per process.
"""
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat
from docling.document_converter import DocumentConverter

import logging
import time

logger = logging.getLogger(__name__)

converter = DocumentConverter()

# _pipeline_options = PdfPipelineOptions(do_ocr=False)
# converter = DocumentConverter(
#     format_options={
#         InputFormat.PDF: PdfFormatOption(pipeline_options=_pipeline_options),
#     },
# )
chunker = HybridChunker(
    tokenizer="sentence-transformers/all-MiniLM-L6-v2",
    max_tokens=384,
    merge_peers=True,
)

def parse_document(file_path: str) -> tuple[str, list[str]]:
    """Convert ``file_path`` once and return ``(markdown, chunks)``.

    The Docling conversion is the expensive step (model load + inference), so
    callers should use this single entry point and derive both the Markdown
    (for LLM extraction / caching) and the semantic chunks (for FTS indexing)
    from the same parsed document rather than converting the file twice.
    """
    start = time.perf_counter()
    logger.info("parsing document: %s", file_path)
    result = converter.convert(file_path)
    document = result.document

    markdown = document.export_to_markdown()

    chunks = []
    for chunk in chunker.chunk(document):
        chunks.append(chunk.text)

    logger.info(
        "parsed document: %s in %dms (chunks=%d)",
        file_path,
        round((time.perf_counter() - start) * 1000),
        len(chunks),
    )
    return markdown, chunks