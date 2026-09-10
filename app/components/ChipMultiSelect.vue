<script setup lang="ts">
const model = defineModel<string[]>({ default: () => [] })
const props = defineProps<{ options: readonly string[]; exclusive?: string }>()

function toggle(option: string) {
  const selected = model.value.includes(option)

  // 「無」與其他症狀互斥：選了無就清掉其他，選了其他就清掉無
  if (props.exclusive) {
    if (option === props.exclusive) {
      model.value = selected ? [] : [props.exclusive]
      return
    }
    const rest = model.value.filter((v) => v !== props.exclusive)
    model.value = selected ? rest.filter((v) => v !== option) : [...rest, option]
    return
  }

  model.value = selected ? model.value.filter((v) => v !== option) : [...model.value, option]
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="option in options"
      :key="option"
      type="button"
      class="min-h-12 rounded-xl border-2 px-4 text-sm font-medium transition"
      :class="model.includes(option)
        ? 'border-brand-500 bg-brand-500 text-white'
        : 'border-gray-200 bg-white text-gray-600'"
      @click="toggle(option)"
    >
      {{ option }}
    </button>
  </div>
</template>
