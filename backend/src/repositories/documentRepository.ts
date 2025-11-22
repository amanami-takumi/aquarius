import { Pool } from 'pg'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

export type DocumentMetadata = {
  id: string
  title: string
  content: string
  updatedAt: string
  createdAt?: string
  archivedAt?: string | null
}

class PostgresDocumentRepository {
  private pool: Pool

  constructor() {
    this.pool = new Pool(env.postgres as any)
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        archived_at TIMESTAMPTZ
      );
    `)
    await this.pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ')
    logger.info('Postgres schema ensured')
  }

  async upsertDocument(payload: DocumentMetadata) {
    await this.pool.query(
      `
      INSERT INTO documents (id, title, content, updated_at, archived_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id)
      DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = EXCLUDED.updated_at;
      `,
      [payload.id, payload.title, payload.content, payload.updatedAt, payload.archivedAt ?? null]
    )
  }

  async listDocuments() {
    const result = await this.pool.query<DocumentMetadata>(
      'SELECT id, title, content, updated_at as "updatedAt", created_at as "createdAt", archived_at as "archivedAt" FROM documents WHERE archived_at IS NULL ORDER BY updated_at DESC'
    )
    return result.rows
  }

  async getDocument(id: string) {
    const result = await this.pool.query<DocumentMetadata>(
      'SELECT id, title, content, updated_at as "updatedAt", created_at as "createdAt", archived_at as "archivedAt" FROM documents WHERE id = $1',
      [id]
    )
    return result.rows[0] ?? null
  }

  async listArchivedDocuments() {
    const result = await this.pool.query<DocumentMetadata>(
      'SELECT id, title, content, updated_at as "updatedAt", created_at as "createdAt", archived_at as "archivedAt" FROM documents WHERE archived_at IS NOT NULL ORDER BY archived_at DESC'
    )
    return result.rows
  }

  async archiveDocument(id: string, archivedAt: string) {
    const result = await this.pool.query<DocumentMetadata>(
      `
        UPDATE documents
        SET archived_at = $2
        WHERE id = $1
        RETURNING id, title, content, updated_at as "updatedAt", created_at as "createdAt", archived_at as "archivedAt";
      `,
      [id, archivedAt]
    )
    return result.rows[0] ?? null
  }

  async restoreDocument(id: string) {
    const result = await this.pool.query<DocumentMetadata>(
      `
        UPDATE documents
        SET archived_at = NULL
        WHERE id = $1
        RETURNING id, title, content, updated_at as "updatedAt", created_at as "createdAt", archived_at as "archivedAt";
      `,
      [id]
    )
    return result.rows[0] ?? null
  }

  async deleteDocument(id: string) {
    const result = await this.pool.query<DocumentMetadata>(
      `
        DELETE FROM documents
        WHERE id = $1
        RETURNING id, title, content, updated_at as "updatedAt", created_at as "createdAt", archived_at as "archivedAt";
      `,
      [id]
    )
    return result.rows[0] ?? null
  }
}

export const documentRepository = new PostgresDocumentRepository()
