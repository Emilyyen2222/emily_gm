<script setup lang="ts">
import { NOTE_MAX_LENGTH } from '#shared/types/record'

const model = defineModel<string | null>()
const props = defineProps<{ placeholder?: string; label?: string }>()

// null 與空字串在 UI 上是同一件事，送到後端時要是 null
const text = computed({
  get: () => model.value ?? '',
  set: (v: string) => { model.value = v.trim() ? v : null },
})

// 預設收合，讓平常快速填寫的路徑短一點。
// 已經有內容的話直接展開 —— 不然回來補填時會看不到自己寫過什麼。
const expanded = ref(Boolean(model.value))
watch(model, (v) => { if (v) expanded.value = true })

const input = ref<HTMLTextAreaElement | null>(null)
async function expand() {
  expanded.value = true
  await nextTick()
  input.value?.focus()
}
</script>

<template>
  <div>
    <button
      v-if="!expanded"
      type="button"
      class="flex h-10 items-center gap-1.5 text-body font-medium text-brand-orange"
      @click="expand"
    >
      <span class="text-body-lg leading-none">＋</span>
      <span>{{ props.label ?? '加備註' }}</span>
    </button>

    <div v-else>
      <textarea
        ref="input"
        v-model="text"
        :placeholder="props.placeholder ?? '想補充什麼都可以寫（選填）'"
        :maxlength="NOTE_MAX_LENGTH"
        rows="2"
        class="w-full resize-none rounded-xl border-2 border-brand-border bg-white px-4 py-3 text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
      />
      <div class="mt-1 flex items-center justify-between">
        <button
          v-if="!text"
          type="button"
          class="text-caption text-brand-brown-light underline"
          @click="expanded = false"
        >收起</button>
        <span v-else />
        <span v-if="text.length > NOTE_MAX_LENGTH - 40" class="text-caption text-brand-brown-light">
          {{ text.length }} / {{ NOTE_MAX_LENGTH }}
        </span>
      </div>
    </div>
  </div>
</template>
