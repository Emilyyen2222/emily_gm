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
const results = ref<Record<string, { ok: boolean; error?: string }>>({})
const running = ref<string | null>(null)

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

// 一次只送一則。liff.sendMessages() 有速率限制，連續送會被 429 擋掉，
// 那個錯誤會蓋掉我們真正想找的 INVALID_MESSAGE。
async function send(v: { name: string; message: any }) {
  running.value = v.name
  const liff = (await import('@line/liff')).default
  try {
    await liff.sendMessages([v.message])
    results.value = { ...results.value, [v.name]: { ok: true } }
  } catch (err: any) {
    results.value = { ...results.value, [v.name]: { ok: false, error: `${err?.code ?? ''} ${err?.status ?? ''} ${err?.message ?? err}` } }
  }
  running.value = null
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream px-4 py-6">
    <h1 class="text-h2 font-bold text-brand-brown">送出測試</h1>
    <p class="mt-1 text-body text-brand-brown-light">
      情境 {{ contextType }}・可分享 {{ canShareToChat }}
    </p>
    <p v-if="initError" class="mt-4 rounded-xl bg-red-50 p-3 text-body text-red-700">{{ initError }}</p>

    <p class="mt-4 text-caption text-brand-brown-light">
      一次按一顆，每顆之間等幾秒 —— 連續送會被 LINE 限流（429），
      那個錯誤會蓋掉真正的原因。建議從最下面的 5 開始往上按。
    </p>

    <div class="mt-4 space-y-3">
      <div v-for="v in variants" :key="v.name">
        <button
          :disabled="!ready || running !== null"
          class="h-12 w-full rounded-xl border-2 border-brand-orange bg-white px-4 text-body font-bold text-brand-brown disabled:opacity-50"
          @click="send(v)"
        >
          {{ running === v.name ? '送出中…' : v.name }}
        </button>
        <p
          v-if="results[v.name]"
          class="mt-1 break-all rounded-lg p-2 text-caption"
          :class="results[v.name]!.ok ? 'bg-white text-brand-green' : 'bg-red-50 text-red-700'"
        >
          {{ results[v.name]!.ok ? '✓ 成功' : '✗ ' + results[v.name]!.error }}
        </p>
      </div>
    </div>
  </div>
</template>
