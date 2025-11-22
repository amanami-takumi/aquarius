import AdmZip from 'adm-zip'
import { nanoid } from 'nanoid/non-secure'
import {
  documentRepository,
  type DocumentMetadata
} from '../repositories/documentRepository.js'
import { attachmentRepository } from '../repositories/attachmentRepository.js'
import { fileStorage } from '../repositories/fileStorage.js'
import { AppError } from '../utils/error.js'
import { initAttachmentService } from './attachmentService.js'

export type DocumentInput = {
  id: string
  title: string
  content: string
  updatedAt: string
}

export async function initializeServices() {
  await documentRepository.init()
  await initAttachmentService()
}

export async function saveDocument(payload: DocumentInput) {
  await documentRepository.upsertDocument(payload)
  await fileStorage.saveDocumentContent(payload.id, payload.content)
  return {
    id: payload.id,
    title: payload.title,
    content: payload.content,
    updatedAt: payload.updatedAt
  }
}

export async function listDocuments() {
  const documents = await documentRepository.listDocuments()
  const withContent = await Promise.all(
    documents.map(async (doc) => {
      const content = (await fileStorage.getDocumentContent(doc.id)) ?? doc.content
      return {
        ...doc,
        content
      }
    })
  )
  return withContent
}

export async function listArchivedDocuments() {
  const documents = await documentRepository.listArchivedDocuments()
  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    archivedAt: doc.archivedAt ?? new Date().toISOString()
  }))
}

export async function exportDocuments() {
  const documents = [
    ...(await documentRepository.listDocuments()),
    ...(await documentRepository.listArchivedDocuments())
  ]
  const zip = new AdmZip()

  zip.addFile('documents.json', Buffer.from(JSON.stringify(documents, null, 2), 'utf-8'))

  await Promise.all(
    documents.map(async (doc) => {
      const content = (await fileStorage.getDocumentContent(doc.id)) ?? doc.content
      zip.addFile(`documents/${doc.id}.md`, Buffer.from(content, 'utf-8'))
    })
  )

  const archiveBuffer = zip.toBuffer()
  const key = `exports/${new Date().toISOString()}-${nanoid(8)}.zip`
  const { bucket, key: storedKey } = await fileStorage.putArchive(key, archiveBuffer, true)
  const url = await fileStorage.getPresignedUrl(bucket, storedKey)

  return { url }
}

export async function importDocuments(buffer: Buffer) {
  const zip = new AdmZip(buffer)
  const manifestEntry = zip.getEntry('documents.json')
  if (!manifestEntry) {
    throw new AppError('documents.json が含まれていません', 400)
  }

  let manifest: DocumentMetadata[] = []
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
  } catch (error) {
    throw new AppError('documents.json のパースに失敗しました', 400, error)
  }

  for (const doc of manifest) {
    const fileEntry = zip.getEntry(`documents/${doc.id}.md`)
    const content = fileEntry ? fileEntry.getData().toString('utf-8') : doc.content
    await documentRepository.upsertDocument({
      id: doc.id,
      title: doc.title,
      content,
      updatedAt: doc.updatedAt
    })
    await fileStorage.saveDocumentContent(doc.id, content)
  }

  return { imported: manifest.length }
}

export async function deleteDocument(documentId: string) {
  const existing = await documentRepository.getDocument(documentId)
  if (!existing) {
    throw new AppError('対象のドキュメントが見つかりません', 404)
  }

  const attachments = await attachmentRepository.listByDocument(documentId)

  if (attachments.length) {
    await Promise.all(
      attachments.flatMap((item) => {
        const deletions = [fileStorage.deleteAttachment(item.storageKey)]
        if (item.variants?.length) {
          deletions.push(...item.variants.map((variant) => fileStorage.deleteAttachment(variant.storageKey)))
        }
        return deletions
      })
    )
  }

  await fileStorage.deleteDocumentContent(documentId)
  await documentRepository.deleteDocument(documentId)

  return {
    id: documentId,
    removedAttachments: attachments.length
  }
}

export async function archiveDocument(documentId: string) {
  const existing = await documentRepository.getDocument(documentId)
  if (!existing) {
    throw new AppError('対象のドキュメントが見つかりません', 404)
  }

  const archivedAt = new Date().toISOString()
  const record = await documentRepository.archiveDocument(documentId, archivedAt)
  return {
    id: record?.id ?? documentId,
    archivedAt
  }
}

export async function restoreDocument(documentId: string) {
  const existing = await documentRepository.getDocument(documentId)
  if (!existing) {
    throw new AppError('対象のドキュメントが見つかりません', 404)
  }

  const record = await documentRepository.restoreDocument(documentId)
  if (!record) {
    throw new AppError('復元に失敗しました', 500)
  }

  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt
  }
}
