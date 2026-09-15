<script setup lang="ts">
/**
 * variant 'aside' 是給「不會進今日狀態卡片」的區塊用的（只給自己的、記帳）。
 * 白底＝會上卡片、米底＝不會，規則一致，使用者不必逐條讀小字說明才知道
 * 自己填的東西會跑去哪裡。
 */
defineProps<{ title: string; hint?: string; badge?: string; variant?: 'default' | 'aside' }>()
</script>

<template>
  <section
    class="rounded-2xl border p-4"
    :class="variant === 'aside'
      ? 'border-brand-panel bg-brand-hover'
      : 'border-brand-border bg-white shadow-sm'"
  >
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
