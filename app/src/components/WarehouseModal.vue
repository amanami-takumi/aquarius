<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
    role="dialog"
    aria-modal="true"
  >
    <div class="flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 text-sm text-neutral-100 shadow-xl">
      <header class="flex items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4">
        <div>
          <h2 class="text-base font-semibold">倉庫</h2>
          <p class="text-xs text-neutral-400">アーカイブ済みのノートを管理できます。</p>
        </div>
        <button
          type="button"
          class="rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 transition hover:border-neutral-500 hover:text-accent"
          @click="$emit('close')"
        >
          閉じる
        </button>
      </header>

      <div class="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
        <div
          v-if="!documents.length"
          class="flex flex-1 items-center justify-center rounded-md border border-dashed border-neutral-700 bg-neutral-900/40 p-6 text-neutral-400"
        >
          倉庫に保管されているノートはありません。
        </div>

        <ul v-else class="flex-1 space-y-3 overflow-y-auto pr-2">
          <li
            v-for="doc in documents"
            :key="doc.id"
            class="rounded-md border border-neutral-800 bg-neutral-900/60 p-4"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-neutral-100" :title="doc.title">{{ doc.title }}</p>
                <p class="text-xs text-neutral-400">
                  最終更新: {{ formatDate(doc.updatedAt) }} / 倉庫入り: {{ formatDate(doc.archivedAt) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  class="rounded-md border border-neutral-700 px-3 py-1 text-neutral-200 transition hover:border-neutral-500 hover:text-accent"
                  @click="$emit('restore', doc.id)"
                >
                  復元
                </button>
                <button
                  type="button"
                  class="rounded-md border border-rose-800/60 px-3 py-1 text-rose-300 transition hover:border-rose-500 hover:text-rose-200"
                  @click="$emit('delete', doc.id)"
                >
                  完全削除
                </button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ArchivedDocumentEntry } from '../stores/documentStore'

defineProps<{
  open: boolean
  documents: ArchivedDocumentEntry[]
}>()

defineEmits<{
  close: []
  restore: [id: string]
  delete: [id: string]
}>()

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}
</script>
