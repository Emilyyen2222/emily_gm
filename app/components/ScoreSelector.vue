<script setup lang="ts">
const model = defineModel<number | null>()
const props = defineProps<{ name: string; max?: number }>()
const options = computed(() => Array.from({ length: props.max ?? 5 }, (_, i) => i + 1))
</script>

<template>
  <div class="grid grid-cols-5 gap-2">
    <label v-for="n in options" :key="n" class="relative">
      <input
        v-model="model"
        type="radio"
        :name="name"
        :value="n"
        class="peer sr-only"
      >
      <span
        class="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-gray-200 bg-white text-lg font-semibold text-gray-500 transition peer-checked:border-brand-500 peer-checked:bg-brand-500 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400"
      >{{ n }}</span>
    </label>
  </div>
</template>
