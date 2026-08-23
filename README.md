# ClaimGraph

ClaimGraph is a document analysis tool that extracts claims, evidence, and their relationships from PDF and DOCX files, visualizing them as an interactive knowledge graph.

## What it does

- **Upload documents** — Add PDF or DOCX files to workspaces
- **Analyze** — Extracts claims, evidence, methodology, limitations, risks, and consequences
- **Explore the graph** — Visualize how ideas connect (supports, limits, causes, challenges)
- **Chat with documents** — Ask questions and get answers grounded in your source material

## Tech Stack

**Frontend:** React + TypeScript + Tailwind CSS  
**Backend:** Python + FastAPI + SQLAlchemy  
**AI:** LLM-powered extraction and chat

## Development

### Prerequisites

- Node.js 18+ (frontend)
- Python 3.11+ (backend)
- MSVC C++ compiler (`cl.exe`) for Docling on Windows

### Running locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Windows: MSVC C++ compiler requirement

Docling (2.x) runs its torch models through `torch.compile()`, which requires the MSVC C++ compiler at runtime on Windows. Without it, PDF parsing fails with:

```
docling.exceptions.ConversionError: Conversion failed for: <file>.pdf
Errors: InvalidCxxCompiler: Compiler: cl is not found.
```

Fix: install Visual Studio Build Tools ("Desktop development with C++" workload), or disable model compilation with:

```powershell
$env:DOCLING_INFERENCE_COMPILE_TORCH_MODELS = "false"
```
