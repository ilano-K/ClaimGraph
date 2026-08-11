import type { CompileResponse, WorkspaceResponse } from './types'

/**
 * Base URL of the ClaimGraph backend. Override per environment as needed
 * (e.g. via a Vite `env` var) when the server moves off localhost.
 */
export const API_BASE_URL = 'http://127.0.0.1:8000'

/** Centralized endpoint paths so a backend re-route is a one-line change. */
export const ENDPOINTS = {
  createWorkspace: `${API_BASE_URL}/workspaces/create`,
  uploadDocuments: (workspaceId: string) =>
    `${API_BASE_URL}/api/workspaces/${workspaceId}/documents/upload`,
  compileWorkspace: (workspaceId: string) =>
    `${API_BASE_URL}/api/workspaces/${workspaceId}/compile`,
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Could not reach the ClaimGraph server. Is it running?')
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export interface CreateWorkspaceInput {
  name: string
  description: string
}

export function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceResponse> {
  return request<WorkspaceResponse>(ENDPOINTS.createWorkspace, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function uploadDocuments(workspaceId: string, files: File[]): Promise<unknown> {
  const form = new FormData()
  for (const file of files) {
    form.append('files', file)
  }
  return request<unknown>(ENDPOINTS.uploadDocuments(workspaceId), {
    method: 'POST',
    body: form,
  })
}

export function compileWorkspace(workspaceId: string): Promise<CompileResponse> {
  return request<CompileResponse>(ENDPOINTS.compileWorkspace(workspaceId), {
    method: 'POST',
  })
}
