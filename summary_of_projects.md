## Goal
Turn ClaimGraph workspaces into "project spaces": uploading documents only lists them; each document is analyzed individually (per-document standalone claim graph) on demand; navigation becomes Dashboard → Project Space (doc list) → Graph (per-doc), with Back each step.

## Important Details
- Decisions confirmed via brainstorming: project space = Workspace (same entity, new detail view); per-document standalone graphs, strictly per-document Analyze buttons (no batch); onboarding ends at doc list (no processing/ready step); chat is per-document; legacy workspace `graph_payload` ignored/not read (no backfill).
- Backend: `Document.graph_payload` (JSON, nullable) is the single source of graph data; `Workspace.graph_payload` retained but unused; `DocumentStatus` = `not_analyzed`/`analyzing`/`ready`/`failed`; old workspace-level compile/recompile/chat endpoints removed.
- Routes: `POST /{workspace_id}`, `POST /{workspace_id}/documents/{document_id}/compile`, `POST /{workspace_id}/documents/{document_id}/chat` (all under `/api/workspaces`). `POST /create` must be declared before `POST /{workspace_id}` (FastAPI literal-vs-param ordering) — already done.
- Pre-existing (not caused by this work) test failures: `test_llm_structured.py::test_chat_structured_prepends_system_message`, `test_logging.py::test_graph_service_logs_llm_call`, `test_logging.py::test_llm_client_logs_model` (assert old model name `openrouter/free`, now `deepseek-v4-flash`), `test_services.py::test_generate_claim_graph_serializes_documents_as_json` (asserts old pre-labeling `["0","1"]` behavior). Model constant is `COMPILE_MODEL` / `DEFAULT_MODEL`.

## Work State
### Completed
- Design doc: `docs/superpowers/specs/2026-08-20-project-space-design.md` (written, not committed).
- Backend rewrite (verified: 49 tests pass, 4 pre-existing failures remain):
  - `backend/app/enums/workspace.py`: DocumentStatus → NOT_ANALYZED/ANALYZING/READY/FAILED.
  - `backend/app/db/models.py`: Document.graph_payload JSON column added.
  - `backend/app/db/database.py`: `ensure_document_graph_payload_column()` (PRAGMA + ALTER TABLE); wired into backend lifespan after `create_all`.
  - `backend/app/schemas/workspace.py`: DocumentResponse gains `graph_payload`; WorkspaceResponse gains `documents: List[DocumentResponse]`.
  - `backend/app/services/workspace_service.py`: new `get_workspace_detail`, `compile_document`, `mark_document_failed`; removed `compile_workspace`, `recompile_workspace`, `execute_rollback_on_error`; upload creates NOT_ANALYZED docs; missing-file check moved inside try so doc marks FAILED.
  - `backend/app/api/routes/workspaces.py`: per-doc compile/chat, detail route, `/create` before `/{workspace_id}`; removed compile/recompile/chat.
  - `backend/app/services/chat_service.py`: `process_chat_with_document(workspace_id, document_id, payload, db)`.
  - `backend/app/llm/agent/graph.py` + `tools.py`: `build_agent_graph(db, workspace_id, document_id)`; FTS search filters `document_id`.
  - Tests rewritten: `backend/tests/test_api.py`, `backend/tests/test_workspace_graph_db.py`, `backend/tests/test_logging.py` (now uses `compile_document`, `upload_and_get_document_ids`); fixed pre-existing stale import in `backend/tests/test_parser.py`; `backend/tests/test_text_cleanup.py` now asserts legacy payload passes through untouched. Upload response's `documents` field is an id list `[doc["id"] ...]` (used by test helpers).
- Frontend rewrite (verified this session: `npm run typecheck` and `npm run build` both pass):
  - `frontend/src/api/types.ts`: `WorkspaceDocument` + `WorkspaceDocumentStatus`; `WorkspaceResponse.documents`.
  - `frontend/src/api/client.ts`: ENDPOINTS `workspaceDetail`, `compileDocument`, `chatWithDocument`; removed compileWorkspace/recompileWorkspace/chatWithWorkspace; added `getWorkspaceDetail`, `compileDocument`, `chatWithDocument`.
  - `frontend/src/lib/mapWorkspace.ts`: card model (doc counts, summed claims/evidence, status from docs).
  - `frontend/src/components/dashboard/WorkspaceCard.tsx`: always "Open Project Space" button; StatusBadge; no recompile prop.
  - `frontend/src/components/dashboard/Dashboard.tsx`: fully rewritten — imports cleaned (no ContextualError), state `recompilingId`/`recompileErrors`/`handleRecompile` removed, card render passes `onOpen={() => record && onOpenWorkspace(record)}` only.
  - `frontend/src/components/project/ProjectSpace.tsx` (new): fetches `getWorkspaceDetail`; doc list with status badges (un-analyzed/analyzing/ready/failed), per-doc Analyze + Re-analyze buttons with optimistic status + inline error rows + single in-flight lock, Open Graph only when ready, Add Documents uploader, empty state, Back-to-dashboard, header shows doc/analyzed counts.
  - `frontend/src/components/onboarding/OnboardingFlow.tsx`: steps welcome→workspace→upload only; `handleFinishUpload` uploads via `uploadDocuments` then `onOpenWorkspace` (no compile); `compileWorkspace` import removed; passes `isSubmitting` to UploadStep.
  - `frontend/src/components/onboarding/UploadStep.tsx`: added `isSubmitting` prop; button now "Upload N Files" spinner + disabled state during upload.
  - `frontend/src/components/inspector/GraphChatSection.tsx`: uses `chatWithDocument(workspaceId, documentId, text)`; header/placeholder show `documentName`; comment "document agent".
  - `frontend/src/components/inspector/InspectionPanel.tsx`: added `documentName` prop, passes workspaceId/documentId/documentName to GraphChatSection.
  - `frontend/src/components/layout/TopNavBar.tsx`: props now `{ workspaceName, documentName, onBack }`; shows workspace name + document filename under brand; right action "Back to Project"; recompile/error/home button removed.
  - `frontend/src/App.tsx`: screens `onboarding|dashboard|project|graph`; `handleOpenWorkspace` → project (clears graph/doc); `handleOpenGraph(doc)` maps `doc.graph_payload` → graph; `handleGraphCompiled`/`handleRecompile`/`recompileError`/`isRecompiling` removed; graph screen renders TopNavBar(back→project) + GraphCanvas + InspectionPanel(documentId/documentName); fallback "No Graph Loaded" → dashboard.

### Blocked
- None for remaining implementation.

## Next Move
1. Commit the work (backend + frontend + design doc) if user wants.
2. Optionally triage the 4 pre-existing backend test failures (stale model-name / serialization assertions) — they predate this work.
3. Optional cleanup: remove now-unused `UploadedFile`/`UploadedDocument`/`ProcessingPhase` types from `frontend/src/api/types.ts` (still used by onboarding steps) and the classic `dashboardData` sample payloads.

## Relevant Files
- `docs/superpowers/specs/2026-08-20-project-space-design.md`: approved design (uncommitted).
- Backend (all done): `backend/app/services/workspace_service.py`, `backend/app/api/routes/workspaces.py`, `backend/app/db/models.py`, `backend/app/db/database.py`, `backend/app/main.py`, `backend/app/enums/workspace.py`, `backend/app/schemas/workspace.py`, `backend/app/llm/agent/graph.py`, `backend/app/llm/agent/tools.py`, `backend/app/services/chat_service.py`.
- Backend tests (all done): `backend/tests/test_api.py`, `backend/tests/test_workspace_graph_db.py`, `backend/tests/test_logging.py`, `backend/tests/test_parser.py`, `backend/tests/test_text_cleanup.py`.
- Frontend (all done): `frontend/src/App.tsx`, `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/lib/mapWorkspace.ts`, `frontend/src/components/dashboard/Dashboard.tsx`, `frontend/src/components/dashboard/WorkspaceCard.tsx`, `frontend/src/components/project/ProjectSpace.tsx`, `frontend/src/components/onboarding/OnboardingFlow.tsx`, `frontend/src/components/onboarding/UploadStep.tsx`, `frontend/src/components/inspector/GraphChatSection.tsx`, `frontend/src/components/inspector/InspectionPanel.tsx`, `frontend/src/components/layout/TopNavBar.tsx`.
- Optional cleanup targets: `frontend/src/data/dashboardData.ts` (WorkspaceSummary/WorkspaceMetric sample payloads — types still used by mapWorkspace), `frontend/src/api/types.ts` (legacy UploadedFile/UploadedDocument/ProcessingPhase — still used by onboarding steps).