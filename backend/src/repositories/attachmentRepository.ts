import { Pool } from 'pg'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

export type AttachmentRecord = {
  id: string
  documentId: string
  filename: string
  contentType: string
  size: number
  storageKey: string
  createdAt: string
  variants: AttachmentVariantRecord[]
}

export type AttachmentVariantRecord = {
  name: string
  contentType: string
  size: number
  width?: number
  height?: number
  storageKey: string
}

class PostgresAttachmentRepository {
  private pool: Pool

  constructor() {
    this.pool = new Pool(env.postgres as any)
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS document_attachments (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size BIGINT NOT NULL,
        storage_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        variants JSONB NOT NULL DEFAULT '[]'::jsonb
      );
    `)

    await this.pool.query(
      'CREATE INDEX IF NOT EXISTS idx_document_attachments_document_id ON document_attachments(document_id)'
    )

    await this.pool.query(
      `ALTER TABLE document_attachments ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb;`
    )

    logger.info('Postgres attachment schema ensured')
  }

  async createAttachment(record: AttachmentRecord) {
    const result = await this.pool.query<AttachmentRecord>(
      `
        INSERT INTO document_attachments (id, document_id, filename, content_type, size, storage_key, created_at, variants)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, document_id as "documentId", filename, content_type as "contentType", size, storage_key as "storageKey", created_at as "createdAt", variants;
      `,
      [
        record.id,
        record.documentId,
        record.filename,
        record.contentType,
        record.size,
        record.storageKey,
        record.createdAt,
        JSON.stringify(record.variants ?? [])
      ]
    )

    return result.rows[0]
  }

  async listByDocument(documentId: string) {
    const result = await this.pool.query<AttachmentRecord>(
      `
        SELECT id, document_id as "documentId", filename, content_type as "contentType", size, storage_key as "storageKey", created_at as "createdAt", variants
        FROM document_attachments
        WHERE document_id = $1
        ORDER BY created_at DESC;
      `,
      [documentId]
    )

    return result.rows
  }

  async findById(id: string) {
    const result = await this.pool.query<AttachmentRecord>(
      `
        SELECT id, document_id as "documentId", filename, content_type as "contentType", size, storage_key as "storageKey", created_at as "createdAt", variants
        FROM document_attachments
        WHERE id = $1
        LIMIT 1;
      `,
      [id]
    )

    return result.rows[0] ?? null
  }

  async deleteAttachment(id: string) {
    const result = await this.pool.query<AttachmentRecord>(
      `
        DELETE FROM document_attachments
        WHERE id = $1
        RETURNING id, document_id as "documentId", filename, content_type as "contentType", size, storage_key as "storageKey", created_at as "createdAt", variants;
      `,
      [id]
    )

    return result.rows[0] ?? null
  }
}

export const attachmentRepository = new PostgresAttachmentRepository()
