<template>
  <div class="flex flex-wrap items-center gap-2 text-sm">
    <button
      type="button"
      class="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 font-medium text-neutral-200 shadow hover:border-neutral-500 hover:text-accent"
      @click="$emit('create-document')"
    >
      新規ノート
    </button>

    <button
      type="button"
      class="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-500 hover:text-accent"
      :disabled="!activeDocument"
      :class="!activeDocument ? 'opacity-40 cursor-not-allowed' : ''"
      @click="promptRename"
    >
      タイトル変更
    </button>

    <label
      class="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-500 hover:text-accent"
    >
      インポート
      <input ref="fileInput" type="file" accept="application/zip" class="hidden" @change="triggerImport" />
    </label>

    <button
      type="button"
      class="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-500 hover:text-accent"
      @click="$emit('export-documents')"
    >
      エクスポート
    </button>

    <button
      type="button"
      class="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 transition hover:border-neutral-500 hover:text-accent"
      @click="$emit('open-warehouse')"
    >
      倉庫を見る<span v-if="archivedCount" class="ml-1 text-xs text-neutral-400">({{ archivedCount }})</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { DocumentEntry } from '../stores/documentStore'

const props = defineProps<{ activeDocument: DocumentEntry | null; archivedCount: number }>()
const emit = defineEmits<{
  'create-document': []
  'rename-document': [{ id: string; title: string }]
  'import-documents': [file: File]
  'export-documents': []
  'open-warehouse': []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

function promptRename() {
  if (!props.activeDocument) return
  const nextTitle = window.prompt('タイトルを入力してください', props.activeDocument.title)
  if (!nextTitle) return
  emit('rename-document', { id: props.activeDocument.id, title: nextTitle.trim() })
}

function triggerImport(event: Event) {
  const input = event.target as HTMLInputElement
  const [file] = input.files ?? []
  input.value = ''
  if (!file) return
  emit('import-documents', file)
}
</script>
