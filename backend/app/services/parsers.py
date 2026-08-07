from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling.document_converter import DocumentConverter


converter = DocumentConverter()
chunker = HybridChunker(
    tokenizer="sentence-transformers/all-MiniLM-L6-v2",
    max_tokens=384,
    merge_peers=True,
)

def parse_document_to_markdown(file_path: str):
    return converter.convert(file_path).document.export_to_markdown()

def parse_and_chunk_document(file_path: str):
    result = converter.convert(file_path)
    doc = result.document
    
    chunk_generator = chunker.chunk(doc)
    
    chunks = []
    for chunk in chunk_generator:
        chunks.append(chunk)
    return chunks