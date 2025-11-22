export type DocumentPayload = {
  id: string
  title: string
  content: string
  updatedAt: string
  archivedAt?: string | null
}

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://100.100.27.52:25010'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DEFAULT_BACKEND_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => 'unknown error')
    throw new Error(`API ${response.status}: ${detail}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function syncDocument(payload: DocumentPayload) {
  return request('/documents', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function fetchDocuments() {
  const result = await request<{ documents: DocumentPayload[] }>('/documents', {
    method: 'GET'
  })
  return result.documents
}

export async function fetchArchivedDocuments() {
  const result = await request<{ documents: ArchivedDocumentResponse[] }>('/documents/archived', {
    method: 'GET'
  })
  return result.documents
}

export async function deleteDocumentPermanently(id: string) {
  const result = await request<{ document: { id: string; removedAttachments: number } }>(`/documents/${id}`, {
    method: 'DELETE'
  })
  return result.document
}

export async function archiveDocument(id: string) {
  const result = await request<{ document: { id: string; archivedAt: string } }>(`/documents/${id}/archive`, {
    method: 'POST'
  })
  return result.document
}

export async function restoreDocument(id: string) {
  const result = await request<{ document: { id: string; title: string; updatedAt: string } }>(`/documents/${id}/restore`, {
    method: 'POST'
  })
  return result.document
}

export function exportDocuments() {
  return request<{ url: string }>('/documents/export', {
    method: 'GET'
  })
}

export async function importArchive(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${DEFAULT_BACKEND_URL}/documents/import`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error('インポートに失敗しました')
  }

  return response.json()
}

export async function fetchAttachments(documentId: string) {
  const result = await request<{ attachments: AttachmentResponse[] }>(`/documents/${documentId}/attachments`, {
    method: 'GET'
  })
  return result.attachments
}

export async function uploadAttachment(documentId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${DEFAULT_BACKEND_URL}/documents/${documentId}/attachments`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '添付アップロードに失敗しました')
    throw new Error(detail)
  }

  const data = (await response.json()) as { attachment: AttachmentResponse }
  return data.attachment
}

export async function deleteAttachment(documentId: string, attachmentId: string) {
  const response = await fetch(`${DEFAULT_BACKEND_URL}/documents/${documentId}/attachments/${attachmentId}`, {
    method: 'DELETE'
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '添付削除に失敗しました')
    throw new Error(detail)
  }
}

export type AttachmentVariantResponse = {
  name: string
  contentType: string
  size: number
  width?: number
  height?: number
  downloadUrl: string
}

export type AttachmentResponse = {
  id: string
  documentId: string
  filename: string
  contentType: string
  size: number
  createdAt: string
  downloadUrl: string
  variants?: AttachmentVariantResponse[]
}

export type ArchivedDocumentResponse = {
  id: string
  title: string
  updatedAt: string
  archivedAt: string
}
