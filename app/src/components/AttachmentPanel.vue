<template>
  <aside
    class="flex h-full min-h-[18rem] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-200"
  >
    <div class="flex flex-wrap items-center justify-between gap-2 flex-none">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">添付画像</h2>
      <span v-if="uploading" class="text-[11px] text-accent">アップロード中…</span>
    </div>

    <div class="mt-3 flex-none space-y-3">
      <label class="block cursor-pointer rounded-md border border-dashed border-neutral-700 bg-neutral-900/70 px-3 py-3 text-center text-neutral-300 transition hover:border-neutral-500 hover:text-accent">
        画像を選択（複数可）
        <input
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onFileChange"
        />
      </label>
      <p class="text-[11px] leading-relaxed text-neutral-500">
        対応形式: PNG/JPEG/GIF/WebP/SVG。10MBまで。
      </p>
      <p v-if="error" class="rounded bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
        {{ error }}
      </p>
    </div>

    <div class="mt-4 flex-1 space-y-2 overflow-y-auto pr-1 max-h-[60vh] lg:max-h-none" role="list">
      <p v-if="loading" class="text-[12px] text-neutral-400">読み込み中…</p>
      <p v-else-if="!attachments.length" class="text-[12px] text-neutral-500">添付された画像はありません</p>

      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="flex flex-col gap-3 rounded-md border border-neutral-800/60 bg-neutral-900/50 p-3 sm:flex-row sm:items-start"
        role="listitem"
      >
        <div class="flex h-40 w-full items-center justify-center overflow-hidden rounded border border-neutral-800 bg-neutral-950 sm:h-16 sm:w-16">
          <img
            :src="attachment.displayUrl"
            :srcset="buildSrcset(attachment) || undefined"
            :sizes="buildSrcset(attachment) ? '(max-width: 1024px) 100vw, 320px' : undefined"
            :alt="attachment.filename"
            class="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div class="flex-1 space-y-1">
          <p class="font-medium text-neutral-200" :title="attachment.filename">
            {{ attachment.filename }}
          </p>
          <p class="text-[11px] text-neutral-500">
            {{ formatSize(attachment.size) }} / {{ formatDate(attachment.createdAt) }}
          </p>
          <div class="flex flex-wrap gap-2 text-[11px] text-neutral-300">
            <button
              type="button"
              class="rounded border border-neutral-700 px-2 py-1 transition hover:border-neutral-500 hover:text-accent"
              @click="openPreview(attachment.downloadUrl)"
            >
              プレビュー
            </button>
            <button
              type="button"
              class="rounded border border-neutral-700 px-2 py-1 transition hover:border-neutral-500 hover:text-accent"
              @click="copyMarkdown(attachment)"
            >
              {{ copiedMarkdownId === attachment.id ? 'コピー済み' : 'Markdownコピー' }}
            </button>
            <button
              type="button"
              class="rounded border border-neutral-700 px-2 py-1 transition hover:border-neutral-500 hover:text-accent"
              @click="copyImage(attachment)"
            >
              {{ copiedImageId === attachment.id ? 'コピー済み' : 'クリップボードへコピー' }}
            </button>
            <button
              type="button"
              class="rounded border border-rose-800/60 px-2 py-1 text-rose-300 transition hover:border-rose-500 hover:text-rose-200"
              @click="$emit('remove', attachment.id)"
            >
              削除
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { AttachmentEntry } from '../stores/attachmentStore'

defineProps<{
  attachments: AttachmentEntry[]
  loading: boolean
  uploading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  upload: [files: File[]]
  remove: [id: string]
}>()

const copiedMarkdownId = ref<string>('')
const copiedImageId = ref<string>('')
let markdownCopyTimer: number | undefined
let imageCopyTimer: number | undefined

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  emit('upload', files)
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

function buildSrcset(attachment: AttachmentEntry) {
  const variants = [...(attachment.variants ?? [])]
  if (!variants.length) {
    return ''
  }
  const descriptors: string[] = []
  variants
    .filter((variant) => Boolean(variant.downloadUrl))
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
    .forEach((variant, index) => {
      descriptors.push(`${variant.downloadUrl} ${index + 1}x`)
    })
  if (attachment.downloadUrl) {
    descriptors.push(`${attachment.downloadUrl} ${descriptors.length + 1}x`)
  }
  return descriptors.join(', ')
}

async function copyMarkdown(attachment: AttachmentEntry) {
  const markdown = `![${attachment.filename}](${attachment.downloadUrl})`
  const copied = await copyToClipboard(markdown)
  if (copied) {
    copiedMarkdownId.value = attachment.id
    if (markdownCopyTimer) {
      clearTimeout(markdownCopyTimer)
    }
    markdownCopyTimer = window.setTimeout(() => {
      copiedMarkdownId.value = ''
    }, 2000)
    return
  }

  window.prompt('以下の内容をコピーしてください', markdown)
}

function openPreview(url: string) {
  window.open(url, '_blank')
}

async function copyImage(attachment: AttachmentEntry) {
  const markdown = `![${attachment.filename}](${attachment.downloadUrl})`
  const copied = await copyToClipboard(markdown)
  if (copied) {
    copiedImageId.value = attachment.id
    if (imageCopyTimer) {
      clearTimeout(imageCopyTimer)
    }
    imageCopyTimer = window.setTimeout(() => {
      copiedImageId.value = ''
    }, 2000)
    return
  }

  window.prompt('以下の内容をコピーしてください', markdown)
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.warn('Clipboard API failed, falling back to execCommand', error)
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    return successful
  } catch (error) {
    console.error('Fallback clipboard copy failed', error)
    return false
  }
}

onBeforeUnmount(() => {
  if (markdownCopyTimer) {
    clearTimeout(markdownCopyTimer)
  }
  if (imageCopyTimer) {
    clearTimeout(imageCopyTimer)
  }
})
</script>
