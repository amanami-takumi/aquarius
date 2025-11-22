import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  deleteAttachment,
  fetchAttachments,
  uploadAttachment,
  type AttachmentResponse
} from '../utils/apiClient'
import {
  deleteAttachmentCache,
  listCachedAttachments,
  putAttachmentCache,
  putAttachmentCaches,
  upsertAttachmentBlob,
  type AttachmentCacheRecord
} from '../utils/indexedDbClient'

const ORIGINAL_VARIANT = 'original'
const VARIANT_PREFERENCE = ['preview', 'medium', 'small', ORIGINAL_VARIANT]

export interface AttachmentEntry extends AttachmentResponse {
  displayUrl: string
  displayVariant: string
  fromCache: boolean
}

export const useAttachmentStore = defineStore('attachments', () => {
  const attachments = ref<AttachmentEntry[]>([])
  const loading = ref(false)
  const uploading = ref(false)
  const error = ref<string | null>(null)
  const currentDocumentId = ref<string>('')

  const objectUrls = new Map<string, string>()

  function makeObjectKey(id: string, variant: string) {
    return `${id}::${variant}`
  }

  function createObjectUrl(id: string, variant: string, blob: Blob | null) {
    const key = makeObjectKey(id, variant)
    const existing = objectUrls.get(key)
    if (existing) {
      URL.revokeObjectURL(existing)
      objectUrls.delete(key)
    }
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    objectUrls.set(key, url)
    return url
  }

  function cleanupObjectUrls(activeKeys: Set<string>) {
    for (const [key, url] of objectUrls.entries()) {
      if (!activeKeys.has(key)) {
        URL.revokeObjectURL(url)
        objectUrls.delete(key)
      }
    }
  }

  function selectPreferredVariant(source: { variants?: { name: string }[] }) {
    const variants = source.variants ?? []
    for (const candidate of VARIANT_PREFERENCE) {
      if (variants.some((variant) => variant.name === candidate)) {
        return candidate
      }
    }
    return variants[0]?.name ?? ORIGINAL_VARIANT
  }

  function variantDownloadUrl(response: AttachmentResponse, variant: string) {
    if (variant === ORIGINAL_VARIANT) {
      return response.downloadUrl
    }
    const target = response.variants?.find((item) => item.name === variant)
    return target?.downloadUrl ?? response.downloadUrl
  }

  function createEntry(
    response: AttachmentResponse,
    options: { blob?: Blob | null; variant?: string; fromCache?: boolean } = {}
  ): AttachmentEntry {
    const variant = options.variant ?? selectPreferredVariant(response)
    const blobUrl = options.blob ? createObjectUrl(response.id, variant, options.blob) : null
    const displayUrl = blobUrl ?? variantDownloadUrl(response, variant)
    return {
      ...response,
      displayUrl,
      displayVariant: variant,
      fromCache: Boolean(options.fromCache && blobUrl)
    }
  }

  function entryFromCache(record: AttachmentCacheRecord) {
    const response: AttachmentResponse = {
      id: record.id,
      documentId: record.documentId,
      filename: record.filename,
      contentType: record.contentType,
      size: record.size,
      createdAt: record.createdAt,
      downloadUrl: record.downloadUrl ?? '',
      variants: record.variants?.map((variant) => ({
        name: variant.name,
        contentType: variant.contentType,
        size: variant.size,
        width: variant.width,
        height: variant.height,
        downloadUrl: variant.downloadUrl ?? ''
      }))
    }
    const variant = selectPreferredVariant(record)
    const blob = record.blobs?.[variant] ?? null
    return createEntry(response, { blob, variant, fromCache: Boolean(blob) })
  }

  function setAttachments(entries: AttachmentEntry[]) {
    const keep = new Set<string>()
    for (const entry of entries) {
      if (entry.displayUrl.startsWith('blob:')) {
        keep.add(makeObjectKey(entry.id, entry.displayVariant))
      }
    }
    cleanupObjectUrls(keep)
    attachments.value = entries
  }

  async function hydrateFromCache(documentId: string) {
    const records = await listCachedAttachments(documentId)
    if (!records.length) {
      setAttachments([])
      return new Map<string, AttachmentCacheRecord>()
    }

    const map = new Map<string, AttachmentCacheRecord>()
    const entries = records.map((record) => {
      map.set(record.id, record)
      return entryFromCache(record)
    })
    setAttachments(entries)
    return map
  }

  async function cacheVariantIfNeeded(response: AttachmentResponse, variant: string, hasBlob: boolean) {
    if (hasBlob) return
    const url = variantDownloadUrl(response, variant)
    if (!url) return
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      await upsertAttachmentBlob(response.id, variant, blob)
      const nextEntry = createEntry(response, { blob, variant, fromCache: true })
      const index = attachments.value.findIndex((item) => item.id === response.id)
      if (index !== -1 && attachments.value[index].displayUrl !== nextEntry.displayUrl) {
        const next = [...attachments.value]
        next[index] = nextEntry
        setAttachments(next)
      }
    } catch (err) {
      console.warn('添付キャッシュ取得に失敗しました', err)
    }
  }

  async function load(documentId: string) {
    currentDocumentId.value = documentId
    if (!documentId) {
      setAttachments([])
      return
    }

    loading.value = true
    error.value = null

    const cachedMap = await hydrateFromCache(documentId)

    try {
      const items = await fetchAttachments(documentId)
      if (currentDocumentId.value !== documentId) {
        return
      }

      await putAttachmentCaches(
        items.map((item) => ({
          id: item.id,
          documentId: item.documentId,
          filename: item.filename,
          contentType: item.contentType,
          size: item.size,
          createdAt: item.createdAt,
          downloadUrl: item.downloadUrl,
          variants: item.variants?.map((variant) => ({
            name: variant.name,
            contentType: variant.contentType,
            size: variant.size,
            width: variant.width,
            height: variant.height,
            downloadUrl: variant.downloadUrl
          }))
        }))
      )

      const entries = items.map((item) => {
        const cached = cachedMap.get(item.id)
        const variant = selectPreferredVariant(item)
        const blob = cached?.blobs?.[variant] ?? null
        return createEntry(item, { blob, variant, fromCache: Boolean(blob) })
      })

      if (currentDocumentId.value === documentId) {
        setAttachments(entries)
      }

      for (const item of items) {
        const variant = selectPreferredVariant(item)
        const hasBlob = Boolean(cachedMap.get(item.id)?.blobs?.[variant])
        void cacheVariantIfNeeded(item, variant, hasBlob)
      }
    } catch (err) {
      if (!attachments.value.length) {
        setAttachments([])
      }
      error.value = err instanceof Error ? err.message : '添付の読み込みに失敗しました'
    } finally {
      if (currentDocumentId.value === documentId) {
        loading.value = false
      }
    }
  }

  async function add(documentId: string, files: File | File[]) {
    if (!documentId || currentDocumentId.value !== documentId) return
    const fileList = Array.isArray(files) ? files : [files]
    if (!fileList.length) return
    uploading.value = true
    error.value = null
    const createdEntries: AttachmentEntry[] = []

    try {
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index]
        const response = await uploadAttachment(documentId, file)
        await putAttachmentCache({
          id: response.id,
          documentId: response.documentId,
          filename: response.filename,
          contentType: response.contentType,
          size: response.size,
          createdAt: response.createdAt,
          downloadUrl: response.downloadUrl,
          variants: response.variants?.map((variant) => ({
            name: variant.name,
            contentType: variant.contentType,
            size: variant.size,
            width: variant.width,
            height: variant.height,
            downloadUrl: variant.downloadUrl
          }))
        })
        await upsertAttachmentBlob(response.id, ORIGINAL_VARIANT, file)
        const entry = createEntry(response, {
          blob: file,
          variant: ORIGINAL_VARIANT,
          fromCache: true
        })
        createdEntries.push(entry)
      }

      if (createdEntries.length) {
        setAttachments([...createdEntries, ...attachments.value])
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '添付のアップロードに失敗しました'
      throw err
    } finally {
      uploading.value = false
    }
  }

  async function remove(documentId: string, attachmentId: string) {
    if (!documentId) return
    error.value = null
    try {
      await deleteAttachment(documentId, attachmentId)
      await deleteAttachmentCache(attachmentId)
      const next = attachments.value.filter((item) => item.id !== attachmentId)
      setAttachments(next)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '添付の削除に失敗しました'
      throw err
    }
  }

  function reset() {
    currentDocumentId.value = ''
    setAttachments([])
    error.value = null
    loading.value = false
  }

  return {
    attachments,
    loading,
    uploading,
    error,
    load,
    add,
    remove,
    reset
  }
})
