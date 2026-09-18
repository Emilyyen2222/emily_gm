<script setup lang="ts">
import { TEMP_MAX, TEMP_MIN } from '#shared/types/record'

const model = defineModel<number | null>()
defineProps<{ label: string; hint?: string; placeholder?: string }>()

/** 輸入中允許暫時的空字串與半形小數點，離開欄位時才收斂成數字 */
const text = computed({
  get: () => (model.value === null || model.value === undefined ? '' : String(model.value)),
  set: (v: string) => {
    const n = Number(v)
    model.value = v === '' || !Number.isFinite(n) ? null : n
  },
})

/** 超出範圍不靜默丟掉，當場說清楚 —— 不然使用者以為存進去了 */
const outOfRange = computed(() => model.value !== null && (model.value < TEMP_MIN || model.value > TEMP_MAX))
</script>

<template>
  <div>
    <div class="flex items-center gap-3">
      <div class="min-w-0 flex-1">
        <p class="text-body text-brand-brown">{{ label }}</p>
        <p v-if="hint" class="text-caption text-brand-brown-light">{{ hint }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <input
          v-model="text"
          type="number"
          inputmode="decimal"
          step="0.1"
          :min="TEMP_MIN"
          :max="TEMP_MAX"
          :placeholder="placeholder ?? '36.5'"
          class="w-24 rounded-xl border-2 bg-white px-3 py-2.5 text-right text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:outline-none"
          :class="outOfRange ? 'border-red-300 focus:border-red-400' : 'border-brand-border focus:border-brand-orange'"
        />
        <span class="text-body text-brand-brown-light">°C</span>
      </div>
    </div>
    <p v-if="outOfRange" class="mt-1 text-right text-caption text-red-600">
      {{ TEMP_MIN }} 到 {{ TEMP_MAX }} 之間才會存起來
    </p>
  </div>
</template>
