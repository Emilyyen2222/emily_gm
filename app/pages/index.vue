<script setup lang="ts">
import {
  ALLERGY_OPTIONS,
  LIVER_CARE_OPTIONS,
  LIVER_CARE_TOTAL,
  MOOD_OPTIONS,
  computeSleepHours,
  countFilled,
  emptyRecordInput,
  type RecordsResponse,
  type SubmitRecordResponse,
} from '#shared/types/record'
import { buildDailyFlexMessage } from '#shared/utils/flexMessage'

const { ready, initError, displayName, canShareToChat, chatId, init, getIdToken, sendToChat, close } = useLiff()

const form = ref(emptyRecordInput())
const loading = ref(true)
const pending = ref(false)
const submitError = ref<string | null>(null)
const prefillFailed = ref(false)
const isUpdate = ref(false)
const savedAt = ref<string | null>(null)

const liverPercent = computed(() => Math.round((form.value.liverCare.length / LIVER_CARE_TOTAL) * 100))
const progress = computed(() => countFilled(form.value))

/** 睡眠時數由入睡與起床時間即時算出，讓使用者填完馬上看到 */
const sleepHours = computed(() => computeSleepHours(form.value.bedTime, form.value.wakeTime))

/** 出門到離開公司之間的時數。跨夜（例如 09:00 出門、隔日 01:00 離開）也算得出來 */
const workHours = computed(() => {
  const { leaveHomeTime: from, leaveOfficeTime: to } = form.value
  if (!from || !to) return null
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  let diff = toMin(to) - toMin(from)
  if (diff < 0) diff += 24 * 60
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
})

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }

  form.value.shared = canShareToChat.value
  form.value.sourceChatId = chatId.value

  // 今天填過就把內容帶回來，讓使用者是「補完／修改」而不是重填一次
  try {
    const idToken = await getIdToken()
    const data = await $fetch<RecordsResponse>('/api/records/me', {
      query: { days: 1 },
      headers: { 'x-liff-id-token': idToken },
    })
    const today = data.records.find((r) => r.recordDate === data.today)
    if (today) {
      isUpdate.value = true
      const { shared, sourceChatId, ...rest } = today
      Object.assign(form.value, rest)
      form.value.allergy = [...today.allergy]
      form.value.liverCare = [...today.liverCare]
    }
  } catch {
    // 讀不到舊資料時要明講。靜默失敗的話，使用者以為自己在補填，
    // 送出後卻把早上填過的內容整個覆蓋成空的。
    prefillFailed.value = true
  } finally {
    loading.value = false
  }
})

async function submit() {
  if (pending.value) return
  pending.value = true
  submitError.value = null

  try {
    const idToken = await getIdToken()
    const { record } = await $fetch<SubmitRecordResponse>('/api/records', {
      method: 'POST',
      body: { ...form.value, idToken },
    })

    if (form.value.shared && canShareToChat.value) {
      await sendToChat(buildDailyFlexMessage({ ...record, displayName: record.displayName ?? displayName.value }))
      close()
      return
    }

    // 沒有要分享時不關閉視窗，讓使用者知道存好了、還能繼續補其他欄位
    isUpdate.value = true
    savedAt.value = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  } catch (err: any) {
    submitError.value = err?.data?.statusMessage ?? err?.message ?? '送出失敗，請稍後再試'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-cream pb-28">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-5">
        <div class="flex items-center gap-2">
          <span class="h-5 w-1 rounded-full bg-brand-orange" />
          <span class="text-caption font-bold uppercase tracking-wide text-brand-orange">Good Morning</span>
        </div>
        <h1 class="mt-2 text-h1 font-bold text-brand-brown">今日狀態</h1>
        <p class="mt-1 text-body text-brand-brown-light">
          <span v-if="displayName">{{ displayName }}，</span>
          <span v-if="isUpdate">今天已經記過了，可以隨時回來補</span>
          <span v-else>想到什麼填什麼，不用一次填完</span>
        </p>
      </header>

      <div v-if="initError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-body text-red-700">
        {{ initError }}
      </div>

      <div v-else-if="loading" class="space-y-4">
        <div v-for="i in 4" :key="i" class="h-28 animate-pulse rounded-2xl bg-brand-panel/60" />
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <p
          v-if="prefillFailed"
          class="rounded-2xl border-2 border-brand-gold bg-brand-hover p-3 text-body text-brand-brown"
        >
          讀不到今天已填的內容。如果你稍早填過，建議重新整理再填，避免蓋掉原本的紀錄。
        </p>

        <!-- 完成度：鼓勵回來補完，不是強迫一次填滿 -->
        <div class="rounded-2xl border border-brand-border bg-white px-4 py-3">
          <div class="flex items-center justify-between text-caption text-brand-brown-light">
            <span>今日完成度</span>
            <span class="font-bold text-brand-brown">{{ progress.filled }} / {{ progress.total }}</span>
          </div>
          <div class="mt-2 flex gap-1">
            <div
              v-for="i in progress.total"
              :key="i"
              class="h-1.5 flex-1 rounded-full transition"
              :class="i <= progress.filled ? 'bg-brand-orange' : 'bg-brand-panel'"
            />
          </div>
        </div>

        <FormSection title="睡眠" hint="滿意度、時數，想補充的都可以寫">
          <PercentSlider v-model="form.sleepScore" :labels="['很差', '普通', '很好']" />
          <div class="mt-4 grid grid-cols-2 gap-3">
            <TimeField v-model="form.bedTime" label="幾點睡" />
            <TimeField v-model="form.wakeTime" label="幾點醒" />
          </div>
          <p v-if="sleepHours !== null" class="mt-2 text-body text-brand-brown-light">
            睡了 <span class="font-bold text-brand-brown">{{ sleepHours }}</span> 小時
          </p>
          <div class="mt-3">
            <NoteField v-model="form.sleepNote" label="記個夢" placeholder="做了什麼夢？想記下的都可以寫（選填）" />
          </div>
        </FormSection>

        <FormSection title="排便">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opt in [{ label: '有', value: true }, { label: '沒有', value: false }]"
              :key="String(opt.value)"
              type="button"
              class="h-12 rounded-xl border-2 text-body font-medium transition"
              :class="form.bowelMovement === opt.value
                ? 'border-brand-orange bg-brand-orange text-white'
                : 'border-brand-border bg-white text-brand-brown-light'"
              @click="form.bowelMovement = opt.value; if (!opt.value) form.bowelTime = null"
            >
              {{ opt.label }}
            </button>
          </div>

          <div v-if="form.bowelMovement === true" class="mt-3">
            <TimeField v-model="form.bowelTime" label="時間" />
          </div>

          <div class="mt-3">
            <NoteField v-model="form.bowelNote" placeholder="狀態如何？（選填）" />
          </div>
        </FormSection>

        <FormSection title="上班時間" :hint="workHours ? `在外 ${workHours}` : undefined">
          <div class="grid grid-cols-2 gap-3">
            <TimeField v-model="form.leaveHomeTime" label="出門" />
            <TimeField v-model="form.leaveOfficeTime" label="離開公司" />
          </div>
        </FormSection>

        <FormSection title="今天有過敏嗎">
          <ChipMultiSelect v-model="form.allergy" :options="ALLERGY_OPTIONS" exclusive="無" />
          <div class="mt-3">
            <NoteField v-model="form.allergyNote" placeholder="什麼情況下出現的？（選填）" />
          </div>
        </FormSection>

        <FormSection title="起床心情">
          <MoodPicker v-model="form.mood" :options="MOOD_OPTIONS" />
          <div class="mt-3">
            <NoteField v-model="form.moodNote" placeholder="今天發生了什麼？（選填）" />
          </div>
        </FormSection>

        <FormSection title="自我照顧" :badge="`${liverPercent}%`">
          <ChipMultiSelect v-model="form.liverCare" :options="LIVER_CARE_OPTIONS" />
        </FormSection>

        <label
          v-if="canShareToChat"
          class="flex items-center gap-3 rounded-2xl border border-brand-border bg-white p-4"
        >
          <input v-model="form.shared" type="checkbox" class="h-5 w-5 accent-brand-orange">
          <span class="flex-1 text-body">
            <span class="font-bold text-brand-brown">分享到這個群組</span>
            <span class="mt-0.5 block text-caption text-brand-brown-light">
              只顯示睡眠分數、心情與自我照顧達標率。排便、過敏與所有備註都不會出現在卡片上。
            </span>
          </span>
        </label>

        <NuxtLink to="/history" class="block py-2 text-center text-body font-medium text-brand-orange underline">
          查看我的紀錄
        </NuxtLink>

        <p v-if="submitError" class="rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-body text-red-700">
          {{ submitError }}
        </p>
      </form>
    </div>

    <div v-if="ready && !loading" class="fixed inset-x-0 bottom-0 border-t border-brand-border bg-brand-cream/95 p-4 backdrop-blur">
      <p v-if="savedAt" class="mb-2 text-center text-caption text-brand-green">
        已於 {{ savedAt }} 儲存，可以繼續補其他欄位
      </p>
      <button
        type="button"
        :disabled="pending"
        class="mx-auto flex h-14 w-full max-w-lg items-center justify-center rounded-2xl bg-brand-orange text-body-lg font-bold text-white transition active:scale-[0.99] active:bg-brand-orange-dark disabled:opacity-50"
        @click="submit"
      >
        {{ pending ? '儲存中…' : form.shared && canShareToChat ? '儲存並分享到群組' : isUpdate ? '更新紀錄' : '儲存' }}
      </button>
    </div>
  </div>
</template>
