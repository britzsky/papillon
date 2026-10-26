import type { AccountMealSlot, TableMealsDetailItem, TableMealsItem, TableMealsQueryPeriod } from '../../api/operations'

/**
 * 식단표 조회 공용 로직(PC·모바일 화면 공용). 주차 계산·상세 요일/식사 묶기 등 화면과 무관한 순수 함수만 둔다.
 */

export type MealSlotKey = string

export type MonthWeekOption = {
  value: string
  label: string
  dates: Date[]
}

export type TableMealsDetailDay = {
  key: string
  date: string
  weekday: string
  meals: Record<MealSlotKey, TableMealsDetailItem[]>
}

export const DETAIL_MEAL_SLOT_ORDER: Array<{ id: string; key: MealSlotKey; label: string }> = [
  { id: 'breakfast', key: 'breakfast', label: '아침' },
  { id: 'lunch', key: 'lunch', label: '점심' },
  { id: 'snack-afternoon', key: 'snack', label: '간식' },
  { id: 'dc-snack', key: 'dcSnack', label: 'DC' },
  { id: 'dinner', key: 'dinner', label: '저녁' },
  { id: 'snack-evening', key: 'snack', label: '간식' },
]

/** kind: 본식/간식(본사 끼니 종류, 거래처 설정에서 받음) */
export type MealSlotRow = { id: string; key: MealSlotKey; label: string; code: number; kind?: string }

export const ACCOUNT_MEAL_SLOT_ROWS: MealSlotRow[] = [
  { id: 'breakfast', key: '0', label: '조식', code: 0 },
  { id: 'morning-snack', key: '1', label: '오전간식', code: 1 },
  { id: 'lunch', key: '2', label: '중식', code: 2 },
  { id: 'afternoon-snack', key: '3', label: '오후간식', code: 3 },
  { id: 'dc', key: '4', label: 'DC', code: 4 },
  { id: 'dinner', key: '5', label: '석식', code: 5 },
  { id: 'evening-snack', key: '6', label: '저녁간식', code: 6 },
  { id: 'other-snack', key: '7', label: '기타간식', code: 7 },
  { id: 'kinder-snack', key: '8', label: '킨더간식', code: 8 },
]

export function toMealSlotRows(items: AccountMealSlot[]) {
  const selectedItems = items
    .filter((item) => item.selected_yn === 'Y')
    .sort((a, b) => a.display_order - b.display_order)

  return selectedItems
    .map((item) => {
      // 본사가 추가한 끼니(코드 9 이상)는 기본 행이 없어 코드로 만든다(key = 코드 문자열, 기본 끼니와 같은 규칙)
      const slot = ACCOUNT_MEAL_SLOT_ROWS.find((row) => row.code === item.meal_slot_code)
        ?? { id: `slot-${item.meal_slot_code}`, key: String(item.meal_slot_code), label: `식사 ${item.meal_slot_code}`, code: item.meal_slot_code }
      return { ...slot, label: item.meal_slot_name || slot.label, kind: item.slot_kind }
    })
}

export function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatMonthValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function parseMonthValue(value: string) {
  const [yearText, monthText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)

  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
  }
}

/**
 * 그 달의 주차(2026-10-26 사용자 결정): 주차는 항상 월~일 7일, 그 주 월요일이 속한 달의 주차.
 * 예) 2026-11-01(일)은 10/26(월)~11/1(일) 주 → 10월 5주차, 11월 1주차 = 11/2(월)~11/8(일).
 * N주차 = 그 달 N번째 월요일부터 7일(월요일이 d일이면 (d-1)/7+1주차). 저장 값(table_year·table_month·table_week)도 이 규칙.
 */
export function getCurrentMonthWeekOptions(baseDate = new Date()): MonthWeekOption[] {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const weeks: MonthWeekOption[] = []
  const firstMonday = 1 + ((8 - new Date(year, month, 1).getDay()) % 7)

  for (let monday = firstMonday; monday <= lastDate; monday += 7) {
    weeks.push({
      value: String(weeks.length),
      label: `${month + 1}월 ${weeks.length + 1}주차`,
      dates: Array.from({ length: 7 }, (_, offset) => new Date(year, month, monday + offset)),
    })
  }

  return weeks
}

/** 날짜(YYYY-MM-DD)가 속한 주차: 그 주 월요일의 달('YYYY-MM')과 주차 값(0부터) */
export function weekOfDate(value: string): { month: string; week: string } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))
  return { month: formatMonthValue(monday), week: String(Math.floor((monday.getDate() - 1) / 7)) }
}

/** 주차 기간 글자: '10/26(월)~11/1(일)' */
export function weekRangeLabel(week: Pick<MonthWeekOption, 'dates'>) {
  const first = week.dates[0], last = week.dates[week.dates.length - 1]
  if (!first || !last) return ''
  const short = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`
  return `${short(first)}(월)~${short(last)}(일)`
}

export function getTableMealsQueryPeriod(item: TableMealsItem, fallbackMonth: string): TableMealsQueryPeriod {
  const nameParts = item.table_name.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})주차/)
  const fallback = parseMonthValue(fallbackMonth)
  const year = Number.isFinite(item.table_year) ? Number(item.table_year) : Number(nameParts?.[1] ?? fallback.year)
  const month = Number.isFinite(item.table_month) ? Number(item.table_month) : Number(nameParts?.[2] ?? fallback.month)
  const week = Number.isFinite(item.table_week) ? Number(item.table_week) : Number(nameParts?.[3] ?? 1)
  const weeks = getCurrentMonthWeekOptions(new Date(year, month - 1, 1))
  const selectedWeek = weeks[Math.max(0, Math.min(weeks.length - 1, week - 1))]
  const startDate = selectedWeek?.dates[0] ?? new Date(year, month - 1, 1)
  const endDate = selectedWeek?.dates[selectedWeek.dates.length - 1] ?? startDate

  return {
    table_year: year,
    table_month: month,
    table_week: week,
    start_date: formatDateValue(startDate),
    end_date: formatDateValue(endDate),
  }
}

export function toDetailMealSlotKey(value: string): MealSlotKey {
  const normalized = value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

  if (/^[0-8]$/.test(normalized)) return normalized

  if (normalized === 'breakfast' || normalized === '1' || normalized.includes('아침') || normalized.includes('조식')) {
    return 'breakfast'
  }

  if (normalized === 'lunch' || normalized === '2' || normalized.includes('점심') || normalized.includes('중식')) {
    return 'lunch'
  }

  if (normalized === 'dinner' || normalized === '3' || normalized.includes('저녁') || normalized.includes('석식')) {
    return 'dinner'
  }

  if (normalized.includes('dc')) {
    return 'dcSnack'
  }

  if (normalized === 'snack' || normalized === '4' || normalized.includes('간식')) {
    return 'snack'
  }

  return 'lunch'
}

export function buildTableMealsDetailDays(items: TableMealsDetailItem[]): TableMealsDetailDay[] {
  const dayMap = new Map<string, TableMealsDetailDay>()

  const uniqueItems = Array.from(
    new Map(
      items.map((item) => [
        `${item.meal_date}-${item.meal_slot}-${item.menu_id || item.menu_name}`,
        item,
      ]),
    ).values(),
  )

  uniqueItems.forEach((item) => {
    const key = `${item.meal_date || 'unknown'}-${item.weekday || ''}`
    const day = dayMap.get(key) ?? {
      key,
      date: item.meal_date,
      weekday: item.weekday,
      meals: Object.fromEntries([
        ...ACCOUNT_MEAL_SLOT_ROWS.map((slot) => [slot.key, [] as TableMealsDetailItem[]]),
        ['breakfast', [] as TableMealsDetailItem[]],
        ['lunch', [] as TableMealsDetailItem[]],
        ['dinner', [] as TableMealsDetailItem[]],
        ['snack', [] as TableMealsDetailItem[]],
        ['dcSnack', [] as TableMealsDetailItem[]],
      ]),
    }

    day.meals[toDetailMealSlotKey(item.meal_slot)].push(item)
    dayMap.set(key, day)
  })

  return Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      meals: Object.fromEntries(
        Object.entries(day.meals).map(([key, items]) => [key, [...items].sort((a, b) => a.sort_order - b.sort_order)]),
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
