<template>
  <div class="min-h-screen flex flex-col bg-background text-foreground">
    <header class="border-b border-neutral-800 bg-neutral-950/70">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 class="text-lg font-semibold tracking-wide">Aquarius Markdown</h1>
          <p class="text-sm text-neutral-400">ローカル専用のMarkdown編集環境</p>
        </div>
        <DocumentToolbar
          :active-document="activeDocument"
          :archived-count="archivedDocuments.length"
          @create-document="createDocument"
          @rename-document="renameDocument"
          @import-documents="handleImport"
          @export-documents="handleExport"
          @open-warehouse="openWarehouse"
        />
      </div>
    </header>

    <div class="flex-1 min-h-0">
      <div class="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 min-h-0">
        <DocumentTabs
          :documents="documents"
          :active-id="activeId"
          @select="setActive"
          @close="closeDocument"
        />

        <section
          v-if="activeDocument"
          class="mt-4 flex min-h-0 min-w-0 flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.4fr)]"
        >
          <div class="flex min-h-0 min-w-0 flex-col gap-4">
            <MarkdownEditor
              :document="activeDocument"
              @update:content="updateContent"
            />

            <div class="lg:hidden">
              <button
                type="button"
                class="flex w-full items-center justify-between rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-accent"
                :aria-expanded="mobileAttachmentsOpen"
                @click="toggleMobileAttachments"
              >
                <span>添付画像</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="h-4 w-4 transition-transform"
                  :class="mobileAttachmentsOpen ? 'rotate-180' : ''"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>

              <div v-if="mobileAttachmentsOpen" class="mt-3 max-h-[60vh]">
                <AttachmentPanel
                  :attachments="attachments"
                  :loading="attachmentsLoading"
                  :uploading="attachmentsUploading"
                  :error="attachmentsError"
                  @upload="handleAttachmentUpload"
                  @remove="handleAttachmentRemove"
                />
              </div>
            </div>
          </div>

          <div class="hidden min-h-0 lg:flex lg:max-h-[calc(100vh-180px)] lg:flex-col lg:overflow-hidden">
            <AttachmentPanel
              :attachments="attachments"
              :loading="attachmentsLoading"
              :uploading="attachmentsUploading"
              :error="attachmentsError"
              @upload="handleAttachmentUpload"
              @remove="handleAttachmentRemove"
            />
          </div>
        </section>
        <p v-else class="text-center text-sm text-neutral-500">読み込み中です…</p>
      </div>
    </div>
  </div>

  <WarehouseModal
    :open="warehouseOpen"
    :documents="archivedDocuments"
    @close="closeWarehouse"
    @restore="handleRestoreArchived"
    @delete="handleDeleteArchived"
  />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import DocumentToolbar from './components/DocumentToolbar.vue'
import DocumentTabs from './components/DocumentTabs.vue'
import MarkdownEditor from './components/MarkdownEditor.vue'
import AttachmentPanel from './components/AttachmentPanel.vue'
import WarehouseModal from './components/WarehouseModal.vue'
import { useDocumentStore } from './stores/documentStore'
import { useAttachmentStore } from './stores/attachmentStore'

const documentStore = useDocumentStore()
const attachmentStore = useAttachmentStore()

const { documents, activeDocumentId: activeId, activeDocument, archivedDocuments } = storeToRefs(documentStore)
const {
  attachments,
  loading: attachmentsLoading,
  uploading: attachmentsUploading,
  error: attachmentsError
} = storeToRefs(attachmentStore)

const mobileAttachmentsOpen = ref(false)
const warehouseOpen = ref(false)

onMounted(async () => {
  await documentStore.bootstrap()
})

watch(
  () => activeDocument.value?.id,
  async (nextId) => {
    if (nextId) {
      await attachmentStore.load(nextId)
    } else {
      attachmentStore.reset()
    }
    mobileAttachmentsOpen.value = false
  },
  { immediate: true }
)

function createDocument() {
  return documentStore.createDocument('無題のノート')
}

function renameDocument(payload: { id: string; title: string }) {
  return documentStore.renameDocument(payload.id, payload.title)
}

function setActive(id: string) {
  documentStore.setActiveDocument(id)
}

function updateContent(content: string) {
  if (activeDocument.value) {
    documentStore.updateContent(activeDocument.value.id, content)
  }
}

async function closeDocument(id: string) {
  const target = documents.value.find((doc) => doc.id === id)
  const title = target?.title ?? 'このノート'
  const confirmed = window.confirm(`「${title}」を倉庫に送りますか？\nバックエンドから削除されます。`)
  if (!confirmed) return
  try {
    await documentStore.archiveDocument(id)
  } catch (error) {
    console.error('Failed to archive document', error)
    window.alert('倉庫への移動に失敗しました。通信状況を確認して再度お試しください。')
  }
}

async function handleImport(file: File) {
  // TODO: バックエンド完成後に同期処理を実装
  console.info('Import requested', file.name)
}

async function handleExport() {
  // TODO: バックエンド完成後に同期処理を実装
  console.info('Export requested')
}

async function handleAttachmentUpload(files: File[]) {
  if (!activeDocument.value || !files.length) return
  try {
    await attachmentStore.add(activeDocument.value.id, files)
  } catch (error) {
    console.error('Failed to upload attachment', error)
  }
}

async function handleAttachmentRemove(id: string) {
  if (!activeDocument.value) return
  try {
    await attachmentStore.remove(activeDocument.value.id, id)
  } catch (error) {
    console.error('Failed to remove attachment', error)
  }
}

function toggleMobileAttachments() {
  mobileAttachmentsOpen.value = !mobileAttachmentsOpen.value
}

function openWarehouse() {
  warehouseOpen.value = true
}

function closeWarehouse() {
  warehouseOpen.value = false
}

async function handleRestoreArchived(id: string) {
  try {
    await documentStore.restoreArchivedDocument(id)
  } catch (error) {
    console.error('Failed to restore document', error)
    window.alert('復元に失敗しました。通信状況を確認して再度お試しください。')
  }
}

async function handleDeleteArchived(id: string) {
  const confirmed = window.confirm('倉庫から完全に削除します。元に戻せません。よろしいですか？')
  if (!confirmed) return
  try {
    await documentStore.deleteDocumentForever(id)
  } catch (error) {
    console.error('Failed to permanently delete document', error)
    window.alert('完全削除に失敗しました。通信状況を確認して再度お試しください。')
  }
}
</script>
