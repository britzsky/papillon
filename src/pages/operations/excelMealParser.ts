// 식단표 엑셀(.xlsx)의 칸으로 요일·식사별 메뉴를 읽는다. read-excel-file 결과(시트 이름·2차원 칸 값)만 받는 순수 함수라 화면 없이 시험할 수 있다.
// 거래처마다 양식이 조금씩 다르지만 대부분 '요일(·날짜)이 가로 머리줄, 식사 이름이 왼쪽 열, 그 아래로 메뉴' 모양이다.
// - 머리줄: 요일 칸이 3개 이상인 첫 줄. 날짜는 그 위아래 두 줄 안의 같은 열
// - 왼쪽 열(첫 요일 열보다 왼쪽): 식사 이름(조식·아침·중식…)이면 새 식사, 열량·원산지 같은 줄은 건너뛰고, 그 밖의 글자는 코스(일반식·다이어트식·A코스)
// - 메뉴 칸: 줄바꿈·'/'로 나누고 원산지·안내(*양식DAY* 등)는 뺀다(PDF와 같은 규칙)

import {
  compact,
  isDateText,
  isNoticeText,
  isOriginText,
  normalizeDate,
  resolveSnacks,
  slotCodeOf,
  splitMenuText,
  SLOT_LABELS,
  weekdayOfMonthDay,
  WEEKDAYS,
  type MealSlotTarget,
  type ParsedMealDay,
  type ParsedMealTable,
} from './pdfMealParser'

export type SheetCell = string | number | boolean | Date | null | undefined
export type SheetGrid = { name: string; rows: SheetCell[][] }

/** 메뉴가 아니라 영양·안내 정보인 줄(왼쪽 열 글자) */
const INFO_ROW = /^(열량|칼로리|kcal|에너지|단백질|탄수화물|지방|나트륨|원산지|비고|합계|총계|식수|인원|단가|가격|알레르기)/i

/** 행사·꾸밈 글자('♥그랜드 open♥', '★한식 Day★') — 메뉴가 아니다 */
const DECORATION = /[♥♡★☆]|\bday\b|\bopen\b/i

/** '정성이 가득한 점심'·'건강을 생각하는 저녁'처럼 꾸며 쓴 식사 이름 */
function looseSlotCode(text: string, slots: MealSlotTarget[]) {
  const code = slotCodeOf(text, slots)
  if (code !== null) return code
  const value = compact(text)
  if (value.length > 15) return null
  if (/(아침|조식)/.test(value)) return 0
  if (/(점심|중식)/.test(value)) return 2
  if (/(저녁|석식)/.test(value)) return 5
  return null
}

const pad = (value: number) => String(value).padStart(2, '0')

/** 칸 값을 글자로. 날짜는 엑셀이 시간대 없이 저장하므로 UTC 기준 날짜로 읽는다 */
export function cellText(value: SheetCell): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  return String(value).trim()
}

/** 엑셀 날짜 일련번호(1900 기준, 서식 없이 숫자로 남은 날짜) → YYYY-MM-DD. 2000~2100년 범위만 */
function serialDate(value: SheetCell) {
  if (typeof value !== 'number' || value < 36526 || value > 73051) return ''
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 'YYYY-MM-DD'·'MM-DD'(연도는 오늘과 가까운 해)의 요일 */
const weekdayOfDate = (date: string) => weekdayOfMonthDay(date)

/**
 * 머리줄 칸 하나: '월요일', '월', '1/6(월)', '2024-12-02⏎월요일', 날짜만(요일은 날짜로 계산)
 * allowSerial: 날짜 줄에서는 숫자 일련번호도 날짜로 본다
 */
function headerCell(value: SheetCell, allowSerial = false): { weekday: string; date: string } {
  if (value instanceof Date) { const date = cellText(value); return { weekday: weekdayOfDate(date), date } }
  if (allowSerial) { const date = serialDate(value); if (date) return { weekday: weekdayOfDate(date), date } }
  let weekday = '', date = ''
  for (const line of cellText(value).split(/\r?\n/)) {
    const value = compact(line)
    if (!value) continue
    // '월요일', '월', '1/6(월)', '월(1/6)', '수요일(설날)' — 괄호 안이 날짜일 때만 날짜로 쓴다
    const both = value.match(/^(?:(\d{1,2})[./](\d{1,2}))?\(?([월화수목금토일])(?:요일)?\)?(?:[(（]([^)）]{0,12})[)）])?$/)
    if (both) {
      weekday ||= both[3]
      const inside = both[4]?.match(/^(\d{1,2})[./](\d{1,2})$/)
      const month = both[1] ?? inside?.[1], day = both[2] ?? inside?.[2]
      if (month && day && !date) date = `${pad(Number(month))}-${pad(Number(day))}`
    } else if (isDateText(value) && !date) date = normalizeDate(value)
    else return { weekday: '', date: '' } // 메뉴 등 다른 글자가 섞인 칸은 머리줄 칸이 아니다
  }
  return { weekday: weekday || weekdayOfDate(date), date }
}

const isHeaderCell = (value: SheetCell) => { const cell = headerCell(value); return Boolean(cell.weekday || cell.date) }

type Section = { code: number; order: number }

/**
 * 시트 하나를 읽는다. 요일 머리줄을 못 찾거나 메뉴가 하나도 없으면 null(식단표가 아닌 시트).
 * excludedCourses에 든 코스('중식 다이어트식' 형식)의 메뉴는 뺀다.
 */
export function parseMealSheet(grid: SheetGrid, slots: MealSlotTarget[], excludedCourses: string[] = []): ParsedMealTable | null {
  const rows = grid.rows.map(row => row.map(cellText))
  const at = (r: number, c: number) => rows[r]?.[c] ?? ''

  // 머리줄: 요일(또는 연도까지 있는 날짜) 칸이 3개 이상인 첫 줄
  const headerRow = grid.rows.findIndex(row => row.filter(isHeaderCell).length >= 3)
  if (headerRow < 0) return null
  const dayCols = grid.rows[headerRow].map((value, col) => (isHeaderCell(value) ? col : -1)).filter(col => col >= 0)
  // 같은 요일·날짜가 되풀이되면 주간 식단표가 아니다(운영일지·조리계획표 등)
  const dayKeys = dayCols.map(col => { const cell = headerCell(grid.rows[headerRow][col]); return cell.date || cell.weekday })
  if (new Set(dayKeys).size !== dayKeys.length) return null
  const firstDayCol = Math.min(...dayCols)

  // 날짜: 머리줄 칸에 없으면 위아래 두 줄 안의 같은 열(엑셀 일련번호 숫자도 날짜로 본다)
  let lastHeaderRow = headerRow
  const days: ParsedMealDay[] = dayCols.map((col, index) => {
    const header = headerCell(grid.rows[headerRow][col])
    let date = header.date
    for (const r of [headerRow + 1, headerRow - 1, headerRow + 2, headerRow - 2]) {
      if (date && /^\d{4}-/.test(date)) break
      const found = headerCell(grid.rows[r]?.[col], true).date
      if (found) {
        date = found
        if (r > lastHeaderRow) lastHeaderRow = r
      }
    }
    const label = header.weekday || weekdayOfDate(date)
    return { id: `xlsx-${grid.name}-${index}-${label}`, label, date, meals: {} }
  })

  // 왼쪽 열을 위에서부터 읽어 줄마다 식사(구간 순서)·코스를 정한다
  const sections: Section[] = []
  const rowSection: Array<{ section: number; course: string } | null | undefined> = []
  let section = -1, group = '', course = ''
  let ended = false
  for (let r = lastHeaderRow + 1; r < rows.length && !ended; r++) {
    let skip = false
    for (let c = 0; c < firstDayCol; c++) {
      const text = at(r, c)
      if (!/\p{L}/u.test(text)) continue // 빈 칸·기호만 있는 칸
      // '<원산지>' 줄부터는 원산지 표라 읽지 않는다
      if (/원산지/.test(compact(text))) { ended = true; skip = true; break }
      const code = looseSlotCode(text, slots)
      if (code !== null) {
        sections.push({ code, order: sections.length }); section = sections.length - 1; group = ''; course = ''
        // 식사 이름이 구간 가운데에 적혀 첫 식사 이름보다 위에 메뉴 줄이 있으면 그 줄도 이 식사로
        if (sections.length === 1) rowSection.forEach((entry, index) => { if (entry === undefined) rowSection[index] = { section: 0, course: '' } })
        continue
      }
      if (INFO_ROW.test(compact(text)) || isNoticeText(text)) { skip = true; break }
      // 첫 열의 모르는 이름(간편식 등)은 묶음, 그 오른쪽 열은 코스
      if (c === 0) { group = compact(text); course = '' } else course = compact(text)
    }
    if (ended) break
    // 맨 아래 '* 이 식단은 …' 같은 안내가 메뉴 열까지 이어진 줄도 건너뛴다
    if (!skip && dayCols.some(col => isNoticeText(at(r, col)) && compact(at(r, col)).length > 30)) skip = true
    // 첫 식사 이름 전의 메뉴 줄은 잠시 비워 두고(undefined) 첫 식사가 나오면 그 식사로 넣는다
    const pending = !skip && section < 0 && dayCols.some(col => splitMenuText(at(r, col), slots).length > 0 && !DECORATION.test(at(r, col)))
    rowSection.push(skip ? null : section < 0 ? (pending ? undefined : null) : { section, course: [group, course].filter(Boolean).join(' ') })
  }
  if (!sections.length) return null

  const resolved = resolveSnacks(sections.map(item => ({ code: item.code, y: -item.order })), slots)
  const slotKey = (index: number) => String(resolved[index].code)
  const courseKey = (index: number, name: string) => `${SLOT_LABELS[resolved[index].code] ?? slotKey(index)} ${name}`
  const courses: string[] = []
  const excluded = new Set(excludedCourses)
  let cellCount = 0

  rowSection.forEach((entry, offset) => {
    if (!entry) return
    const r = lastHeaderRow + 1 + offset
    const key = slotKey(entry.section)
    const courseName = entry.course ? courseKey(entry.section, entry.course) : ''
    // 메뉴가 있는 줄의 코스만 목록에 넣는다(빈 줄의 남은 글자로 코스가 생기지 않게)
    if (courseName && !courses.includes(courseName) && dayCols.some(col => at(r, col))) courses.push(courseName)
    if (courseName && excluded.has(courseName)) return
    dayCols.forEach((col, index) => {
      const text = at(r, col)
      if (!text) return
      cellCount += 1
      if (isOriginText(text) || DECORATION.test(text)) return
      const list = (days[index].meals[key] ??= [])
      text.split(/\r?\n/).forEach(line => splitMenuText(line, slots).forEach(menu => {
        if (!list.some(existing => compact(existing) === compact(menu))) list.push(menu)
      }))
    })
  })

  // 코스가 이렇게 많으면 왼쪽 열에 메뉴가 적힌 다른 표다
  if (courses.length > 12) return null
  const menuCount = days.reduce((sum, day) => sum + Object.values(day.meals).reduce((n, list) => n + list.length, 0), 0)
  if (menuCount === 0 && !courses.length) return null

  // 모든 요일에 같은 식사 칸을 만든다(빈 식사도 화면에 줄이 맞게)
  const keys = [...new Set(resolved.map(item => String(item.code)))]
  days.forEach(day => keys.forEach(key => { day.meals[key] ??= [] }))
  const configured = new Set(slots.map(slot => slot.code))
  const unconfigured = slots.length
    ? keys.filter(key => !configured.has(Number(key)) && days.some(day => day.meals[key].length)).map(key => SLOT_LABELS[Number(key)] ?? key)
    : []
  const originTexts = [...new Set(rows.flat().filter(text => isOriginText(text) && compact(text).length > 4))]
  days.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : WEEKDAYS.indexOf(a.label as never) - WEEKDAYS.indexOf(b.label as never)))
  return {
    source: 'excel',
    sheetName: grid.name,
    courses,
    pageCount: 1,
    textItemCount: cellCount,
    originTexts,
    days,
    unconfiguredSlots: unconfigured,
  }
}

/** 식단표로 읽히는 시트들(이름·날짜). 화면에서 시트를 고르게 하거나, 선택 주차와 날짜가 맞는 시트를 고른다 */
export function mealSheets(sheets: SheetGrid[], slots: MealSlotTarget[]) {
  return sheets.flatMap(grid => {
    const parsed = parseMealSheet(grid, slots)
    return parsed ? [{ name: grid.name, dates: parsed.days.map(day => day.date).filter(Boolean) }] : []
  })
}
