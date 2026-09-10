<script setup lang="ts">
const model = defineModel<string | null>()
defineProps<{ options: readonly string[] }>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="option in options"
      :key="option"
      type="button"
      class="min-h-12 flex-1 rounded-xl border-2 px-4 text-body font-medium transition"
      :class="model === option
        ? 'border-brand-orange bg-brand-orange text-white'
        : 'border-brand-border bg-white text-brand-brown-light'"
      @click="model = model === option ? null : option"
    >
      {{ option }}
    </button>
  </div>
</template>
