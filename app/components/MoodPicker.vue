<script setup lang="ts">
const model = defineModel<string | null>()
defineProps<{ options: readonly string[] }>()
</script>

<template>
  <div class="grid grid-cols-4 gap-2">
    <label v-for="mood in options" :key="mood" class="relative">
      <input v-model="model" type="radio" name="mood" :value="mood" class="peer sr-only">
      <span
        class="flex h-14 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-2xl transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400"
      >{{ mood }}</span>
    </label>
  </div>
</template>
