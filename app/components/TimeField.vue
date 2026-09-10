<script setup lang="ts">
const model = defineModel<string | null>()
defineProps<{ label?: string }>()

/**
 * 不使用原生的 input[type=time]。
 * 手機的原生時間選擇器會依系統語言顯示成「上午／下午 12 點」，
 * 而上午 12 點是半夜、下午 12 點是中午 —— 這個慣例本身就反直覺，
 * 偏偏就寢時間最常落在午夜前後，正好踩在最模糊的地帶。
 * 網頁無法強制原生選擇器改用 24 小時制，只能自己做。
 */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const hour = computed({
  get: () => model.value?.slice(0, 2) ?? '',
  set: (h: string) => {
    if (!h) return (model.value = null)
    model.value = `${h}:${model.value?.slice(3, 5) ?? '00'}`
  },
})

const minute = computed({
  get: () => model.value?.slice(3, 5) ?? '',
  set: (m: string) => {
    if (!model.value) return
    model.value = `${model.value.slice(0, 2)}:${m}`
  },
})

/** 用中文再講一次，讓使用者能一眼確認自己沒選錯 */
const spoken = computed(() => {
  if (!model.value) return null
  const h = Number(model.value.slice(0, 2))
  const m = Number(model.value.slice(3, 5))

  let period: string
  let display: number
  if (h === 0) { period = '半夜'; display = 12 }
  else if (h < 5) { period = '凌晨'; display = h }
  else if (h < 12) { period = '早上'; display = h }
  else if (h === 12) { period = '中午'; display = 12 }
  else if (h < 18) { period = '下午'; display = h - 12 }
  else { period = '晚上'; display = h - 12 }

  return m === 0 ? `${period} ${display} 點` : `${period} ${display} 點 ${m} 分`
})
</script>

<template>
  <div>
    <div class="mb-2 flex items-baseline justify-between">
      <label v-if="label" class="text-body text-brand-brown-light">{{ label }}</label>
      <button
        v-if="model"
        type="button"
        class="text-caption text-brand-brown-light underline"
        @click="model = null"
      >清除</button>
    </div>

    <div class="flex items-center gap-2">
      <select
        v-model="hour"
        class="h-12 flex-1 rounded-xl border-2 border-brand-border bg-white px-3 text-brand-brown focus:border-brand-orange focus:outline-none"
      >
        <option value="">--</option>
        <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
      </select>

      <span class="text-body-lg font-bold text-brand-brown-light">:</span>

      <select
        v-model="minute"
        :disabled="!model"
        class="h-12 flex-1 rounded-xl border-2 border-brand-border bg-white px-3 text-brand-brown focus:border-brand-orange focus:outline-none disabled:opacity-50"
      >
        <option value="">--</option>
        <option v-for="m in MINUTES" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>

    <p v-if="spoken" class="mt-1.5 text-caption text-brand-brown-light">{{ spoken }}</p>
  </div>
</template>
