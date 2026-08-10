import pytest

from app.services.parsers import parse_document_to_markdown

from tests.conftest import FAKE_PDF_LINES, FAKE_PDF_LINES_2


@pytest.mark.parametrize(
    ("pdf_fixture", "expected_lines"),
    [
        ("fake_pdf", FAKE_PDF_LINES),
        ("fake_pdf_2", FAKE_PDF_LINES_2),
    ],
)
def test_docling_parses_fake_pdf_and_keeps_sentences(pdf_fixture, expected_lines, request):
    pdf = request.getfixturevalue(pdf_fixture)
    md = parse_document_to_markdown(str(pdf))
    for line in expected_lines:
        assert line in md