import { LIVER_CARE_TOTAL, type DailyRecord } from '../types/record'

/**
 * 每日分享卡片。
 *
 * 隱私原則：只放社交友善的摘要（睡眠分數、護肝達標率、心情），
 * 絕不放排便時間與過敏細節 —— 群組所有人都看得到這張卡片。
 */
export function buildDailyFlexMessage(record: DailyRecord) {
  const name = record.displayName ?? '某位夥伴'
  const liverPercent = Math.round((record.liverScore / LIVER_CARE_TOTAL) * 100)

  return {
    type: 'flex' as const,
    // altText 會出現在通知列與不支援 Flex 的裝置上，必填
    altText: `${name} 完成了今日狀態記錄：睡眠 ${record.sleepScore ?? '-'}/5，護肝達標 ${liverPercent}%`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '今日狀態',
            size: 'sm',
            color: '#16a34a',
            weight: 'bold',
          },
          {
            type: 'text',
            text: name,
            size: 'lg',
            weight: 'bold',
            wrap: true,
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              summaryRow('睡眠', `${record.sleepScore ?? '-'} / 5`),
              summaryRow('心情', record.mood ?? '-'),
              summaryRow('護肝達標', `${record.liverScore} / ${LIVER_CARE_TOTAL}（${liverPercent}%）`),
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              {
                type: 'text',
                text: barText(record.liverScore),
                size: 'md',
                color: liverPercent >= 75 ? '#16a34a' : liverPercent >= 50 ? '#ca8a04' : '#dc2626',
              },
            ],
          },
        ],
      },
    },
  }
}

function summaryRow(label: string, value: string) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#6b7280', flex: 3 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', flex: 4, align: 'end' },
    ],
  }
}

function barText(score: number) {
  return '●'.repeat(score) + '○'.repeat(Math.max(0, LIVER_CARE_TOTAL - score))
}
