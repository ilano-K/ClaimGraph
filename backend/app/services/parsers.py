"""Document parsing layer.

Converts uploaded source files into Markdown (and optionally semantic chunks)
via the Docling library. The converter and chunker are module-level singletons
because model loading is expensive and must happen only once per process.
"""
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling.document_converter import DocumentConverter


converter = DocumentConverter()
chunker = HybridChunker(
    tokenizer="sentence-transformers/all-MiniLM-L6-v2",
    max_tokens=384,
    merge_peers=True,
)

def parse_document_to_markdown(file_path: str):
    """Convert the file at ``file_path`` to Markdown text for LLM extraction."""
    return converter.convert(file_path).document.export_to_markdown()

def parse_and_chunk_document(file_path: str):
    """Convert ``file_path`` and split it into semantic chunks (used for retrieval)."""
    result = converter.convert(file_path)
    doc = result.document
    
    chunk_generator = chunker.chunk(doc)
    
    chunks = []
    for chunk in chunk_generator:
        chunks.append(chunk)
    return chunks