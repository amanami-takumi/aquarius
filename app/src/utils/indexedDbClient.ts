import { IDBPDatabase, openDB } from 'idb'

const DB_NAME = 'aquarius-documents'
const DOCUMENT_STORE = 'documents'
const ATTACHMENT_STORE = 'attachments'

export type DocumentRecord = {
  id: string
  title: string
  content: string
  updatedAt: string
}

export type AttachmentCacheVariant = {
  name: string
  contentType: string
  size: number
  width?: number
  height?: number
  downloadUrl?: string
}

export type AttachmentCacheRecord = {
  id: string
  documentId: string
  filename: string
  contentType: string
  size: number
  createdAt: string
  downloadUrl?: string
  variants?: AttachmentCacheVariant[]
  blobs?: Record<string, Blob>
  cachedAt: string
}

export type AttachmentCacheInput = Omit<AttachmentCacheRecord, 'cachedAt'> & {
  cachedAt?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
          database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' })
        }

        if (!database.objectStoreNames.contains(ATTACHMENT_STORE)) {
          const attachmentStore = database.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' })
          attachmentStore.createIndex('documentId', 'documentId', { unique: false })
        }
      }
    })
  }
  return dbPromise
}

export async function putDocument(record: DocumentRecord) {
  const db = await getDb()
  await db.put(DOCUMENT_STORE, record)
  return record
}

export async function getDocument(id: string) {
  const db = await getDb()
  return (await db.get(DOCUMENT_STORE, id)) as DocumentRecord | undefined
}

export async function listDocuments() {
  const db = await getDb()
  return (await db.getAll(DOCUMENT_STORE)) as DocumentRecord[]
}

export async function deleteDocument(id: string) {
  const db = await getDb()
  await db.delete(DOCUMENT_STORE, id)
}

export async function putAttachmentCaches(records: AttachmentCacheInput[]) {
  if (!records.length) {
    return
  }

  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readwrite')
  const store = tx.objectStore(ATTACHMENT_STORE)
  const timestamp = new Date().toISOString()

  for (const record of records) {
    const existing = (await store.get(record.id)) as AttachmentCacheRecord | undefined
    const cachedRecord: AttachmentCacheRecord = {
      ...existing,
      ...record,
      blobs: record.blobs ?? existing?.blobs,
      cachedAt: record.cachedAt ?? existing?.cachedAt ?? timestamp
    }
    await store.put(cachedRecord)
  }

  await tx.done
}

export async function putAttachmentCache(record: AttachmentCacheInput) {
  await putAttachmentCaches([record])
}

export async function listCachedAttachments(documentId: string) {
  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readonly')
  const store = tx.objectStore(ATTACHMENT_STORE)
  const index = store.index('documentId')
  const result = (await index.getAll(documentId)) as AttachmentCacheRecord[]
  await tx.done
  return result
}

export async function getCachedAttachment(id: string) {
  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readonly')
  const store = tx.objectStore(ATTACHMENT_STORE)
  const record = (await store.get(id)) as AttachmentCacheRecord | undefined
  await tx.done
  return record
}

export async function upsertAttachmentBlob(
  attachmentId: string,
  variant: string,
  blob: Blob
) {
  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readwrite')
  const store = tx.objectStore(ATTACHMENT_STORE)
  const record = (await store.get(attachmentId)) as AttachmentCacheRecord | undefined
  if (!record) {
    await tx.done
    return
  }

  const nextBlobs = { ...(record.blobs ?? {}) }
  nextBlobs[variant] = blob
  record.blobs = nextBlobs
  record.cachedAt = new Date().toISOString()
  await store.put(record)
  await tx.done
}

export async function getAttachmentBlob(attachmentId: string, variant: string) {
  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readonly')
  const store = tx.objectStore(ATTACHMENT_STORE)
  const record = (await store.get(attachmentId)) as AttachmentCacheRecord | undefined
  await tx.done
  return record?.blobs?.[variant] ?? null
}

export async function deleteAttachmentCache(id: string) {
  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readwrite')
  const store = tx.objectStore(ATTACHMENT_STORE)
  await store.delete(id)
  await tx.done
}

export async function deleteAttachmentCachesByDocument(documentId: string) {
  const cached = await listCachedAttachments(documentId)
  if (!cached.length) return
  const db = await getDb()
  const tx = db.transaction(ATTACHMENT_STORE, 'readwrite')
  const store = tx.objectStore(ATTACHMENT_STORE)
  for (const record of cached) {
    await store.delete(record.id)
  }
  await tx.done
}

export type { DocumentRecord }
