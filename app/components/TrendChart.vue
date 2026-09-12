<script setup lang="ts">
/**
 * 折線趨勢圖。
 *
 * Y 軸固定 0–100 而不是依資料自動縮放：兩個指標都是百分比，固定刻度才能
 * 互相比較，也不會因為某幾天差異很小就把波動放大成看起來很劇烈。
 */
const props = defineProps<{
  points: { date: string; value: number | null }[]
  label?: string
}>()

const id = useId()

/** 把每個點換算成 0–100 的座標；沒填的日子留 null，線要在那裡斷開 */
const plotted = computed(() =>
  props.points.map((p, i) => ({
    date: p.date,
    value: p.value,
    x: props.points.length === 1 ? 50 : (i / (props.points.length - 1)) * 100,
    y: p.value === null ? null : 100 - p.value,
  })),
)

/** 連續有值的區段。中間有沒填的日子就分段，不要用直線硬連過去 */
const segments = computed(() => {
  const out: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  for (const p of plotted.value) {
    if (p.y === null) {
      if (current.length) out.push(current)
      current = []
    } else {
      current.push({ x: p.x, y: p.y })
    }
  }
  if (current.length) out.push(current)
  return out
})

const linePath = computed(() =>
  segments.value
    .map((seg) =>
      seg.length === 1
        // 單一個點畫不出線，給它一小段水平線才看得見
        ? `M ${Math.max(0, seg[0]!.x - 6)} ${seg[0]!.y} L ${Math.min(100, seg[0]!.x + 6)} ${seg[0]!.y}`
        : seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
    )
    .join(' '),
)

/** 面積填色：沿著線走一圈再回到底部 */
const areaPath = computed(() =>
  segments.value
    .filter((seg) => seg.length > 1)
    .map((seg) => {
      const line = seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      return `${line} L ${seg[seg.length - 1]!.x} 100 L ${seg[0]!.x} 100 Z`
    })
    .join(' '),
)

const dots = computed(() => plotted.value.filter((p) => p.y !== null) as { date: string; value: number; x: number; y: number }[])

/** 日期標籤：天數少時全部顯示，多了就只留頭、中、尾，否則會擠成一團 */
const labels = computed(() => {
  const n = props.points.length
  if (n === 0) return []
  if (n <= 7) return plotted.value.map((p) => ({ x: p.x, text: short(p.date) }))
  const mid = Math.floor((n - 1) / 2)
  return [0, mid, n - 1].map((i) => ({ x: plotted.value[i]!.x, text: short(plotted.value[i]!.date) }))
})

function short(date: string) {
  return date.slice(5).replace('-', '/')
}
</script>

<template>
  <div>
    <div class="relative h-32">
      <!-- 50% 的參考線，讓人一眼看出高於還是低於一半 -->
      <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-brand-border" />

      <svg class="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="`grad-${id}`" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#F9A726" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#F9A726" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path v-if="areaPath" :d="areaPath" :fill="`url(#grad-${id})`" />
        <path
          v-if="linePath"
          :d="linePath"
          fill="none"
          stroke="#F9A726"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- 圓點用 HTML 畫：SVG 在 preserveAspectRatio="none" 下會把圓壓成橢圓 -->
      <div
        v-for="d in dots"
        :key="d.date"
        class="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-orange ring-2 ring-white"
        :style="{ left: `${d.x}%`, top: `${d.y}%` }"
        :title="`${d.date}：${d.value}%`"
      />
    </div>

    <div class="relative mt-2 h-4">
      <span
        v-for="l in labels"
        :key="l.text"
        class="absolute -translate-x-1/2 whitespace-nowrap text-caption text-brand-brown-light/70"
        :style="{ left: `${Math.min(94, Math.max(6, l.x))}%` }"
      >{{ l.text }}</span>
    </div>
  </div>
</template>
