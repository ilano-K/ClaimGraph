from app.services.parsers import parse_document_to_markdown


def test_docling_parses_fake_pdf_and_keeps_sentences(fake_pdf):
    md = parse_document_to_markdown(str(fake_pdf))
    assert "Hypergraph attention reduces computational requirements." in md
    assert "Sparse quantization preserves latency on consumer hardware." in md
    assert "Mixed precision training is a tradeoff of speed and accuracy." in md