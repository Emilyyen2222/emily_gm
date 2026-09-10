<script setup lang="ts">
import {
  ALLERGY_OPTIONS,
  LIVER_CARE_OPTIONS,
  LIVER_CARE_TOTAL,
  MOOD_OPTIONS,
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
const isUpdate = ref(false)

const liverPercent = computed(() => Math.round((form.value.liverCare.length / LIVER_CARE_TOTAL) * 100))

onMounted(async () => {
  await init()
  if (!ready.value) {
    loading.value = false
    return
  }

  form.value.shared = canShareToChat.value
  form.value.sourceChatId = chatId.value

  // 今天填過就把內容帶回來，讓使用者是「修改」而不是重填一次
  try {
    const idToken = await getIdToken()
    const data = await $fetch<RecordsResponse>('/api/records/me', {
      query: { days: 1 },
      headers: { 'x-liff-id-token': idToken },
    })
    const todayRecord = data.records.find((r) => r.recordDate === data.today)
    if (todayRecord) {
      isUpdate.value = true
      Object.assign(form.value, {
        sleepScore: todayRecord.sleepScore,
        sleepHours: todayRecord.sleepHours,
        bowelMovement: todayRecord.bowelMovement,
        bowelTime: todayRecord.bowelTime,
        allergy: [...todayRecord.allergy],
        mood: todayRecord.mood,
        liverCare: [...todayRecord.liverCare],
      })
    }
  } catch {
    // 讀不到舊資料不該擋住填寫，維持空表單即可
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
      // 同源請求，沒有 CORS 問題，正常送 JSON
      body: { ...form.value, idToken },
    })

    if (form.value.shared && canShareToChat.value) {
      await sendToChat(buildDailyFlexMessage({ ...record, displayName: record.displayName ?? displayName.value }))
    }

    close()
  } catch (err: any) {
    submitError.value = err?.data?.statusMessage ?? err?.message ?? '送出失敗，請稍後再試'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 pb-28">
    <div class="mx-auto max-w-lg px-4 pt-6">
      <header class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">今日狀態</h1>
        <p class="mt-1 text-sm text-gray-500">
          <span v-if="displayName">{{ displayName }}，</span>
          <span v-if="isUpdate">今天已經填過了，可以直接修改</span>
          <span v-else>花 10 秒記錄一下吧</span>
        </p>
      </header>

      <div v-if="initError" class="rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {{ initError }}
      </div>

      <div v-else-if="loading" class="space-y-4">
        <div v-for="i in 4" :key="i" class="h-28 animate-pulse rounded-2xl bg-gray-200" />
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <section class="rounded-2xl bg-white p-4 shadow-sm">
          <h2 class="mb-3 font-semibold text-gray-900">睡眠滿意度</h2>
          <ScoreSelector v-model="form.sleepScore" name="sleep" />

          <h2 class="mb-2 mt-5 font-semibold text-gray-900">睡了幾小時</h2>
          <input
            v-model.number="form.sleepHours"
            type="number"
            inputmode="decimal"
            step="0.5"
            min="0"
            max="24"
            placeholder="7.5"
            class="h-12 w-full rounded-xl border-2 border-gray-200 px-4 text-base focus:border-brand-500 focus:outline-none"
          >
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm">
          <h2 class="mb-3 font-semibold text-gray-900">今日排便</h2>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="opt in [{ label: '有', value: true }, { label: '沒有', value: false }]"
              :key="String(opt.value)"
              type="button"
              class="h-12 rounded-xl border-2 font-medium transition"
              :class="form.bowelMovement === opt.value
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-gray-200 bg-white text-gray-600'"
              @click="form.bowelMovement = opt.value; if (!opt.value) form.bowelTime = null"
            >
              {{ opt.label }}
            </button>
          </div>

          <div v-if="form.bowelMovement === true" class="mt-3">
            <label class="mb-2 block text-sm text-gray-500">時間</label>
            <input
              v-model="form.bowelTime"
              type="time"
              class="h-12 w-full rounded-xl border-2 border-gray-200 px-4 text-base focus:border-brand-500 focus:outline-none"
            >
          </div>
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm">
          <h2 class="mb-3 font-semibold text-gray-900">早上過敏症狀</h2>
          <ChipMultiSelect v-model="form.allergy" :options="ALLERGY_OPTIONS" exclusive="無" />
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm">
          <h2 class="mb-3 font-semibold text-gray-900">起床心情</h2>
          <MoodPicker v-model="form.mood" :options="MOOD_OPTIONS" />
        </section>

        <section class="rounded-2xl bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-baseline justify-between">
            <h2 class="font-semibold text-gray-900">肝臟養生</h2>
            <span class="text-sm font-medium text-brand-600">{{ liverPercent }}%</span>
          </div>
          <ChipMultiSelect v-model="form.liverCare" :options="LIVER_CARE_OPTIONS" />
        </section>

        <label
          v-if="canShareToChat"
          class="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
        >
          <input v-model="form.shared" type="checkbox" class="h-5 w-5 accent-brand-500">
          <span class="flex-1 text-sm">
            <span class="font-medium text-gray-900">分享到這個群組</span>
            <span class="mt-0.5 block text-xs text-gray-500">只會顯示睡眠分數、心情與護肝達標率，不含排便時間與過敏細節</span>
          </span>
        </label>

        <NuxtLink to="/history" class="block py-2 text-center text-sm text-brand-600 underline">
          查看我的紀錄
        </NuxtLink>

        <p v-if="submitError" class="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {{ submitError }}
        </p>
      </form>
    </div>

    <div v-if="ready && !loading" class="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-4 backdrop-blur">
      <button
        type="button"
        :disabled="pending"
        class="mx-auto flex h-14 w-full max-w-lg items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
        @click="submit"
      >
        {{ pending ? '送出中…' : isUpdate ? '更新今日紀錄' : '送出' }}
      </button>
    </div>
  </div>
</template>
