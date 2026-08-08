import os
from pathlib import Path

# Must be set before any `app.*` import so app.core.settings is satisfied
# without the real .env key (os.environ has higher precedence than .env).
os.environ["LLM_PROVIDER"] = "openai"
os.environ["LLM_API_KEY"] = "test-key"
os.environ["LLM_MODEL_NAME"] = "test-model"

import torch

# torch Inductor JIT-compiles C++ during the docling layout forward pass and
# needs MSVC's cl.exe (not installed on dev machines). Force eager mode.
torch.compile = lambda fn, *args, **kwargs: fn

import pytest
from fastapi.testclient import TestClient

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

FAKE_PDF_LINES = [
    "Hypergraph attention reduces computational requirements.",
    "Sparse quantization preserves latency on consumer hardware.",
    "Mixed precision training is a tradeoff of speed and accuracy.",
    "Our evaluation also examines throughput at small batch sizes.",
]


def build_fake_pdf() -> bytes:
    parts = [b"BT", b"/F1 11 Tf", b"72 700 Td"]
    for line in FAKE_PDF_LINES:
        parts.append(b"(" + line.encode() + b") Tj")
        parts.append(b"0 -24 Td")
    parts.append(b"ET")
    stream = b" ".join(parts) + b"\n"

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    out = bytearray()
    out += b"%PDF-1.4\n"
    offsets = {}
    for i, obj in enumerate(objects, start=1):
        offsets[i] = len(out)
        out += b"%d 0 obj\n" % i
        out += obj
        out += b"\nendobj\n"
    xref_offset = len(out)
    n_objs = len(objects) + 1
    out += b"xref\n0 %d\n" % n_objs
    out += b"0000000000 65535 f \n"
    for i in range(1, n_objs):
        out += b"%010d 00000 n \n" % offsets[i]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (n_objs, xref_offset)
    return bytes(out)


@pytest.fixture(scope="session")
def fake_pdf():
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    path = FIXTURES_DIR / "fake_paper.pdf"
    if not path.exists():
        path.write_bytes(build_fake_pdf())
    return path


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c