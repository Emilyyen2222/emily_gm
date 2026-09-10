<script setup lang="ts">
import { NOTE_MAX_LENGTH } from '#shared/types/record'

const model = defineModel<string | null>()
defineProps<{ placeholder?: string }>()

// null 與空字串在 UI 上是同一件事，但送到後端時要是 null
const text = computed({
  get: () => model.value ?? '',
  set: (v: string) => { model.value = v.trim() ? v : null },
})
</script>

<template>
  <div>
    <textarea
      v-model="text"
      :placeholder="placeholder ?? '想補充什麼都可以寫（選填）'"
      :maxlength="NOTE_MAX_LENGTH"
      rows="2"
      class="w-full resize-none rounded-xl border-2 border-brand-border bg-white px-4 py-3 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
    />
    <p v-if="text.length > NOTE_MAX_LENGTH - 40" class="mt-1 text-right text-caption text-brand-brown-light">
      {{ text.length }} / {{ NOTE_MAX_LENGTH }}
    </p>
  </div>
</template>
