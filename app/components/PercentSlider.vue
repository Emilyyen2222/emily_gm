<script setup lang="ts">
const model = defineModel<number | null>()
const props = withDefaults(defineProps<{ labels?: [string, string, string]; step?: number }>(), {
  step: 5,
})

/** 還沒填時滑桿停在中間，但用灰色呈現，避免看起來像已經選了 50% */
const isSet = computed(() => model.value !== null)
const position = computed(() => model.value ?? 50)

function onInput(event: Event) {
  model.value = Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between">
      <span class="text-caption text-brand-brown-light">滿意度</span>
      <span class="text-h2 font-bold tabular-nums" :class="isSet ? 'text-brand-orange' : 'text-brand-brown-light/40'">
        {{ isSet ? `${model}%` : '—' }}
      </span>
    </div>

    <input
      type="range"
      min="0"
      max="100"
      :step="props.step"
      :value="position"
      class="mt-2"
      :class="isSet ? 'slider-set' : 'slider-unset'"
      :style="{ '--pct': `${position}%` }"
      @input="onInput"
    >

    <div class="mt-1 flex justify-between text-caption text-brand-brown-light/70">
      <span>{{ props.labels?.[0] ?? '很差' }}</span>
      <span>{{ props.labels?.[1] ?? '普通' }}</span>
      <span>{{ props.labels?.[2] ?? '很好' }}</span>
    </div>

    <p v-if="!isSet" class="mt-2 text-caption text-brand-brown-light">滑動一下開始記錄</p>
  </div>
</template>
