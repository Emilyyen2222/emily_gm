<script setup lang="ts">
import { buildDailyFlexMessage } from '#shared/utils/flexMessage'
import { emptyRecordInput } from '#shared/types/record'

/**
 * 由簡到繁依序送出訊息，找出 liff.sendMessages() 從哪一種開始被拒絕。
 *
 * 存在的理由：LINE 的 validate/push 端點驗的是「機器人發送」那條路，
 * 但卡片實際走的是「使用者發送」，規則更嚴格且無法從外部驗證。
 * 只能在真實的 LIFF 環境裡實測。
 */
const { ready, initError, canShareToChat, contextType, init } = useLiff()
const results = ref<{ name: string; ok: boolean; error?: string }[]>([])
const running = ref(false)

onMounted(() => init())

const sample = {
  ...emptyRecordInput(),
  recordDate: '2026-09-12',
  displayName: '測試',
  sleepScore: 80,
  sleepHours: 7,
  bedTime: '00:00',
  wakeTime: '07:00',
  sleepNote: '測試備註',
  mood: '😊',
  steps: 8000,
  liverCare: ['敲肝經膽經'],
  liverScore: 1,
  updatedAt: null,
} as any

const full = buildDailyFlexMessage(sample)
const noFooter = JSON.parse(JSON.stringify(full))
delete noFooter.contents.footer
const bodyOnlyRows = JSON.parse(JSON.stringify(noFooter))
bodyOnlyRows.contents.body.contents = bodyOnlyRows.contents.body.contents.slice(0, 4)

const variants: { name: string; message: any }[] = [
  { name: '1・純文字', message: { type: 'text', text: '測試訊息' } },
  {
    name: '2・最簡 Flex',
    message: {
      type: 'flex',
      altText: '最簡測試',
      contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'hello' }] } },
    },
  },
  { name: '3・卡片前四段（無備註、無進度條、無 footer）', message: bodyOnlyRows },
  { name: '4・完整卡片但拿掉 footer 按鈕', message: noFooter },
  { name: '5・完整卡片（含拍拍按鈕）', message: full },
]

async function run() {
  running.value = true
  results.value = []
  const liff = (await import('@line/liff')).default
  for (const v of variants) {
    try {
      await liff.sendMessages([v.message])
      results.value.push({ name: v.name, ok: true })
    } catch (err: any) {
      results.value.push({ name: v.name, ok: false, error: `${err?.code ?? ''} ${err?.message ?? err}` })
      break // 第一個失敗的就是分界點，後面不用再送，也免得洗版
    }
  }
  running.value = false
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream px-4 py-6">
    <h1 class="text-h2 font-bold text-brand-brown">送出測試</h1>
    <p class="mt-1 text-body text-brand-brown-light">
      情境 {{ contextType }}・可分享 {{ canShareToChat }}
    </p>
    <p v-if="initError" class="mt-4 rounded-xl bg-red-50 p-3 text-body text-red-700">{{ initError }}</p>

    <button
      :disabled="!ready || running"
      class="mt-5 h-14 w-full rounded-2xl bg-brand-orange text-body-lg font-bold text-white disabled:opacity-50"
      @click="run"
    >
      {{ running ? '測試中…' : '開始依序送出' }}
    </button>

    <div v-if="results.length" class="mt-5 space-y-2">
      <div
        v-for="r in results"
        :key="r.name"
        class="rounded-xl border-2 p-3 text-body"
        :class="r.ok ? 'border-brand-border bg-white text-brand-brown' : 'border-red-200 bg-red-50 text-red-700'"
      >
        <p class="font-bold">{{ r.ok ? '✓' : '✗' }} {{ r.name }}</p>
        <p v-if="r.error" class="mt-1 break-all text-caption">{{ r.error }}</p>
      </div>
      <p class="pt-2 text-caption text-brand-brown-light">
        最後一個打勾的是安全的，打叉的那個就是問題所在。
      </p>
    </div>
  </div>
</template>
