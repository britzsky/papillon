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

export type MealSlotRow = { id: string; key: MealSlotKey; label: string; code: number }

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
      const slot = ACCOUNT_MEAL_SLOT_ROWS.find((row) => row.code === item.meal_slot_code)
      return slot ? { ...slot, label: item.meal_slot_name || slot.label } : null
    })
    .filter((slot): slot is MealSlotRow => slot !== null)
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

export function getCurrentMonthWeekOptions(baseDate = new Date()): MonthWeekOption[] {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const weeks: MonthWeekOption[] = []
  let currentWeek: Date[] = []

  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month, day)
    const mondayBasedDay = (date.getDay() + 6) % 7

    if (currentWeek.length > 0 && mondayBasedDay === 0) {
      weeks.push({
        value: String(weeks.length),
        label: `${month + 1}월 ${weeks.length + 1}주차`,
        dates: currentWeek,
      })
      currentWeek = []
    }

    currentWeek.push(date)
  }

  if (currentWeek.length > 0) {
    weeks.push({
      value: String(weeks.length),
      label: `${month + 1}월 ${weeks.length + 1}주차`,
      dates: currentWeek,
    })
  }

  return weeks
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
