<script setup lang="ts">
const model = defineModel<string | null>()
defineProps<{ label?: string }>()

// 原生 time input 不吃 null，空字串才是「未填」
const value = computed({
  get: () => model.value ?? '',
  set: (v: string) => { model.value = v || null },
})
</script>

<template>
  <div>
    <label v-if="label" class="mb-2 block text-body text-brand-brown-light">{{ label }}</label>
    <div class="relative">
      <input
        v-model="value"
        type="time"
        class="rounded-xl border-2 border-brand-border bg-white px-4 text-brand-brown focus:border-brand-orange focus:outline-none"
      >
      <button
        v-if="value"
        type="button"
        aria-label="清除時間"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-brand-brown-light underline"
        @click="value = ''"
      >清除</button>
    </div>
  </div>
</template>
