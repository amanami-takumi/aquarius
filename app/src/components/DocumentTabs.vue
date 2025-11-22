<template>
  <nav class="w-full overflow-x-auto border-b border-neutral-800">
    <ul class="flex min-h-[3rem] items-center gap-2 pb-1">
      <li
        v-for="doc in documents"
        :key="doc.id"
        class="group flex items-center"
      >
        <button
          type="button"
          class="flex items-center gap-2 rounded-t-lg border border-neutral-800/50 bg-neutral-900/70 px-4 py-2 text-sm transition hover:bg-neutral-800"
          :class="doc.id === activeId ? 'text-accent border-neutral-700 bg-neutral-900' : 'text-neutral-300'"
          @click="$emit('select', doc.id)"
        >
          <span class="truncate max-w-[160px]" :title="doc.title">{{ doc.title }}</span>
          <span v-if="doc.isDirty" class="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          <button
            type="button"
            class="opacity-50 transition hover:opacity-100"
            @click.stop="$emit('close', doc.id)"
            aria-label="タブを閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
              <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 0 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import type { DocumentEntry } from '../stores/documentStore'

defineProps<{
  documents: DocumentEntry[]
  activeId: string
}>()

defineEmits<{
  select: [id: string]
  close: [id: string]
}>()
</script>
