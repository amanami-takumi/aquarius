import { Client } from 'minio'
import type { Readable } from 'node:stream'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

class MinioStorage {
  private client: Client
  private ready: Promise<void>

  constructor() {
    this.client = new Client({
      endPoint: env.minio.endPoint,
      port: env.minio.port,
      useSSL: env.minio.useSSL,
      accessKey: env.minio.accessKey,
      secretKey: env.minio.secretKey
    })

    this.ready = this.ensureBuckets()
  }

  private async ensureBuckets() {
    const buckets = [env.minio.bucketPublic, env.minio.bucketPrivate]
    await Promise.all(
      buckets.map(async (bucket) => {
        const exists = await this.client.bucketExists(bucket).catch(() => false)
        if (!exists) {
          await this.client.makeBucket(bucket, '')
          logger.info({ bucket }, 'MinIO bucket created')
        }
      })
    )
  }

  async saveDocumentContent(id: string, content: string) {
    await this.ready
    const buffer = Buffer.from(content, 'utf-8')
    await this.client.putObject(env.minio.bucketPrivate, `documents/${id}.md`, buffer, buffer.length, {
      'Content-Type': 'text/markdown; charset=utf-8'
    })
  }

  async getDocumentContent(id: string) {
    await this.ready
    const stream = await this.client.getObject(env.minio.bucketPrivate, `documents/${id}.md`).catch(() => null)
    if (!stream) return null

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString('utf-8')
  }

  async deleteDocumentContent(id: string) {
    await this.ready
    await this.client.removeObject(env.minio.bucketPrivate, `documents/${id}.md`).catch((error: unknown) => {
      if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === 'NoSuchKey') {
        return
      }
      throw error
    })
  }

  async putArchive(key: string, buffer: Buffer, isPublic = false) {
    await this.ready
    const bucket = isPublic ? env.minio.bucketPublic : env.minio.bucketPrivate
    await this.client.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': 'application/zip'
    })
    return { bucket, key }
  }

  async getPresignedUrl(bucket: string, key: string) {
    await this.ready
    return this.client.presignedGetObject(bucket, key, 24 * 60 * 60)
  }

  async saveAttachment(key: string, buffer: Buffer, contentType: string) {
    await this.ready
    await this.client.putObject(env.minio.bucketPrivate, key, buffer, buffer.length, {
      'Content-Type': contentType
    })
  }

  async getAttachmentStream(key: string): Promise<Readable | null> {
    await this.ready
    const stream = await this.client.getObject(env.minio.bucketPrivate, key).catch(() => null)
    return stream as Readable | null
  }

  async deleteAttachment(key: string) {
    await this.ready
    await this.client.removeObject(env.minio.bucketPrivate, key).catch((error: unknown) => {
      if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === 'NoSuchKey') {
        return
      }
      throw error
    })
  }
}

export const fileStorage = new MinioStorage()
