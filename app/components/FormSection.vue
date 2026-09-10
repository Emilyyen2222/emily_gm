<script setup lang="ts">
defineProps<{ title: string; hint?: string; badge?: string }>()
</script>

<template>
  <section class="rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
    <div class="mb-3 flex items-baseline justify-between gap-3">
      <div>
        <h2 class="text-h3 font-bold text-brand-brown">{{ title }}</h2>
        <p v-if="hint" class="mt-0.5 text-caption text-brand-brown-light">{{ hint }}</p>
      </div>
      <span v-if="badge" class="shrink-0 text-body font-bold text-brand-orange">{{ badge }}</span>
    </div>
    <slot />
  </section>
</template>
