<template>
  <div class="flex h-full min-w-0 flex-col gap-4">
    <div class="flex flex-col gap-3 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap items-center gap-3 sm:gap-4">
        <span>最終更新: {{ formatDate(document.updatedAt) }}</span>
        <span v-if="document.syncedAt">同期済み: {{ formatDate(document.syncedAt) }}</span>
        <span v-else class="text-amber-300">未同期</span>
      </div>
      <div class="flex flex-wrap items-center gap-3 sm:justify-end">
        <div class="inline-flex overflow-hidden rounded-md border border-neutral-700 bg-neutral-900/60 text-neutral-300">
          <button
            type="button"
            class="px-3 py-1 font-medium"
            :class="viewMode === 'edit' ? 'bg-accent/20 text-accent' : 'hover:bg-neutral-800'"
            @click="setViewMode('edit')"
          >
            編集
          </button>
          <button
            type="button"
            class="px-3 py-1 font-medium"
            :class="viewMode === 'preview' ? 'bg-accent/20 text-accent' : 'hover:bg-neutral-800'"
            @click="setViewMode('preview')"
          >
            表示
          </button>
        </div>
        <span v-if="document.isDirty" class="text-amber-300">保存待ち</span>
      </div>
    </div>

    <div class="relative h-[60vh] min-h-[320px] min-w-0 sm:h-[65vh]">
      <textarea
        v-if="viewMode === 'edit'"
        ref="textareaRef"
        v-model="localContent"
        class="h-full w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 p-4 font-mono text-sm text-neutral-200 shadow-inner focus:border-accent focus:outline-none"
        placeholder="---\ntitle: New Note\nurl: https://example.com\ndate: 2024-02-19T07:30Z\nlastmod: 2024-02-21T15:09:58Z\n---\n\nここにMarkdownを書き始めましょう！"
        @input="handleInput"
        @keydown="handleKeydown"
      />
      <div
        v-else
        class="h-full overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-200"
      >
        <article v-if="hasContent" class="prose prose-invert prose-sm max-w-none">
          <div v-html="renderedContent" />
        </article>
        <p v-else class="text-sm text-neutral-500">まだ内容がありません。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { DocumentEntry } from '../stores/documentStore'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ document: DocumentEntry }>()
const emit = defineEmits<{ 'update:content': [value: string] }>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const localContent = ref(props.document.content)
const viewMode = ref<'edit' | 'preview'>('edit')

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

const defaultRender = markdown.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const targetIndex = token.attrIndex('target')
  if (targetIndex < 0) {
    token.attrPush(['target', '_blank'])
  } else {
    token.attrs![targetIndex][1] = '_blank'
  }

  const relIndex = token.attrIndex('rel')
  if (relIndex < 0) {
    token.attrPush(['rel', 'noopener noreferrer'])
  } else {
    token.attrs![relIndex][1] = 'noopener noreferrer'
  }

  return defaultRender(tokens, idx, options, env, self)
}

const renderedContent = computed(() => markdown.render(localContent.value || ''))
const hasContent = computed(() => localContent.value.trim().length > 0)

watch(
  () => props.document.id,
  () => {
    localContent.value = props.document.content
    viewMode.value = 'edit'
  }
)

watch(
  () => props.document.content,
  (value) => {
    if (value !== localContent.value) {
      localContent.value = value
    }
  }
)

onMounted(() => {
  if (textareaRef.value) {
    textareaRef.value.focus()
  }
})

watch(viewMode, (mode) => {
  if (mode === 'edit') {
    nextTick(() => {
      if (textareaRef.value) {
        textareaRef.value.focus()
      }
    })
  }
})

function formatDate(value: string | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

function handleInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  emit('update:content', value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || !textareaRef.value) return

  const textarea = textareaRef.value
  const value = textarea.value
  const selectionStart = textarea.selectionStart
  const selectionEnd = textarea.selectionEnd

  const before = value.slice(0, selectionStart)
  const after = value.slice(selectionEnd)

  const lineStart = before.lastIndexOf('\n') + 1
  const currentLine = before.slice(lineStart)

  const bulletMatch = currentLine.match(/^(\s*)([-*+]\s+|\d+[.)]\s+)(.*)$/)
  if (!bulletMatch) return

  event.preventDefault()

  const [, indent, marker, text] = bulletMatch
  const trimmed = text.trim()

  if (!trimmed) {
    const newValue = `${value.slice(0, lineStart)}${after.startsWith('\n') ? after.slice(1) : after}`
    updateTextarea(newValue, lineStart)
    return
  }

  let nextMarker = marker.trim()
  const numericMatch = nextMarker.match(/^(\d+)([.)])$/)
  if (numericMatch) {
    const [, num, suffix] = numericMatch
    nextMarker = `${Number(num) + 1}${suffix}`
  }

  const insert = `\n${indent}${nextMarker} `
  const newValue = `${before}${insert}${after}`
  updateTextarea(newValue, selectionStart + insert.length)
}

function updateTextarea(value: string, cursor: number) {
  if (!textareaRef.value) return
  textareaRef.value.value = value
  textareaRef.value.setSelectionRange(cursor, cursor)
  localContent.value = value
  emit('update:content', value)
}

function setViewMode(mode: 'edit' | 'preview') {
  if (viewMode.value === mode) return
  viewMode.value = mode
}
</script>
