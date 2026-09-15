<script setup lang="ts">
import {
  EXPENSE_AMOUNT_MAX,
  EXPENSE_ITEM_MAX,
  EXPENSE_MAX_ITEMS,
  formatAmount,
  type ExpenseItem,
} from '#shared/types/record'

const model = defineModel<ExpenseItem[]>({ default: () => [] })

const total = computed(() => model.value.reduce((sum, e) => sum + (e.amount || 0), 0))
const sharedCount = computed(() => model.value.filter((e) => e.shared && e.item.trim()).length)

const rows = ref<HTMLInputElement[]>([])

async function add() {
  if (model.value.length >= EXPENSE_MAX_ITEMS) return
  // 新的一筆一律 shared: false。分享要是主動的動作，不能靠預設值幫人決定
  model.value = [...model.value, { item: '', amount: 0, shared: false }]
  await nextTick()
  rows.value[model.value.length - 1]?.focus()
}

function remove(index: number) {
  model.value = model.value.filter((_, i) => i !== index)
}

function setItem(index: number, value: string) {
  model.value = model.value.map((e, i) => (i === index ? { ...e, item: value.slice(0, EXPENSE_ITEM_MAX) } : e))
}

/** 金額輸入：空字串與非數字都當 0，不要讓畫面上出現 NaN */
function setAmount(index: number, value: string) {
  const n = Math.min(EXPENSE_AMOUNT_MAX, Math.max(0, Math.round(Number(value))))
  model.value = model.value.map((e, i) => (i === index ? { ...e, amount: Number.isFinite(n) ? n : 0 } : e))
}

function toggleShare(index: number) {
  model.value = model.value.map((e, i) => (i === index ? { ...e, shared: !e.shared } : e))
}
</script>

<template>
  <div>
    <div v-if="model.length" class="space-y-2">
      <div v-for="(expense, index) in model" :key="index" class="flex items-center gap-2">
        <input
          :ref="(el) => { if (el) rows[index] = el as HTMLInputElement }"
          :value="expense.item"
          type="text"
          placeholder="品項"
          :maxlength="EXPENSE_ITEM_MAX"
          class="min-w-0 flex-1 rounded-xl border-2 border-brand-border bg-white px-3 py-2.5 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
          @input="setItem(index, ($event.target as HTMLInputElement).value)"
        />
        <input
          :value="expense.amount || ''"
          type="number"
          inputmode="numeric"
          min="0"
          :max="EXPENSE_AMOUNT_MAX"
          placeholder="金額"
          class="w-24 shrink-0 rounded-xl border-2 border-brand-border bg-white px-3 py-2.5 text-body text-brand-brown placeholder:text-brand-brown-light/60 focus:border-brand-orange focus:outline-none"
          @input="setAmount(index, ($event.target as HTMLInputElement).value)"
        />
        <!-- 每一筆自己的分享開關。
             原本只寫「分享／不分享」，使用者看不出那是目前狀態還是按下去的結果。
             改成打勾框：有勾＝會傳出去，沒勾＝不會，狀態一眼就看得到。
             按鈕上刻意不放稱呼——那是卡片標題用的，出現在每一列上只是雜訊。 -->
        <button
          type="button"
          class="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 px-2.5 text-caption font-medium transition"
          :class="expense.shared
            ? 'border-brand-orange bg-brand-orange text-white'
            : 'border-brand-border bg-white text-brand-brown-light'"
          :aria-pressed="expense.shared"
          @click="toggleShare(index)"
        >
          <span
            class="flex h-4 w-4 items-center justify-center rounded border-2 text-[10px] leading-none"
            :class="expense.shared ? 'border-white bg-white text-brand-orange' : 'border-brand-border'"
          >{{ expense.shared ? '✓' : '' }}</span>
          <span>分享</span>
        </button>
        <button
          type="button"
          class="h-11 w-8 shrink-0 text-body-lg text-brand-brown-light"
          aria-label="刪除這一筆"
          @click="remove(index)"
        >
          ×
        </button>
      </div>
    </div>

    <button
      v-if="model.length < EXPENSE_MAX_ITEMS"
      type="button"
      class="flex h-10 items-center gap-1.5 text-body font-medium text-brand-orange"
      :class="model.length ? 'mt-2' : ''"
      @click="add"
    >
      <span class="text-body-lg leading-none">＋</span>
      <span>{{ model.length ? '再記一筆' : '記一筆' }}</span>
    </button>

    <div v-if="model.length" class="mt-3 border-t border-brand-border pt-3">
      <div class="flex items-center justify-between text-body">
        <span class="text-brand-brown-light">今天小計</span>
        <span class="font-bold text-brand-brown">{{ formatAmount(total) }}</span>
      </div>
      <p class="mt-1 text-caption text-brand-brown-light">
        <span v-if="sharedCount">打勾的 {{ sharedCount }} 筆會出現在卡片上，小計不會</span>
        <span v-else>還沒有打勾的，目前只有你看得到</span>
      </p>
    </div>
  </div>
</template>
