import type { Request, Response, Express } from 'express'
import { z } from 'zod'
import {
  saveDocument,
  exportDocuments,
  importDocuments,
  listDocuments,
  listArchivedDocuments,
  deleteDocument,
  archiveDocument,
  restoreDocument
} from '../services/documentService.js'
import { AppError } from '../utils/error.js'

const documentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().default(''),
  updatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'updatedAt はISO8601形式で指定してください')
})

export async function createDocumentHandler(req: Request, res: Response) {
  const parsed = documentSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new AppError('リクエスト形式が不正です', 400, parsed.error.flatten())
  }

  const saved = await saveDocument(parsed.data)
  return res.status(200).json({ document: saved })
}

export async function listDocumentsHandler(_req: Request, res: Response) {
  const documents = await listDocuments()
  return res.status(200).json({ documents })
}

export async function listArchivedDocumentsHandler(_req: Request, res: Response) {
  const documents = await listArchivedDocuments()
  return res.status(200).json({ documents })
}

export async function exportDocumentsHandler(_req: Request, res: Response) {
  const result = await exportDocuments()
  return res.status(200).json(result)
}

export async function importDocumentsHandler(req: Request, res: Response) {
  const file = (req as unknown as { file?: Express.Multer.File }).file
  if (!file) {
    throw new AppError('ファイルがアップロードされていません', 400)
  }

  const result = await importDocuments(file.buffer)
  return res.status(200).json(result)
}

export async function deleteDocumentHandler(req: Request, res: Response) {
  const { documentId } = req.params
  if (!documentId) {
    throw new AppError('documentId が指定されていません', 400)
  }

  const result = await deleteDocument(documentId)
  return res.status(200).json({ document: result })
}

export async function archiveDocumentHandler(req: Request, res: Response) {
  const { documentId } = req.params
  if (!documentId) {
    throw new AppError('documentId が指定されていません', 400)
  }

  const result = await archiveDocument(documentId)
  return res.status(200).json({ document: result })
}

export async function restoreDocumentHandler(req: Request, res: Response) {
  const { documentId } = req.params
  if (!documentId) {
    throw new AppError('documentId が指定されていません', 400)
  }

  const result = await restoreDocument(documentId)
  return res.status(200).json({ document: result })
}
