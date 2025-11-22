import path from 'node:path'
import { pipeline } from 'stream/promises'
import type { Readable } from 'node:stream'
import type { Express } from 'express'
import sharp from 'sharp'
import { nanoid } from 'nanoid/non-secure'
import {
  attachmentRepository,
  type AttachmentRecord,
  type AttachmentVariantRecord
} from '../repositories/attachmentRepository.js'
import { documentRepository } from '../repositories/documentRepository.js'
import { fileStorage } from '../repositories/fileStorage.js'
import { logger } from '../config/logger.js'
import { AppError } from '../utils/error.js'

const ALLOWED_MIME_PREFIX = 'image/'
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg'
}

const VARIANT_TARGETS = [
  { name: 'preview', width: 1024, quality: 82 },
  { name: 'small', width: 320, quality: 75 }
]

const VARIANT_SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VARIANT_CONTENT_TYPE = 'image/webp'

export async function initAttachmentService() {
  await attachmentRepository.init()
}

export async function listAttachments(documentId: string) {
  const records = await attachmentRepository.listByDocument(documentId)
  return records.map(normalizeRecord)
}

export async function createAttachment(documentId: string, file: Express.Multer.File) {
  await ensureDocumentExists(documentId)

  if (!file) {
    throw new AppError('ファイルがアップロードされていません', 400)
  }

  if (!file.mimetype.startsWith(ALLOWED_MIME_PREFIX)) {
    throw new AppError('画像ファイルのみアップロードできます', 400)
  }

  const id = nanoid(12)
  const filename = buildFilename(file.originalname, file.mimetype)
  const storageKey = buildStorageKey(documentId, id, filename)

  await fileStorage.saveAttachment(storageKey, file.buffer, file.mimetype)

  const variants = await generateVariants(documentId, id, file)

  const createdAt = new Date().toISOString()
  const record = await attachmentRepository.createAttachment({
    id,
    documentId,
    filename,
    contentType: file.mimetype,
    size: file.size,
    storageKey,
    createdAt,
    variants
  })

  return normalizeRecord(record)
}

export async function removeAttachment(documentId: string, attachmentId: string) {
  const record = await ensureAttachment(documentId, attachmentId)
  await fileStorage.deleteAttachment(record.storageKey)
  if (record.variants?.length) {
    await Promise.all(record.variants.map((variant) => fileStorage.deleteAttachment(variant.storageKey)))
  }
  await attachmentRepository.deleteAttachment(attachmentId)
  return record
}

export async function getAttachmentStream(documentId: string, attachmentId: string, variantName?: string) {
  const record = await ensureAttachment(documentId, attachmentId)
  let targetKey = record.storageKey
  let contentType = record.contentType
  let size = record.size
  if (variantName) {
    const variant = record.variants?.find((item) => item.name === variantName)
    if (!variant) {
      throw new AppError('指定したバリアントが見つかりません', 404)
    }
    targetKey = variant.storageKey
    contentType = variant.contentType
    size = variant.size
  }

  const stream = await fileStorage.getAttachmentStream(targetKey)
  if (!stream) {
    throw new AppError('添付ファイルの読み込みに失敗しました', 500)
  }
  return { record, stream, contentType, size }
}

export async function pipeAttachmentToResponse(stream: Readable, res: NodeJS.WritableStream) {
  await pipeline(stream, res)
}

function buildFilename(original: string, mimeType: string) {
  const base = path.basename(original || 'image')
  const sanitized = base.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'image'
  const currentExt = path.extname(sanitized)
  if (currentExt) {
    return sanitized
  }
  const fallbackExt = MIME_EXTENSION_MAP[mimeType] ?? ''
  return `${sanitized}${fallbackExt}`
}

function buildStorageKey(documentId: string, attachmentId: string, filename: string) {
  return `attachments/${documentId}/${attachmentId}-${filename}`
}

function buildVariantStorageKey(documentId: string, attachmentId: string, variantName: string) {
  return `attachments/${documentId}/${attachmentId}/variants/${variantName}.webp`
}

async function ensureDocumentExists(documentId: string) {
  const document = await documentRepository.getDocument(documentId)
  if (!document) {
    throw new AppError('対象のドキュメントが見つかりません', 404)
  }
}

async function ensureAttachment(documentId: string, attachmentId: string) {
  const record = await attachmentRepository.findById(attachmentId)
  if (!record || record.documentId !== documentId) {
    throw new AppError('添付ファイルが見つかりません', 404)
  }
  return normalizeRecord(record)
}

function normalizeRecord(record: AttachmentRecord): AttachmentRecord {
  return {
    ...record,
    variants: Array.isArray(record.variants) ? record.variants : []
  }
}

async function generateVariants(documentId: string, attachmentId: string, file: Express.Multer.File) {
  if (!VARIANT_SUPPORTED_MIME.has(file.mimetype)) {
    return []
  }

  const variants: AttachmentVariantRecord[] = []
  for (const variant of VARIANT_TARGETS) {
    try {
      const { data, info } = await sharp(file.buffer)
        .resize({ width: variant.width, withoutEnlargement: true })
        .webp({ quality: variant.quality })
        .toBuffer({ resolveWithObject: true })

      if (!info.size) {
        continue
      }

      const storageKey = buildVariantStorageKey(documentId, attachmentId, variant.name)
      await fileStorage.saveAttachment(storageKey, data, VARIANT_CONTENT_TYPE)

      variants.push({
        name: variant.name,
        contentType: VARIANT_CONTENT_TYPE,
        size: info.size,
        width: info.width,
        height: info.height,
        storageKey
      })
    } catch (error) {
      logger.warn(
        { err: error, documentId, attachmentId, variant: variant.name },
        '添付バリアントの生成に失敗しました'
      )
    }
  }

  return variants
}

export type { AttachmentRecord }
