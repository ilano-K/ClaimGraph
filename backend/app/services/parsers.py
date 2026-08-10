"""Document parsing layer.

Converts uploaded source files into Markdown (and optionally semantic chunks)
via the Docling library. The converter and chunker are module-level singletons
because model loading is expensive and must happen only once per process.
OCR is disabled because the layout/OCR stage downloads and loads several heavy
models (RapidOCR + torch) that routinely exhaust memory on text-heavy inputs;
text extraction via pdfium does not need them.
"""
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat
from docling.document_converter import DocumentConverter

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