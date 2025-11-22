import { defineStore } from 'pinia'
import { nanoid } from 'nanoid/non-secure'
import { computed, ref, watch } from 'vue'
import {
  listDocuments as listLocalDocuments,
  putDocument,
  deleteDocument as deleteLocalDocument,
  deleteAttachmentCachesByDocument
} from '../utils/indexedDbClient'
import {
  syncDocument,
  fetchDocuments,
  fetchArchivedDocuments,
  archiveDocument as archiveRemoteDocument,
  restoreDocument as restoreRemoteDocument,
  deleteDocumentPermanently
} from '../utils/apiClient'
import type { DocumentPayload } from '../utils/apiClient'

export interface DocumentEntry {
  id: string
  title: string
  content: string
  updatedAt: string
  archivedAt?: string | null
  syncedAt?: string
  isDirty: boolean
}

export interface ArchivedDocumentEntry {
  id: string
  title: string
  updatedAt: string
  archivedAt: string
}

export const useDocumentStore = defineStore('documents', () => {
  const documents = ref<DocumentEntry[]>([])
  const activeDocumentId = ref<string>('')
  const archivedDocuments = ref<ArchivedDocumentEntry[]>([])
  const syncTimers = new Map<string, number>()

  const activeDocument = computed(() =>
    documents.value.find((doc) => doc.id === activeDocumentId.value) ?? null
  )

  async function bootstrap() {
    const localRecords = await listLocalDocuments()
    let remoteRecords: DocumentPayload[] = []

    try {
      remoteRecords = await fetchDocuments()
    } catch (error) {
      console.error('バックエンドからの同期取得に失敗しました', error)
    }

    const localMap = new Map(localRecords.map((record) => [record.id, record]))
    const nextDocuments: DocumentEntry[] = []
    const dirtyIds: string[] = []
    const remoteToPersist: DocumentPayload[] = []

    for (const remote of remoteRecords) {
      const local = localMap.get(remote.id)
      if (!local) {
        nextDocuments.push({
          id: remote.id,
          title: remote.title,
          content: remote.content,
          updatedAt: remote.updatedAt,
          syncedAt: remote.updatedAt,
          isDirty: false
        })
        remoteToPersist.push(remote)
      } else {
        const remoteUpdated = new Date(remote.updatedAt).getTime()
        const localUpdated = new Date(local.updatedAt).getTime()

        if (remoteUpdated >= localUpdated) {
          nextDocuments.push({
            id: remote.id,
            title: remote.title,
            content: remote.content,
            updatedAt: remote.updatedAt,
            syncedAt: remote.updatedAt,
            isDirty: false
          })
          remoteToPersist.push(remote)
        } else {
          nextDocuments.push({
            id: local.id,
            title: local.title,
            content: local.content,
            updatedAt: local.updatedAt,
            isDirty: true
          })
          dirtyIds.push(local.id)
        }
        localMap.delete(remote.id)
      }
    }

    for (const local of localMap.values()) {
      nextDocuments.push({
        id: local.id,
        title: local.title,
        content: local.content,
        updatedAt: local.updatedAt,
        isDirty: true
      })
      dirtyIds.push(local.id)
    }

    if (remoteToPersist.length) {
      await Promise.all(
        remoteToPersist.map((doc) =>
          putDocument({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            updatedAt: doc.updatedAt
          })
        )
      )
    }

    nextDocuments.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    documents.value = nextDocuments

    try {
      const archivedList = await fetchArchivedDocuments()
      archivedDocuments.value = archivedList.map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: item.updatedAt,
        archivedAt: item.archivedAt
      }))
    } catch (error) {
      console.error('倉庫ドキュメントの取得に失敗しました', error)
      archivedDocuments.value = []
    }

    if (!documents.value.length) {
      await createDocument('無題のノート')
      return
    }

    activeDocumentId.value = documents.value[0].id
    dirtyIds.forEach((id) => scheduleSync(id))
  }

  async function createDocument(title: string) {
    const now = new Date().toISOString()
    const entry: DocumentEntry = {
      id: nanoid(12),
      title,
      content: '',
      updatedAt: now,
      isDirty: true
    }
    documents.value.unshift(entry)
    activeDocumentId.value = entry.id
    await putDocument({ id: entry.id, title: entry.title, content: entry.content, updatedAt: now })
    scheduleSync(entry.id)
    return entry
  }

  function setActiveDocument(id: string) {
    if (documents.value.some((doc) => doc.id === id)) {
      activeDocumentId.value = id
    }
  }

  async function renameDocument(id: string, title: string) {
    const target = documents.value.find((doc) => doc.id === id)
    if (!target) return
    target.title = title
    target.updatedAt = new Date().toISOString()
    target.isDirty = true
    await putDocument({
      id: target.id,
      title: target.title,
      content: target.content,
      updatedAt: target.updatedAt
    })
    scheduleSync(id)
  }

  async function updateContent(id: string, content: string) {
    const target = documents.value.find((doc) => doc.id === id)
    if (!target) return
    target.content = content
    target.updatedAt = new Date().toISOString()
    target.isDirty = true
    await putDocument({
      id: target.id,
      title: target.title,
      content: target.content,
      updatedAt: target.updatedAt
    })
    scheduleSync(id)
  }

  async function archiveDocument(id: string) {
    const index = documents.value.findIndex((doc) => doc.id === id)
    if (index === -1) return

    const target = documents.value[index]
    const timer = syncTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      syncTimers.delete(id)
    }

    try {
      await persistToBackend(id)
      const response = await archiveRemoteDocument(id)

      try {
        await deleteLocalDocument(id)
      } catch (error) {
        console.error('ローカルからの削除に失敗しました', error)
      }

      await deleteAttachmentCachesByDocument(id)

      documents.value.splice(index, 1)
      archivedDocuments.value = [
        {
          id: target.id,
          title: target.title,
          updatedAt: target.updatedAt,
          archivedAt: response.archivedAt ?? new Date().toISOString()
        },
        ...archivedDocuments.value
      ]

      if (activeDocumentId.value === id) {
        activeDocumentId.value = documents.value[0]?.id ?? ''
      }
    } catch (error) {
      if (target.isDirty) {
        scheduleSync(id)
      }
      throw error
    }
  }

  async function restoreArchivedDocument(id: string) {
    const record = archivedDocuments.value.find((doc) => doc.id === id)
    if (!record) return

    await restoreRemoteDocument(id)
    archivedDocuments.value = archivedDocuments.value.filter((doc) => doc.id !== id)
    await bootstrap()
    activeDocumentId.value = id
  }

  async function deleteDocumentForever(id: string) {
    const record = archivedDocuments.value.find((doc) => doc.id === id)
    if (!record) return

    await deleteDocumentPermanently(id)
    archivedDocuments.value = archivedDocuments.value.filter((doc) => doc.id !== id)
    await deleteAttachmentCachesByDocument(id)
    try {
      await deleteLocalDocument(id)
    } catch (error) {
      console.error('ローカルからの削除に失敗しました', error)
    }
  }

  function scheduleSync(id: string) {
    const timer = syncTimers.get(id)
    if (timer) {
      clearTimeout(timer)
    }
    const newTimer = window.setTimeout(() => {
      persistToBackend(id).catch((error) => {
        console.error('Failed to sync document', error)
      })
    }, 1000)
    syncTimers.set(id, newTimer)
  }

  async function persistToBackend(id: string) {
    const target = documents.value.find((doc) => doc.id === id)
    if (!target || !target.isDirty) return
    await syncDocument({
      id: target.id,
      title: target.title,
      content: target.content,
      updatedAt: target.updatedAt
    })
    target.isDirty = false
    target.syncedAt = new Date().toISOString()
  }

  watch(
    () => documents.value.length,
    (length) => {
      if (!length) {
        createDocument('無題のノート')
      }
    }
  )

  return {
    documents,
    activeDocumentId,
    activeDocument,
    archivedDocuments,
    bootstrap,
    createDocument,
    setActiveDocument,
    renameDocument,
    updateContent,
    archiveDocument,
    restoreArchivedDocument,
    deleteDocumentForever
  }
})
