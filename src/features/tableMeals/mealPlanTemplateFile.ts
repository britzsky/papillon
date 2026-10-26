import writeExcelFile, { type Row } from 'write-excel-file/universal'
import { isMainSlot } from '../../api/mealSlots'
import { formatDateValue, weekRangeLabel, type MealSlotRow, type MonthWeekOption } from './tableMealsView'

/**
 * 식단표 표준 양식(2026-10-26 사용자 결정). '빈 양식'은 public/templates 파일 그대로, '설정 양식'은 여기서 만든다:
 * 거래처 이름 · 선택 주차의 월~일 날짜와 요일 · 거래처 식사 구성(본식 6줄, 간식 2줄). 빈 양식과 같은 모양이라 '식단표 불러오기'가 그대로 읽는다.
 */
const WEEKDAY_NAMES = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
const MAIN_ROWS = 6
const SNACK_ROWS = 2
const NOTES = [
  '* 3행 요일, 4행 날짜는 그대로 두세요. 날짜로 식단표 주차를 맞춥니다(주차 = 월~일, 월요일이 속한 달).',
  '* A열 식사 이름은 이 거래처 식사 구성입니다. 메뉴 줄은 늘리거나 줄여도 됩니다.',
  '* 칸 하나에 메뉴 하나씩 적어 주세요. 잡곡밥/흰죽처럼 / 로 이어 적으면 두 메뉴로 나눠 읽습니다.',
  '* 원산지·열량·안내 문구는 표 아래에 적어 주세요(표 안에 있으면 메뉴로 읽힐 수 있습니다).',
]

type Options = { accountName: string; week: MonthWeekOption; slots: MealSlotRow[]; mealPlanTypeName?: string }

const head = { fontWeight: 'bold' as const, align: 'center' as const, alignVertical: 'center' as const, backgroundColor: '#EEF3EF', borderStyle: 'thin' as const }
const cell = { borderStyle: 'thin' as const, wrap: true, alignVertical: 'center' as const, align: 'center' as const }

export function configuredTemplateFileName({ accountName, week }: Pick<Options, 'accountName' | 'week'>) {
  const first = week.dates[0]
  const safe = accountName.replace(/[\\/:*?"<>|]/g, '').trim() || '거래처'
  return `${first ? `${first.getFullYear()}년` : ''}${week.label.replace(/\s+/g, '')}_${safe}_식단표.xlsx`
}

export function buildConfiguredTemplateRows({ accountName, week, slots, mealPlanTypeName }: Options): Row[] {
  const dates = week.dates.slice(0, 7)
  const rows: Row[] = []
  rows.push([{ value: '주 간 식 단 표', columnSpan: 8, fontWeight: 'bold', fontSize: 16, align: 'center', height: 30 }, null, null, null, null, null, null, null])
  rows.push([{ value: '거래처:', fontWeight: 'bold' }, { value: accountName, columnSpan: 3, fontWeight: 'bold' }, null, null,
    { value: '기간:', fontWeight: 'bold', align: 'right' }, { value: `${week.label} ${weekRangeLabel(week)}`, columnSpan: 2 }, null,
    { value: mealPlanTypeName ?? '', align: 'right' }])
  rows.push([{ value: '구분', ...head }, ...WEEKDAY_NAMES.map(name => ({ value: name, ...head }))])
  // 날짜는 글자(YYYY-MM-DD)로 넣는다 — 엑셀 날짜 서식·시간대 차이 없이 불러오기가 그대로 읽는다
  rows.push([{ value: '날짜', ...head }, ...WEEKDAY_NAMES.map((_, index) => ({ value: dates[index] ? formatDateValue(dates[index]) : '', ...head, type: String }))])
  for (const slot of slots) {
    const count = isMainSlot(slot.code, slot.kind) ? MAIN_ROWS : SNACK_ROWS
    for (let line = 0; line < count; line += 1) {
      rows.push([
        line === 0 ? { value: slot.label, rowSpan: count, ...head, backgroundColor: isMainSlot(slot.code, slot.kind) ? '#E3F1E8' : '#FFF4E8' } : null,
        ...WEEKDAY_NAMES.map(() => ({ value: '', ...cell, height: 20 })),
      ])
    }
  }
  rows.push([])
  for (const note of NOTES) rows.push([{ value: note, columnSpan: 8, align: 'left' }, null, null, null, null, null, null, null])
  return rows
}

export async function downloadConfiguredTemplate(options: Options) {
  const blob = await writeExcelFile(buildConfiguredTemplateRows(options), {
    sheet: '주간식단표',
    columns: [{ width: 11 }, ...WEEKDAY_NAMES.map(() => ({ width: 17 }))],
  }).toBlob()
  downloadBlob(blob, configuredTemplateFileName(options))
}

export function downloadBlankTemplate() {
  const link = document.createElement('a')
  link.href = `${import.meta.env.BASE_URL}templates/weekly-meal-plan-template.xlsx`
  link.download = '주간식단표_표준양식.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
