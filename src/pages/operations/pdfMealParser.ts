// 식단표 PDF의 글자 위치로 요일·식사별 메뉴를 읽는다. pdf.js 추출 결과(글자·좌표)만 받는 순수 함수라 화면 없이 시험할 수 있다.
// 좌표는 PDF 기준(y가 클수록 위쪽).

export type PdfTextItem = { text: string; x: number; y: number; page: number; width?: number }
/** 거래처 식사 설정 한 줄. key는 식단 저장에 쓰는 식사 코드 문자열('0' 조식, '2' 중식 …) */
export type MealSlotTarget = { key: string; label: string; code: number }
export type ParsedMealDay = {
  id: string
  /** 월~일 한 글자 */
  label: string
  /** PDF에 적힌 날짜. 연도까지 있으면 YYYY-MM-DD, 월·일만 있으면 MM-DD, 없으면 '' */
  date: string
  meals: Record<string, string[]>
}
export type ParsedMealTable = {
  /** 엑셀이면 시트 정보·코스가 붙는다(PDF는 없음) */
  source?: 'pdf' | 'excel'
  sheetName?: string
  /** 엑셀 코스(일반식·다이어트식·간편식 A코스 …). '식사 코스' 형식 */
  courses?: string[]
  pageCount: number
  textItemCount: number
  originTexts: string[]
  days: ParsedMealDay[]
  /** PDF에는 있으나 거래처 식사 설정에 없는 식사(메뉴는 읽었지만 화면·저장에서 빠진다) */
  unconfiguredSlots: string[]
}

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 식사 이름 → 식사 코드. 거래처가 이름을 바꿔 쓴 경우는 설정 이름으로도 찾는다 */
const SLOT_NAMES: Array<[RegExp, number]> = [
  [/^(조식|아침|아침식사)$/, 0],
  [/^오전간식$/, 1],
  [/^(중식|점심|점심식사)$/, 2],
  [/^오후간식$/, 3],
  [/^(dc|dc간식)$/i, 4],
  [/^(석식|저녁|저녁식사)$/, 5],
  [/^(저녁간식|야식)$/, 6],
  [/^기타간식$/, 7],
  [/^킨더간식$/, 8],
]
const SNACK_CODES = [1, 3, 6, 7, 8]

export const compact = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').trim()

/** '월', '월요일', '월(10/19)'처럼 요일만 적힌 글자. '바지락수제비'처럼 요일 글자가 든 메뉴는 아니다 */
export function weekdayOf(text: string) {
  return compact(text).match(/^([월화수목금토일])(?:요일)?(?:[(（][^)）]*[)）])?$/)?.[1] ?? ''
}

export function isDateText(text: string) {
  const value = compact(text)
  return /^\d{1,2}[./-]\d{1,2}\.?$/.test(value) || /^\d{4}[./-]\d{1,2}[./-]\d{1,2}\.?$/.test(value) || /^\d{1,2}월\d{1,2}일$/.test(value)
}

export function normalizeDate(text: string) {
  const value = compact(text)
  const full = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
  if (full) return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`
  const short = value.match(/^(\d{1,2})(?:[./-]|월)(\d{1,2})/)
  return short ? `${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}` : ''
}

export function isOriginText(text: string) {
  // '호주산'·'닭국산,돼지국산'·'배추 중국산'처럼 '○○산' 낱말도 원산지 글자다
  return /(원산지|국내산|수입산|외국산|산지|알레르기|kcal|칼로리)/i.test(text) || /(^|[\s,(:·])[가-힣]{1,5}산(?=$|[\s,).·])/.test(text.trim())
}

/** 연도 없는 'MM-DD'의 요일. 오늘과 가장 가까운 해(작년·올해·내년)로 계산한다 */
export function weekdayOfMonthDay(date: string, today = new Date()) {
  const match = date.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/)
  if (!match) return ''
  const years = match[1] ? [Number(match[1])] : [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]
  const candidates = years.map(year => new Date(year, Number(match[2]) - 1, Number(match[3])))
    .filter(day => day.getMonth() === Number(match[2]) - 1)
    .sort((a, b) => Math.abs(a.getTime() - today.getTime()) - Math.abs(b.getTime() - today.getTime()))
  return candidates.length ? '일월화수목금토'[candidates[0].getDay()] : ''
}

/** 왼쪽 열의 식사 아닌 짧은 이름('죽'·'일반식'·'A코스') — 코스로 본다 */
export function isCourseLabel(text: string) {
  const value = compact(text)
  return value.length >= 1 && value.length <= 8 && /\p{L}/u.test(value) && !isDateText(value) && !weekdayOf(value)
    && !isOriginText(value) && !isNoticeText(text) && !/[:：<>]/.test(value)
}

/** 안내 문구·제목 등 메뉴가 아닌 글자: '*'·'※'로 시작하는 안내, 띄어쓰기가 많은 문장 */
export function isNoticeText(text: string) {
  const value = text.trim()
  return /^[*※#]/.test(value) || (value.match(/\s+/g)?.length ?? 0) >= 3 || compact(value).length > 30
}

export function slotCodeOf(text: string, slots: MealSlotTarget[]) {
  const value = compact(text)
  const custom = slots.find(slot => compact(slot.label) === value)
  if (custom) return custom.code
  for (const [pattern, code] of SLOT_NAMES) if (pattern.test(value)) return code
  return value === '간식' ? -1 : null // 그냥 '간식'은 위치와 거래처 설정으로 정한다
}

export function isMenuCandidateText(text: string, slots: MealSlotTarget[] = []) {
  const value = compact(text)
  if (value.length < 2 || /^\d+$/.test(value) || isDateText(value)) return false
  if (weekdayOf(value) || slotCodeOf(value, slots) !== null || isOriginText(value) || isNoticeText(text)) return false
  if (/[:：]/.test(value)) return false // '소고기:호주산' 같은 원산지 조각
  return !['구분', '메뉴', '식단', '식단표', '주간식단표'].includes(value)
}

/** '잡곡밥/흰죽'처럼 한 칸에 '/'·'|'로 이어 적은 메뉴를 나눈다 */
export function splitMenuText(text: string, slots: MealSlotTarget[] = []) {
  return text.split(/[/|]/).map(part => part.trim()).filter(part => isMenuCandidateText(part, slots))
}

const centerX = (item: PdfTextItem) => item.x + (item.width ?? 0) / 2

/** 식사 구간의 기준 글자. course가 있으면 그 식사 안의 코스('죽' 등) */
export type Anchor = { code: number; y: number; course?: string }
type RowGroup = { code: number; top: number; bottom: number; course?: string }

/** 같은 높이(±tolerance)의 글자를 한 행으로 묶어 위→아래 순서의 행 y 목록을 만든다 */
function rowYs(items: PdfTextItem[], tolerance = 3) {
  const ys = [...items.map(item => item.y)].sort((a, b) => b - a)
  const rows: number[] = []
  ys.forEach(y => { if (!rows.length || rows[rows.length - 1] - y > tolerance) rows.push(y) })
  return rows
}

/**
 * 행들을 식사 이름(위→아래) 순서대로 연속 구간으로 나눈다.
 * 식사 이름 글자가 구간 세로 가운데에 있는 표(병합 셀)와 첫 행에 있는 표를 모두 시험해 덜 어긋나는 쪽을 고른다.
 */
function partitionRows(rows: number[], anchors: Anchor[]): RowGroup[] {
  const n = rows.length, k = anchors.length
  if (k === 0 || n === 0) return []
  if (n < k) return anchors.map(anchor => ({ code: anchor.code, top: anchor.y, bottom: anchor.y, course: anchor.course }))
  const solve = (cost: (start: number, end: number, anchor: Anchor) => number) => {
    // best[j][i]: 앞의 i개 행을 앞의 j개 식사로 나눌 때 최소 비용
    const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity))
    const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0))
    best[0][0] = 0
    for (let j = 1; j <= k; j++)
      for (let i = j; i <= n - (k - j); i++)
        for (let s = j - 1; s < i; s++) {
          const value = best[j - 1][s] + cost(s, i - 1, anchors[j - 1])
          if (value < best[j][i]) { best[j][i] = value; cut[j][i] = s }
        }
    const groups: RowGroup[] = []
    for (let j = k, i = n; j > 0; j--) {
      const s = cut[j][i]
      groups.unshift({ code: anchors[j - 1].code, top: rows[s], bottom: rows[i - 1], course: anchors[j - 1].course })
      i = s
    }
    return { total: best[k][n], groups }
  }
  const centered = solve((s, e, anchor) => Math.abs((rows[s] + rows[e]) / 2 - anchor.y))
  const topAligned = solve((s, _e, anchor) => Math.abs(rows[s] - anchor.y))
  return centered.total <= topAligned.total ? centered.groups : topAligned.groups
}

function groupOf(y: number, groups: RowGroup[], tolerance = 4) {
  const inside = groups.find(group => y <= group.top + tolerance && y >= group.bottom - tolerance)
  if (inside) return inside
  return groups.reduce<RowGroup | null>((closest, group) => {
    const distance = Math.min(Math.abs(y - group.top), Math.abs(y - group.bottom))
    const best = closest ? Math.min(Math.abs(y - closest.top), Math.abs(y - closest.bottom)) : Infinity
    return distance < best ? group : closest
  }, null)
}

/** 그냥 '간식'은 거래처 간식 설정이 하나면 그것, 아니면 위치(중식 앞 오전·석식 뒤 저녁·그 사이 오후)로 정한다 */
export function resolveSnacks(anchors: Anchor[], slots: MealSlotTarget[]) {
  const configured = slots.map(slot => slot.code).filter(code => SNACK_CODES.includes(code))
  return anchors.map((anchor, index) => {
    if (anchor.code !== -1) return anchor
    if (configured.length === 1) return { ...anchor, code: configured[0] }
    const before = anchors.slice(0, index).map(a => a.code)
    const code = !before.includes(2) ? 1 : before.includes(5) ? 6 : 3
    return { ...anchor, code: configured.length && !configured.includes(code) ? configured[0] : code }
  })
}

/**
 * excludedCourses: 빼는 코스('석식 죽' 형식). 코스는 왼쪽 열에서 식사 이름 아래에 있는 짧은 이름이다.
 * 머리줄은 요일 글자 줄, 요일이 없으면 날짜가 3개 이상인 가장 위 줄(요일은 날짜로 계산).
 * '<원산지>' 아래(원산지 표)는 읽지 않는다.
 */
export function parseMealTable(items: PdfTextItem[], pageCount: number, slots: MealSlotTarget[], excludedCourses: string[] = []): ParsedMealTable {
  const pages = [...new Set(items.map(item => item.page))].sort((a, b) => a - b)
  const days: ParsedMealDay[] = []
  const unconfigured = new Set<string>()
  const slotKey = (code: number) => String(code)
  const configuredCodes = new Set(slots.map(slot => slot.code))
  const excluded = new Set(excludedCourses)
  const courses: string[] = []
  let carriedGroups: RowGroup[] = []
  let carriedHeaderY: number | null = null

  for (const page of pages) {
    const allPageItems = items.filter(item => item.page === page)
    // 요일 머리글: 페이지에서 가장 위에 있는 요일 글자 줄. 요일이 없으면 날짜가 3개 이상 나란한 가장 위 줄
    const weekdayItems = allPageItems.filter(item => weekdayOf(item.text))
    let headerItems = weekdayItems
    if (!weekdayItems.length) {
      const dateItems = allPageItems.filter(item => isDateText(item.text))
      const rowY = [...dateItems].sort((a, b) => b.y - a.y).find(item => dateItems.filter(other => Math.abs(other.y - item.y) <= 6).length >= 3)?.y
      headerItems = rowY === undefined ? [] : dateItems.filter(item => Math.abs(item.y - rowY) <= 6)
    }
    const headerY: number | null = headerItems.length ? Math.max(...headerItems.map(item => item.y)) : carriedHeaderY
    const headers = headerItems.filter(item => headerY !== null && Math.abs(item.y - headerY) <= 6)
      .sort((a, b) => centerX(a) - centerX(b))
    if (!headers.length || headerY === null) continue
    carriedHeaderY = headerY

    // '<원산지>' 표시 아래는 원산지 표라 읽지 않는다
    const originMarks = allPageItems.filter(item => /원산지/.test(compact(item.text)) && item.y < headerY).map(item => item.y)
    const cutoffY = originMarks.length ? Math.max(...originMarks) : -Infinity
    const pageItems = allPageItems.filter(item => item.y > cutoffY + 2)

    // 식사 이름 글자(왼쪽 열). 없으면 앞 페이지의 행 구분을 그대로 쓴다(한 주가 두 쪽으로 나뉜 표)
    const labelItems = pageItems
      .map(item => ({ item, code: slotCodeOf(item.text, slots) }))
      .filter((entry): entry is { item: PdfTextItem; code: number } => entry.code !== null && entry.item.y < headerY)
    const leftMost = labelItems.length ? Math.min(...labelItems.map(entry => entry.item.x)) : 0
    const slotAnchors = resolveSnacks(
      labelItems.filter(entry => entry.item.x - leftMost <= 60)
        .sort((a, b) => b.item.y - a.item.y)
        .map(entry => ({ code: entry.code, y: entry.item.y })),
      slots,
    )
    // 왼쪽 열의 식사 아닌 짧은 이름('죽' 등)은 바로 위 식사의 코스
    // 날짜 열 왼쪽 경계: 첫 열 가운데에서 열 너비 절반만큼 왼쪽. 코스 이름은 이보다 왼쪽에 끝나야 한다(첫 열 메뉴를 코스로 잘못 보지 않게)
    const columnWidth = headers.length > 1 ? (centerX(headers[headers.length - 1]) - centerX(headers[0])) / (headers.length - 1) : 80
    const tableLeft = centerX(headers[0]) - columnWidth / 2
    const topSlotY = slotAnchors.length ? slotAnchors[0].y : null
    const courseItems = topSlotY === null ? [] : pageItems
      .filter(item => Math.abs(item.x - leftMost) <= 60 && item.x + (item.width ?? 0) < tableLeft && item.y < topSlotY
        && slotCodeOf(item.text, slots) === null && isCourseLabel(item.text))
    const courseAnchors: Anchor[] = courseItems.map(item => ({
      code: [...slotAnchors].reverse().find(anchor => anchor.y > item.y)?.code ?? slotAnchors[0].code,
      y: item.y,
      course: compact(item.text),
    }))
    const anchors: Anchor[] = [...slotAnchors, ...courseAnchors].sort((a, b) => b.y - a.y)
    // 원산지·안내 줄은 '/'로 쪼개기 전에 통째로 뺀다(쪼개면 일부가 메뉴처럼 보이고, 표 행 계산도 어긋난다)
    const menuItems = pageItems.filter(item => item.y < headerY - 2 && !isDateText(item.text) && !courseItems.includes(item)
      && !isOriginText(item.text) && !isNoticeText(item.text) && splitMenuText(item.text, slots).length > 0)
    const groups = anchors.length ? partitionRows(rowYs(menuItems), anchors) : carriedGroups
    if (anchors.length) carriedGroups = groups
    if (!groups.length) continue

    const columnDays = headers.map((header, index) => {
      const dateItem = isDateText(header.text) ? header : pageItems
        .filter(item => isDateText(item.text) && item.y < headerY && headerY - item.y < 40)
        .sort((a, b) => Math.abs(centerX(a) - centerX(header)) - Math.abs(centerX(b) - centerX(header)))[0]
      const date = dateItem ? normalizeDate(dateItem.text) : ''
      const label = weekdayOf(header.text) || weekdayOfMonthDay(date)
      const day: ParsedMealDay = { id: `pdf-${page}-${index}-${label}`, label, date, meals: {} }
      groups.forEach(group => { day.meals[slotKey(group.code)] = [] })
      return { header, day }
    })

    menuItems.forEach(item => {
      const column = columnDays.reduce((closest, current) =>
        Math.abs(centerX(current.header) - centerX(item)) < Math.abs(centerX(closest.header) - centerX(item)) ? current : closest)
      const group = groupOf(item.y, groups)
      if (!group) return
      if (group.course) {
        const name = `${SLOT_LABELS[group.code] ?? group.code} ${group.course}`
        if (!courses.includes(name)) courses.push(name)
        if (excluded.has(name)) return
      }
      const list = column.day.meals[slotKey(group.code)]
      splitMenuText(item.text, slots).forEach(menu => {
        if (!list.some(existing => compact(existing) === compact(menu))) list.push(menu)
      })
    })

    columnDays.forEach(({ day }) => {
      Object.keys(day.meals).forEach(key => {
        if (slots.length && !configuredCodes.has(Number(key)) && day.meals[key].length) {
          unconfigured.add(SLOT_LABELS[Number(key)] ?? key)
        }
      })
      days.push(day)
    })
  }

  const originTexts = [...new Set(items.filter(item => isOriginText(item.text) && compact(item.text).length > 4).map(item => item.text.trim()))]
  days.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : WEEKDAYS.indexOf(a.label as never) - WEEKDAYS.indexOf(b.label as never)))
  return { source: 'pdf', courses, pageCount, textItemCount: items.length, originTexts, days, unconfiguredSlots: [...unconfigured] }
}

export const SLOT_LABELS: Record<number, string> = { 0: '조식', 1: '오전간식', 2: '중식', 3: '오후간식', 4: 'DC', 5: '석식', 6: '저녁간식', 7: '기타간식', 8: '킨더간식' }
