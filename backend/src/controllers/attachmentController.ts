import type { Request, Response, Express } from 'express'
import type { AttachmentRecord } from '../services/attachmentService.js'
import {
  createAttachment,
  getAttachmentStream,
  listAttachments,
  pipeAttachmentToResponse,
  removeAttachment
} from '../services/attachmentService.js'

function buildDownloadUrl(req: Request, record: AttachmentRecord, variant?: string) {
  const host = req.get('host') ?? 'localhost'
  const protocol = req.protocol
  const variantParam = variant ? `?variant=${encodeURIComponent(variant)}` : ''
  return `${protocol}://${host}/documents/${record.documentId}/attachments/${record.id}/content${variantParam}`
}

function mapRecord(req: Request, record: AttachmentRecord) {
  return {
    id: record.id,
    documentId: record.documentId,
    filename: record.filename,
    contentType: record.contentType,
    size: record.size,
    createdAt: record.createdAt,
    downloadUrl: buildDownloadUrl(req, record),
    variants: (record.variants ?? []).map((variant) => ({
      name: variant.name,
      contentType: variant.contentType,
      size: variant.size,
      width: variant.width,
      height: variant.height,
      downloadUrl: buildDownloadUrl(req, record, variant.name)
    }))
  }
}

export async function listAttachmentsHandler(req: Request, res: Response) {
  const { documentId } = req.params
  const attachments = await listAttachments(documentId)
  return res.status(200).json({ attachments: attachments.map((item) => mapRecord(req, item)) })
}

export async function createAttachmentHandler(req: Request, res: Response) {
  const { documentId } = req.params
  const file = (req as unknown as { file?: Express.Multer.File }).file
  const record = await createAttachment(documentId, file as Express.Multer.File)
  return res.status(201).json({ attachment: mapRecord(req, record) })
}

export async function deleteAttachmentHandler(req: Request, res: Response) {
  const { documentId, attachmentId } = req.params
  await removeAttachment(documentId, attachmentId)
  return res.status(204).send()
}

export async function downloadAttachmentHandler(req: Request, res: Response) {
  const { documentId, attachmentId } = req.params
  const variant = typeof req.query.variant === 'string' ? req.query.variant : undefined
  const { record, stream, contentType, size } = await getAttachmentStream(documentId, attachmentId, variant)
  res.status(200)
  res.setHeader('Content-Type', contentType)
  if (typeof size === 'number') {
    res.setHeader('Content-Length', String(size))
  }
  const filename = variant ? `${variant}-${record.filename}` : record.filename
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`)
  await pipeAttachmentToResponse(stream, res)
}
