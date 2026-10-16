import { workspaceAccountId } from '../workspace/workspaceAccount'
import { type PlanImpact } from '../../components/MealPlanImpact'
import { buildApiUrl } from '../../config/api'
import { parseMealTable, WEEKDAYS, type ParsedMealTable, type PdfTextItem } from '../../pages/operations/pdfMealParser'
import { getMenuAliases, saveMenuAliases, type MenuAlias } from '../../api/menuAliases'
import { getShortages, type ShortageResult, type ShortageCriteria } from '../../api/shortageProcurement'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { type AppAlertState } from '../../components/AppAlert'
import { type RecipeActionMenuState } from '../../components/RecipeActionMenu'
import { type RecipeViewMode } from '../../components/RecipeViewModal'
import { getAccountOptions, getAccountMenuManagerList, getAccountMenuDetailList, getAccountMealSlots, getAccountMealConfiguration, getMenuManagerList, getMealPlanAnalysis, getTableMealsDetailList, getTableMealsList, saveTableMeals, countConfirmedMeals, type AccountOption, type AccountMealSlot, type AccountMealConfiguration, type MenuIngredientItem, type MenuManagerItem, type TableMealsDetailItem, type TableMealsItem, type TableMealsSavePayload } from '../../api/operations'
import { type RecipeRequest } from '../../api/recipe'
import { requestAiTableMealsMatch } from '../../api/ai'
import { getIngredientStockStatus } from '../../utils/ingredientStockStatus'
import { buildTableMealsDetailDays, formatDateValue, formatMonthValue, getCurrentMonthWeekOptions, getTableMealsQueryPeriod, parseMonthValue, toMealSlotRows, type MealSlotKey, type MealSlotRow, type MonthWeekOption } from './tableMealsView'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export type WeeklyMealSetting = { food_type: number; meal_plan_type: number }
export type WeeklyMealSettings = Record<string, WeeklyMealSetting>

export type ExtractedMenuItem = {
  text: string
  matchedMenu: MenuManagerItem | null
  /** 메뉴명이 아니라 저장된 별칭(전에 사람이 고른 연결)으로 찾은 경우 */
  aliasMatched?: boolean
  /** PDF 화면에서 '이번만 제외'한 글자(메뉴가 아닌 행사·안내 문구 등) */
  excluded?: boolean
}

export type ParsedDay = {
  id: string
  label: string
  date: string
  meals: Record<MealSlotKey, ExtractedMenuItem[]>
}

export type ParsedPdfResult = {
  pageCount: number
  textItemCount: number
  originTexts: string[]
  /** PDF에는 있으나 거래처 식사 설정에 없는 식사 */
  unconfiguredSlots?: string[]
  days: ParsedDay[]
}

export type ManualMealRowId = string

export type ManualMealTarget = {
  dayId: string
  rowId: ManualMealRowId
  mealKey: MealSlotKey
}

export const MEAL_SLOT_LABELS: Record<MealSlotKey, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
  dcSnack: 'DC',
}

export const AUTO_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const
export const AUTO_KOREAN_FOOD_TYPE = 1
export const AUTO_CHINESE_FOOD_TYPE = 2
export const AUTO_JAPANESE_FOOD_TYPE = 3
export const AUTO_SNACK_FOOD_TYPE = 6
export const AUTO_MAIN_MENU_TYPE = '0'
export const AUTO_SIDE_MENU_TYPE = '1'
export const RICE_MENU_GUBUN_VALUE = '0'
export const SOUP_MENU_GUBUN_VALUE = '1'


export const MANUAL_MEAL_SLOT_ORDER: Array<{ id: ManualMealRowId; key: MealSlotKey; label: string }> = [
  { id: 'breakfast', key: 'breakfast', label: '아침' },
  { id: 'lunch', key: 'lunch', label: '점심' },
  { id: 'snack-afternoon', key: 'snack', label: '간식' },
  { id: 'dc-snack', key: 'dcSnack', label: 'DC' },
  { id: 'dinner', key: 'dinner', label: '저녁' },
  { id: 'snack-evening', key: 'snack', label: '간식' },
]

export const MANUAL_FOOD_TYPE_OPTIONS = [
  { value: '', label: '전체' },
  { value: '1', label: '한식' },
  { value: '2', label: '중식' },
  { value: '3', label: '일식' },
  { value: '4', label: '양식' },
  { value: '5', label: '분식' },
  { value: '6', label: '간식' },
  { value: '7', label: '기타' },
]

export const MANUAL_MENU_TYPE_OPTIONS = [
  { value: '', label: '전체' },
  { value: '0', label: '주메뉴' },
  { value: '1', label: '부메뉴' },
  { value: '2', label: '후식/간식' },
  { value: '3', label: '음료' },
  { value: '4', label: '기타' },
]



/** 메뉴명 매칭 키. 백엔드 MenuNames.key와 같은 규칙이어야 한다(별칭 유일키). 알레르기 번호·장식 기호는 메뉴가 아니므로 지운다. */
export function normalizeMenuText(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[([]\s*\d+(?:\s*[.,]\s*\d+)*\s*[)\]]/g, '')
    .trim()
    .replace(/(?<=\D)\d+(?:[.,]\d+)+$/, '')
    .replace(/[\s()[\]{}<>/\\|,.:;"'`~!@#$%^&*+=?_·•ㆍ\-★☆※◎○●◇◆□■▶▷♥♡]/g, '')
    .toLowerCase()
}

export function findMatchedMenu(text: string, menuItems: MenuManagerItem[]) {
  const normalizedText = normalizeMenuText(text)
  if (normalizedText.length < 2) {
    return null
  }

  const exactMatch = menuItems.find((menu) => normalizeMenuText(menu.menu_name) === normalizedText) ?? null
  if (exactMatch) {
    return exactMatch
  }

  return null
}

export function dedupeTexts(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = normalizeMenuText(value)
    if (key === '' || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function formatDateLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}.${day}`
}

export function normalizeCuisineText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

export function toCodeNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toFoodTypeCode(mealCategory: string) {
  const normalized = normalizeCuisineText(mealCategory)

  if (normalized.includes('한식')) return 1
  if (normalized.includes('중식')) return 2
  if (normalized.includes('일식')) return 3
  if (normalized.includes('양식')) return 4
  if (normalized.includes('분식')) return 5
  if (normalized.includes('간식')) return 6
  return 7
}

export function getMenuFoodTypeCode(menu: MenuManagerItem) {
  return Number.isFinite(menu.food_type) ? menu.food_type ?? 7 : toFoodTypeCode(menu.meal_category)
}

export function isJjajangMenu(menu: MenuManagerItem) {
  const normalizedName = normalizeMenuText(menu.menu_name)
  return normalizedName.includes(normalizeMenuText('짜장면')) || normalizedName.includes(normalizeMenuText('자장면'))
}

export function getAutoMenuCost(menu: MenuManagerItem) {
  if (menu.menu_cost_complete === false) return 0
  return Math.max(menu.menu_cost_per_person ?? 0, 0)
}

export function dailyMenuKeys(menu: MenuManagerItem) {
  return [`id:${menu.menu_id}`, `name:${normalizeMenuText(menu.menu_name)}`]
}

export function pickRotatingMenu(
  items: MenuManagerItem[],
  usedMenuIds: Set<string>,
  seed: number,
  remainingBudget = Number.POSITIVE_INFINITY,
  dailyUsed = new Set<string>(),
) {
  if (items.length === 0) {
    return null
  }

  // 원가·예산 조건을 통과한 메뉴 안에서 미사용을 우선한다.
  // 부적합한 미사용 메뉴가 남아 있어도 적합한 기존 메뉴로 다음 날짜를 채울 수 있어야 한다.
  const eligibleItems = items.filter((item) => getAutoMenuCost(item) > 0 && getAutoMenuCost(item) <= remainingBudget
    && !dailyMenuKeys(item).some(key => dailyUsed.has(key)))
  const unusedItems = eligibleItems.filter((item) => !usedMenuIds.has(item.menu_id))
  const candidates = unusedItems.length > 0 ? unusedItems : eligibleItems
  if (candidates.length === 0) return null
  const picked = candidates[seed % candidates.length]
  usedMenuIds.add(picked.menu_id)
  dailyMenuKeys(picked).forEach(key => dailyUsed.add(key))
  return picked
}

export function addMenuIfPresent(target: MenuManagerItem[], menu: MenuManagerItem | null, usedMenuIds: Set<string>) {
  if (!menu || target.some((item) => item.menu_id === menu.menu_id)) {
    return
  }

  target.push(menu)
  usedMenuIds.add(menu.menu_id)
}

export function pickAutoMealMenus(
  accountMenus: MenuManagerItem[],
  foodType: number,
  usedMenuIds: Set<string>,
  seed: number,
  preferredMainMenu: MenuManagerItem | null = null,
  mealBudgetPerPerson = Number.POSITIVE_INFINITY,
  dailyUsed = new Set<string>(),
) {
  const cuisineMenus = accountMenus.filter((menu) => getMenuFoodTypeCode(menu) === foodType)
  const mainMenus = cuisineMenus.filter((menu) => menu.menu_type === AUTO_MAIN_MENU_TYPE)
  const riceMenus = mainMenus.filter((menu) => menu.menu_gubun === RICE_MENU_GUBUN_VALUE)
  const mainMenusWithoutRice = mainMenus.filter((menu) => menu.menu_gubun !== RICE_MENU_GUBUN_VALUE)
  const sideMenus = cuisineMenus.filter((menu) => menu.menu_type === AUTO_SIDE_MENU_TYPE)
  const soupMenus = sideMenus.filter((menu) => menu.menu_gubun === SOUP_MENU_GUBUN_VALUE)
  const normalSideMenus = sideMenus.filter((menu) => menu.menu_gubun !== SOUP_MENU_GUBUN_VALUE)
  const mealMenus: MenuManagerItem[] = []
  const primaryMainMenus = foodType === AUTO_KOREAN_FOOD_TYPE ? mainMenusWithoutRice : mainMenus
  const remainingBudget = () =>
    Math.max(mealBudgetPerPerson - mealMenus.reduce((sum, menu) => sum + getAutoMenuCost(menu), 0), 0)
  const affordablePreferredMain =
    preferredMainMenu && getAutoMenuCost(preferredMainMenu) > 0 && getAutoMenuCost(preferredMainMenu) <= remainingBudget()
      ? preferredMainMenu
      : null

  if (affordablePreferredMain) dailyMenuKeys(affordablePreferredMain).forEach(key => dailyUsed.add(key))

  addMenuIfPresent(
    mealMenus,
    affordablePreferredMain ??
      pickRotatingMenu(primaryMainMenus.length > 0 ? primaryMainMenus : mainMenus, usedMenuIds, seed, remainingBudget(), dailyUsed),
    usedMenuIds,
  )

  if (foodType === AUTO_KOREAN_FOOD_TYPE) {
    addMenuIfPresent(mealMenus, pickRotatingMenu(riceMenus, usedMenuIds, seed + 10, remainingBudget(), dailyUsed), usedMenuIds)
  }

  addMenuIfPresent(mealMenus, pickRotatingMenu(soupMenus, usedMenuIds, seed + 1, remainingBudget(), dailyUsed), usedMenuIds)

  Array.from({ length: 2 }).forEach((_, sideIndex) => {
    addMenuIfPresent(
      mealMenus,
      pickRotatingMenu(normalSideMenus, usedMenuIds, seed + sideIndex + 2, remainingBudget(), dailyUsed),
      usedMenuIds,
    )
  })

  return mealMenus
}

export function buildAutoTableMealsResult(accountMenus: MenuManagerItem[], week: MonthWeekOption): ParsedPdfResult {
  const snackMenus = accountMenus.filter((menu) => getMenuFoodTypeCode(menu) === AUTO_SNACK_FOOD_TYPE)
  const jjajangMenus = accountMenus.filter(isJjajangMenu)
  const usedMenuIds = new Set<string>()

  const days: ParsedDay[] = week.dates.map((date, dayIndex) => {
    const isThursday = date.getDay() === 4
    const lunchFoodType = isThursday || dayIndex % 2 === 0 ? AUTO_CHINESE_FOOD_TYPE : AUTO_JAPANESE_FOOD_TYPE
    const jjajangMenu = isThursday ? pickRotatingMenu(jjajangMenus, usedMenuIds, dayIndex) : null
    const breakfastMenus = pickAutoMealMenus(accountMenus, AUTO_KOREAN_FOOD_TYPE, usedMenuIds, dayIndex * 10)
    const lunchMenus = pickAutoMealMenus(accountMenus, lunchFoodType, usedMenuIds, dayIndex * 10 + 100, jjajangMenu)
    const dinnerMenus = pickAutoMealMenus(accountMenus, AUTO_KOREAN_FOOD_TYPE, usedMenuIds, dayIndex * 10 + 200)
    const snackMenu = pickRotatingMenu(snackMenus, usedMenuIds, dayIndex)
    const weekdayLabel = AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7]

    return {
      id: `auto-${formatDateValue(date)}`,
      label: weekdayLabel,
      date: formatDateLabel(date),
      meals: {
        breakfast: breakfastMenus.map((menu) => ({ text: menu.menu_name, matchedMenu: menu })),
        lunch: lunchMenus.map((menu) => ({ text: menu.menu_name, matchedMenu: menu })),
        dinner: dinnerMenus.map((menu) => ({ text: menu.menu_name, matchedMenu: menu })),
        snack: snackMenu ? [{ text: snackMenu.menu_name, matchedMenu: snackMenu }] : [],
        dcSnack: [],
      },
    }
  })

  return {
    pageCount: 0,
    textItemCount: days.reduce(
      (sum, day) => sum + day.meals.breakfast.length + day.meals.lunch.length + day.meals.dinner.length + day.meals.snack.length,
      0,
    ),
    originTexts: [],
    days,
  }
}

// 고객사에서 설정한 식사구분만 대상으로 자동 식단을 생성한다.
export function buildConfiguredAutoTableMealsResult(
  accountMenus: MenuManagerItem[],
  week: MonthWeekOption,
  mealSlotRows: MealSlotRow[],
  configuration: AccountMealConfiguration | null = null,
  weeklySettings: WeeklyMealSettings = {},
  menusByDate: Record<string, MenuManagerItem[]> = {},
): ParsedPdfResult {
  const usedMenuIds = new Set<string>()
  const days = week.dates.map((date, dayIndex) => {
    const dailyUsed = new Set<string>()
    const dateMenus = menusByDate[formatDateValue(date)] ?? accountMenus
    const isThursday = date.getDay() === 4
    const lunchFoodType = isThursday || dayIndex % 2 === 0 ? AUTO_CHINESE_FOOD_TYPE : AUTO_JAPANESE_FOOD_TYPE
    const meals: Record<MealSlotKey, ExtractedMenuItem[]> = {}

    mealSlotRows.forEach((slot, slotIndex) => {
      const profile = configuration?.profiles.find((item) => item.meal_slot_code === slot.code)
      const weeklySetting = weeklySettings[`${formatDateValue(date)}:${slot.code}`]
      const planType = weeklySetting?.meal_plan_type ?? profile?.default_meal_plan_type
      const slotMenus = planType == null
        ? dateMenus
        : dateMenus.filter((menu) => (menu.meal_plan_type ?? 0) === planType)
      const snackMenus = slotMenus.filter((menu) => getMenuFoodTypeCode(menu) === AUTO_SNACK_FOOD_TYPE)
      if ([1, 3, 4, 6, 7, 8].includes(slot.code)) {
        const snack = pickRotatingMenu(
          snackMenus,
          usedMenuIds,
          dayIndex * 10 + slotIndex,
          profile?.budget_per_person ?? Number.POSITIVE_INFINITY,
          dailyUsed,
        )
        meals[slot.key] = snack ? [{ text: snack.menu_name, matchedMenu: snack }] : []
        return
      }

      const foodType = weeklySetting?.food_type ?? profile?.default_food_type ?? (slot.code === 2 ? lunchFoodType : AUTO_KOREAN_FOOD_TYPE)
      const jjajangMenus = slotMenus.filter(isJjajangMenu)
      const preferredMenu = slot.code === 2 && isThursday && foodType === AUTO_CHINESE_FOOD_TYPE
        ? pickRotatingMenu(jjajangMenus, usedMenuIds, dayIndex, profile?.budget_per_person ?? Number.POSITIVE_INFINITY, dailyUsed)
        : null
      meals[slot.key] = pickAutoMealMenus(
        slotMenus,
        foodType,
        usedMenuIds,
        dayIndex * 100 + slotIndex * 10,
        preferredMenu,
        profile?.budget_per_person ?? Number.POSITIVE_INFINITY,
        dailyUsed,
      ).map((menu) => ({ text: menu.menu_name, matchedMenu: menu }))
    })

    return {
      id: `auto-${formatDateValue(date)}`,
      label: AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7],
      date: formatDateLabel(date),
      meals,
    }
  })

  return {
    pageCount: 0,
    textItemCount: days.reduce(
      (sum, day) => sum + Object.values(day.meals).reduce((mealSum, items) => mealSum + items.length, 0),
      0,
    ),
    originTexts: [],
    days,
  }
}

// 고객사에서 사용하는 식사구분 행만 빈 수기 식단으로 만든다.
export function createConfiguredManualTableMealsDays(week: MonthWeekOption, mealSlotRows: MealSlotRow[]): ParsedDay[] {
  return week.dates.map((date) => ({
    id: `manual-${formatDateValue(date)}`,
    label: AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7],
    date: formatDateLabel(date),
    meals: Object.fromEntries(mealSlotRows.map((slot) => [slot.key, [] as ExtractedMenuItem[]])),
  }))
}

// PDF 기존 형식 파서와의 호환을 위해 기존 고정 정의를 유지한다.
void [MEAL_SLOT_LABELS, MANUAL_MEAL_SLOT_ORDER, buildAutoTableMealsResult, createManualTableMealsDays]

export function createManualTableMealsDays(week: MonthWeekOption): ParsedDay[] {
  return week.dates.map((date) => ({
    id: `manual-${formatDateValue(date)}`,
    label: AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7],
    date: formatDateLabel(date),
    meals: {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
      dcSnack: [],
    },
  }))
}

export function buildTableMealsResultFromDays(days: ParsedDay[]): ParsedPdfResult {
  return {
    pageCount: 0,
    textItemCount: days.reduce(
      (sum, day) => sum + Object.values(day.meals).reduce((mealSum, mealItems) => mealSum + mealItems.length, 0),
      0,
    ),
    originTexts: [],
    days,
  }
}


export function getMealBudgetSummary(
  mealItems: ExtractedMenuItem[],
  mealSlotCode: number,
  configuration: AccountMealConfiguration | null,
) {
  const budget = configuration?.profiles.find((item) => item.meal_slot_code === mealSlotCode)?.budget_per_person
  const hasUnpricedMenu = mealItems.some((item) => !item.matchedMenu || getAutoMenuCost(item.matchedMenu) <= 0)
  const cost = mealItems.reduce(
    (sum, item) => sum + (item.matchedMenu ? getAutoMenuCost(item.matchedMenu) : 0),
    0,
  )

  return {
    budget,
    cost,
    hasUnpricedMenu,
    isOverBudget: budget != null && cost > budget,
  }
}

export function hasIngredientShortage(items: MenuIngredientItem[]) {
  return items.some((item) => getIngredientStockStatus(item).needsOrder)
}

export function mergeManualEveningSnacks(days: ParsedDay[], eveningSnacks: Record<string, ExtractedMenuItem[]>) {
  return days.map((day) => ({
    ...day,
    meals: {
      ...day.meals,
      snack: [...(day.meals.snack ?? []), ...(eveningSnacks[day.id] ?? [])],
    },
  }))
}

export function hasSameTableMealsWeek(tableMeals: TableMealsItem[], accountId: string, week: MonthWeekOption) {
  const firstDate = week.dates[0] ?? new Date()
  const tableYear = firstDate.getFullYear()
  const tableMonth = firstDate.getMonth() + 1
  const tableWeek = Number(week.value) + 1
  const expectedWeekText = `${tableYear}년 ${tableMonth}월 ${tableWeek}주차`

  return tableMeals.some((item) => {
    if (item.account_id && item.account_id !== accountId) {
      return false
    }

    const hasTableParts =
      Number.isFinite(item.table_year) && Number.isFinite(item.table_month) && Number.isFinite(item.table_week)

    if (hasTableParts) {
      return item.table_year === tableYear && item.table_month === tableMonth && item.table_week === tableWeek
    }

    return item.table_name.includes(expectedWeekText)
  })
}

export function buildTableMealsSavePayload(
  result: ParsedPdfResult,
  week: MonthWeekOption,
  accountId: string,
  accountName: string,
  source: TableMealsSavePayload['source'] = 'auto',
  mealPlanType = 0,
  configuration: AccountMealConfiguration | null = null,
  weeklySettings: WeeklyMealSettings = {},
): TableMealsSavePayload {
  const firstDate = week.dates[0] ?? new Date()
  const meals = result.days.flatMap((day) =>
    Object.entries(day.meals)
      .map(([mealSlot, mealItems]) => {
        const mealSlotCode = /^\d+$/.test(mealSlot)
          ? Number(mealSlot)
          : ({ breakfast: 0, lunch: 2, dinner: 5, snack: 3, dcSnack: 4 } as Record<string, number>)[mealSlot]
        const profile = configuration?.profiles.find((item) => item.meal_slot_code === mealSlotCode)
        const weeklySetting = weeklySettings[`${day.id.replace(/^(auto|manual)-/, '')}:${mealSlotCode}`]
        const menus = mealItems
          .map((item) => item.matchedMenu)
          .filter((menu): menu is MenuManagerItem => menu !== null)
          .map((menu, index) => ({
            sort_order: index + 1,
            menu_id: menu.menu_id,
            menu_name: menu.menu_name,
            food_type: getMenuFoodTypeCode(menu),
            menu_type: toCodeNumber(menu.menu_type),
            menu_gubun: toCodeNumber(menu.menu_gubun, 18),
          }))

        return {
          meal_date: day.id.replace(/^(auto|manual)-/, ''),
          weekday: day.label,
          meal_slot: mealSlot,
          meal_slot_code: mealSlotCode,
          food_type: weeklySetting?.food_type ?? profile?.default_food_type,
          meal_plan_type: weeklySetting?.meal_plan_type ?? profile?.default_meal_plan_type ?? mealPlanType,
          template_id: profile?.template_id,
          meal_budget_per_person: profile?.budget_per_person,
          menu_count: menus.length,
          menus,
        }
      })
      .filter((meal) => meal.menus.length > 0),
  )

  return {
    account_id: accountId,
    account_name: accountName,
    table_name: `${firstDate.getFullYear()}년 ${firstDate.getMonth() + 1}월 ${Number(week.value) + 1}주차 ${
      source === 'manual' ? '수기' : '자동'
    } 식단표`,
    table_year: firstDate.getFullYear(),
    table_month: firstDate.getMonth() + 1,
    table_week: Number(week.value) + 1,
    source,
    meal_plan_type: mealPlanType,
    meals,
    table_meals: meals.flatMap((meal) =>
      meal.menus.map((menu) => ({
        meal_date: meal.meal_date,
        weekday: meal.weekday,
        meal_slot: meal.meal_slot,
        ...menu,
      })),
    ),
  }
}

export function matchPdfMenu(text: string, menuItems: MenuManagerItem[], aliasMenuIds: Map<string, string>): ExtractedMenuItem {
  const exact = findMatchedMenu(text, menuItems)
  if (exact) return { text, matchedMenu: exact }
  const aliasMenuId = aliasMenuIds.get(normalizeMenuText(text))
  const aliasMenu = aliasMenuId ? menuItems.find((menu) => menu.menu_id === aliasMenuId) ?? null : null
  return aliasMenu ? { text, matchedMenu: aliasMenu, aliasMatched: true } : { text, matchedMenu: null }
}

export function buildParsedPdfResult(raw: ParsedMealTable, menuItems: MenuManagerItem[], aliasMenuIds: Map<string, string>): ParsedPdfResult {
  const match = (text: string) => matchPdfMenu(text, menuItems, aliasMenuIds)
  return {
    pageCount: raw.pageCount,
    textItemCount: raw.textItemCount,
    originTexts: raw.originTexts,
    unconfiguredSlots: raw.unconfiguredSlots,
    days: raw.days.map((day) => ({
      ...day,
      meals: Object.fromEntries(Object.entries(day.meals).map(([slot, texts]) => [slot, texts.map(match)])),
    })),
  }
}

/** PDF 글자와 위치만 뽑는다. 요일·식사 해석은 거래처 식사 설정이 필요해 pdfMealParser에서 따로 한다 */
export async function extractPdfText(file: File): Promise<{ items: PdfTextItem[]; pageCount: number }> {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const items: PdfTextItem[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const textContent = await (await pdf.getPage(pageNumber)).getTextContent()
    textContent.items.forEach((entry) => {
      if (!('str' in entry) || entry.str.trim() === '') return
      const transform = Array.isArray(entry.transform) ? entry.transform : []
      items.push({ text: entry.str.trim(), x: Number(transform[4] ?? 0), y: Number(transform[5] ?? 0), width: Number(entry.width ?? 0), page: pageNumber })
    })
  }
  if (items.length === 0) throw new Error('PDF에서 글자를 찾지 못했습니다. 스캔(사진)한 PDF는 읽을 수 없으니 엑셀·한글에서 PDF로 저장한 파일을 올려주세요.')
  return { items, pageCount: pdf.numPages }
}

/** pdfMenuOverrides 특수값: 이번 식단에서 뺀 글자, 저장된 별칭을 이번만 쓰지 않음 */
export const PDF_EXCLUDED = '__excluded__'
export const PDF_UNLINKED = '__unlinked__'

/**
 * 식단표 관리(PC·터치 공용): 거래처·월·식단 유형, 주간 식사 편성, 저장된 식단표 목록·상세, PDF 식단표 읽기·메뉴 맞추기(별칭·AI),
 * 자동·수기 식단 편집기, 예정 식수·부족재고 확인 후 저장, 인쇄·발주 연결, 레시피 보기 상태.
 */
export function useTableMealsWorkspace() {
  const [pdfMenuOverrides, setPdfMenuOverrides] = useState<Record<string, string>>({})
  const [menuAliases, setMenuAliases] = useState<MenuAlias[]>([])
  const [rememberPdfLinks, setRememberPdfLinks] = useState(true)
  const [pdfLinkMessage, setPdfLinkMessage] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountId = workspaceAccountId(searchParams)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId)
  const [selectedTableMonth, setSelectedTableMonth] = useState(() => formatMonthValue(new Date()))
  const [selectedMealPlanType, setSelectedMealPlanType] = useState(0)
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [accountMealSlots, setAccountMealSlots] = useState<AccountMealSlot[]>([])
  const [accountMealConfiguration, setAccountMealConfiguration] = useState<AccountMealConfiguration | null>(null)
  const [weeklyMealSettings, setWeeklyMealSettings] = useState<WeeklyMealSettings>({})
  const [isWeeklySettingsOpen, setIsWeeklySettingsOpen] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [tableMeals, setTableMeals] = useState<TableMealsItem[]>([])
  const [, setMenuItems] = useState<MenuManagerItem[]>([])
  const [accountMenuItems, setAccountMenuItems] = useState<MenuManagerItem[]>([])
  const [menuError, setMenuError] = useState('')
  const [accountMenuError, setAccountMenuError] = useState('')
  const [tableError, setTableError] = useState('')
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [isAccountMenuLoading, setIsAccountMenuLoading] = useState(false)
  const [isPdfParsing, setIsPdfParsing] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('업로드한 PDF가 없습니다.')
  // PDF에서 뽑은 글자·위치. 요일·식사 해석은 거래처 식사 설정이 바뀌면 다시 한다(rawParsedResult)
  const [pdfText, setPdfText] = useState<{ items: PdfTextItem[]; pageCount: number } | null>(null)
  /** PDF 미등록 메뉴 등록 창 대상(표기·요일·식사) */
  const [registerTarget, setRegisterTarget] = useState<{ text: string; context: string; slotCode: number | null } | null>(null)
  const [originRevision, setOriginRevision] = useState(0)
  const [selectedTableMeal, setSelectedTableMeal] = useState<TableMealsItem | null>(null)
  const [tableMealDetailItems, setTableMealDetailItems] = useState<TableMealsDetailItem[]>([])
  const [tableMealDetailError, setTableMealDetailError] = useState('')
  const [isTableMealDetailLoading, setIsTableMealDetailLoading] = useState(false)
  const [selectedDetailMenu, setSelectedDetailMenu] = useState<MenuManagerItem | null>(null)
  const [detailItems, setDetailItems] = useState<MenuIngredientItem[]>([])
  const [menuShortageById, setMenuShortageById] = useState<Record<string, boolean>>({})
  const [tableMealShortageById, setTableMealShortageById] = useState<Record<string, boolean>>({})
  const [detailError, setDetailError] = useState('')
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [recipeMenuState, setRecipeMenuState] = useState<RecipeActionMenuState | null>(null)
  const [recipeViewRequest, setRecipeViewRequest] = useState<RecipeRequest | null>(null)
  const [recipeViewMode, setRecipeViewMode] = useState<RecipeViewMode>('ai')
  const [recipeRegisterRequest, setRecipeRegisterRequest] = useState<RecipeRequest | null>(null)
  const [aiMatchMessage, setAiMatchMessage] = useState('')
  const [aiMatchedMenuIdsByText, setAiMatchedMenuIdsByText] = useState<Record<string, string>>({})
  const [isAiMatching, setIsAiMatching] = useState(false)
  // 자동 식단표 주차: 기본은 오늘 다음에 시작하는 주(다음 주 식단을 미리 만들어 발주). 이번 달에 없으면 마지막 주
  const [autoWeekValue, setAutoWeekValue] = useState(() => {
    const weeks = getCurrentMonthWeekOptions()
    const today = new Date(); today.setHours(23, 59, 59, 999)
    const next = weeks.findIndex(week => week.dates[0] > today)
    return String(next >= 0 ? next : Math.max(0, weeks.length - 1))
  })
  const [autoGeneratedResult, setAutoGeneratedResult] = useState<ParsedPdfResult | null>(null)
  const [autoGenerateMessage, setAutoGenerateMessage] = useState('')
  const [isTableSaving, setIsTableSaving] = useState(false)
  const [tableSaveMessage, setTableSaveMessage] = useState('')
  const [plannedServings, setPlannedServings] = useState('')
  const [draftSessionAccount, setDraftSessionAccount] = useState('')
  const restoredSettings = useRef<{ accountId: string; week: string; settings: WeeklyMealSettings } | null>(null)
  const [savedStockCheck, setSavedStockCheck] = useState<{ loading: boolean; saveWhenSufficient: boolean; criteria: ShortageCriteria; payload: TableMealsSavePayload; result?: ShortageResult; impact?: PlanImpact; error?: string } | null>(null)

  /** 식단 저장. 저장한 식단표 ID를 돌려준다(취소·실패면 null). */
  // 식사당 예정 식수: 거래처마다 마지막에 쓴 값을 기억해 다음 식단 제작 때 미리 채운다(매번 입력하지 않게)
  useEffect(() => {
    if (!selectedAccountId) return
    try { const saved = localStorage.getItem(`planned-servings:${selectedAccountId}`); if (saved) setPlannedServings(current => current || saved) } catch { /* 저장소를 못 쓰면 직접 입력 */ }
  }, [selectedAccountId])
  useEffect(() => {
    if (!selectedAccountId || !Number.isInteger(Number(plannedServings)) || Number(plannedServings) <= 0) return
    try { localStorage.setItem(`planned-servings:${selectedAccountId}`, plannedServings) } catch { /* 무시 */ }
  }, [selectedAccountId, plannedServings])

  const persistPlan = async (payload: TableMealsSavePayload): Promise<string | null> => {
    // 사용 확정한 주를 다시 저장하면 그 주의 확정이 모두 풀리고 차감했던 재고가 복원된다(서버 저장 규칙).
    const confirmedMeals = await countConfirmedMeals(payload)
    if (confirmedMeals > 0 && !window.confirm(`이 식단표에는 사용 확정된 식사 ${confirmedMeals}개가 있습니다.
저장하면 이 주의 사용 확정이 모두 풀리고 차감했던 재고가 복원됩니다.
저장한 뒤 식단표 상세에서 '주간 사용 확정'을 다시 해야 재고가 맞습니다.

계속 저장할까요?`)) return null
    setIsTableSaving(true)
    try {
      const saved = await saveTableMeals(payload)
      const month = `${payload.table_year}-${String(payload.table_month).padStart(2, '0')}`
      setSelectedTableMonth(month)
      setSavedStockCheck(null); setIsManualEditorOpen(false)
      sessionStorage.removeItem(`plan-editor:${payload.account_id}`)
      sessionStorage.removeItem(`plan-procurement:${payload.account_id}`)
      setDraftSessionAccount('')
      setTableSaveMessage(`${payload.table_name} 저장이 완료되었습니다.`)
      try {
        const items = await getTableMealsList(payload.account_id, payload.table_year, payload.table_month)
        setTableMeals(items)
        setSelectedTableMeal(items.find(item => item.table_id === saved.table_id) || null)
      } catch (error) { setTableError(`저장은 완료됐지만 목록 조회에 실패했습니다: ${error instanceof Error ? error.message : ''}`) }
      return saved.table_id ? String(saved.table_id) : null
    } catch (error) {
      setTableSaveMessage(`식단표 저장 실패: ${error instanceof Error ? error.message : '다시 시도해주세요.'}`)
      return null
    } finally { setIsTableSaving(false) }
  }

  /**
   * 업무 순서 ①→②(2026-10-16, 식단표부터 발주까지 클릭 5번): 식단을 저장하고 바로 그 식단 기준 발주 화면으로.
   * 발주 화면은 바로 시킬 수 있는 품목을 미리 골라 둔다(autoselect=1).
   */
  const saveAndOrder = async (payload: TableMealsSavePayload) => {
    const tableId = await persistPlan(payload)
    if (!tableId) return
    navigate(`/order_manager/food_order?${new URLSearchParams({ account_id: payload.account_id, source: 'PLAN', table_id: tableId, autoselect: '1' })}`)
  }
  /** 편집 중인 식단(자동 제작·수정 포함)을 저장하고 발주로 */
  const saveCurrentAndOrder = async () => {
    try { await saveAndOrder(currentDraftPayload()) }
    catch (error) { setTableSaveMessage(error instanceof Error ? error.message : '식단을 확인해주세요.') }
  }

  const createDraftCriteria = (payload: TableMealsSavePayload): ShortageCriteria => {
    const dates = payload.meals.map(meal => meal.meal_date).sort()
    const today = new Date().toLocaleDateString('sv-SE')
    return { account_id: payload.account_id, source: 'DRAFT', table_id: `${payload.account_id}_${payload.table_year}_${payload.table_month}_${payload.table_week}_${payload.source}_${payload.meal_plan_type}`,
      date_from: dates[0], date_to: dates[dates.length - 1] < today ? today : dates[dates.length - 1],
      delivery_date: dates[0] > today ? dates[0] : today, sold_to: '', average_days: 30, coverage_days: 1,
      draft_meals: payload.meals.flatMap(meal => meal.menus.map(menu => ({ menu_id: menu.menu_id, planned_servings: payload.planned_servings!, meal_date: meal.meal_date }))) }
  }

  const preparePlan = async (payload: TableMealsSavePayload, saveWhenSufficient = true) => {
    const criteria = createDraftCriteria(payload)
    setIsTableSaving(true); setTableSaveMessage(''); setManualMessage('')
    setSavedStockCheck({ loading: true, saveWhenSufficient, criteria, payload })
    try {
      const result = await getShortages(criteria)
      const impactResponse = await fetch(buildApiUrl('/v2/meal-plans/impact'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(criteria) })
      const impact = await impactResponse.json() as PlanImpact & { message?: string }
      if (!impactResponse.ok) throw new Error(impact.message || '식단 변경 영향 조회 실패')
      setSavedStockCheck({ loading: false, saveWhenSufficient, criteria, payload, result, impact })
      if (!result.ingredients.length && !impact.affected_orders.length && !impact.completed_meals && saveWhenSufficient) await persistPlan(payload)
    } catch (error) {
      setSavedStockCheck({ loading: false, saveWhenSufficient, criteria, payload, error: error instanceof Error ? error.message : '필요량을 확인하지 못했습니다.' })
    } finally { setIsTableSaving(false) }
  }

  const [isManualEditorOpen, setIsManualEditorOpen] = useState(false)
  const [mealEditorSource, setMealEditorSource] = useState<TableMealsSavePayload['source']>('manual')
  const [manualDays, setManualDays] = useState<ParsedDay[]>([])
  const [manualEveningSnackItems, setManualEveningSnackItems] = useState<Record<string, ExtractedMenuItem[]>>({})
  const [manualTarget, setManualTarget] = useState<ManualMealTarget | null>(null)
  const [manualSearchText, setManualSearchText] = useState('')
  const [manualFoodTypeFilter, setManualFoodTypeFilter] = useState('')
  const [manualMenuTypeFilter, setManualMenuTypeFilter] = useState('')
  const [manualMessage, setManualMessage] = useState('')
  const [alert, setAlert] = useState<AppAlertState | null>(null)



  useEffect(() => {
    let isMounted = true

    const loadAccounts = async () => {
      try {
        setAccountError('')
        const accounts = await getAccountOptions()
        if (!isMounted) {
          return
        }

        setAccountOptions(accounts)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setAccountOptions([])
        setAccountError(error instanceof Error ? error.message : '거래처 목록을 불러오지 못했습니다.')
      }
    }

    void loadAccounts()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadMenus = async () => {
      try {
        setMenuError('')
        const items = await getMenuManagerList()
        if (!isMounted) {
          return
        }

        setMenuItems(items)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setMenuItems([])
        setMenuError(error instanceof Error ? error.message : '메뉴 목록을 불러오지 못했습니다.')
      }
    }

    void loadMenus()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadTableMeals = async () => {
      if (selectedAccountId === '') {
        setTableMeals([])
        setTableError('')
        setIsTableLoading(false)
        return
      }

      try {
        setIsTableLoading(true)
        setTableError('')
        const tableMonthParts = parseMonthValue(selectedTableMonth)
        const items = await getTableMealsList(selectedAccountId, tableMonthParts.year, tableMonthParts.month)
        if (!isMounted) {
          return
        }

        setTableMeals(items)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setTableMeals([])
        setTableError(error instanceof Error ? error.message : '식단표 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsTableLoading(false)
        }
      }
    }

    void loadTableMeals()

    return () => {
      isMounted = false
    }
  }, [selectedAccountId, selectedTableMonth])

  useEffect(() => {
    let isMounted = true

    const loadAccountMenus = async () => {
      if (selectedAccountId === '') {
        setAccountMenuItems([])
        setAccountMenuError('')
        setIsAccountMenuLoading(false)
        return
      }

      try {
        setIsAccountMenuLoading(true)
        setAccountMenuError('')
        const [items, aliases] = await Promise.all([
          getAccountMenuManagerList(selectedAccountId),
          getMenuAliases(selectedAccountId).catch(() => [] as MenuAlias[]),
        ])
        if (!isMounted) {
          return
        }

        setAccountMenuItems(items)
        setMenuAliases(aliases)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setAccountMenuItems([])
        setAccountMenuError(error instanceof Error ? error.message : '거래처 메뉴 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsAccountMenuLoading(false)
        }
      }
    }

    setAutoGeneratedResult(null)
    setAutoGenerateMessage('')
    setTableSaveMessage('')
    void loadAccountMenus()

    return () => {
      isMounted = false
    }
  }, [selectedAccountId])

  useEffect(() => {
    let isMounted = true
    if (!selectedAccountId) {
      setAccountMealSlots([])
      setAccountMealConfiguration(null)
      return () => { isMounted = false }
    }

    void Promise.all([getAccountMealSlots(selectedAccountId), getAccountMealConfiguration(selectedAccountId)])
      .then(([items, configuration]) => {
        if (isMounted) {
          setAccountMealSlots(items)
          setAccountMealConfiguration(configuration)
        }
      })
      .catch(() => {
        if (isMounted) {
          setAccountMealSlots([])
          setAccountMealConfiguration(null)
        }
      })

    return () => { isMounted = false }
  }, [selectedAccountId])

  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(`plan-editor:${selectedAccountId}`) || 'null')
      if (draft) {
        restoredSettings.current = { accountId: selectedAccountId, week: draft.autoWeekValue, settings: draft.weeklyMealSettings || {} }
        setSelectedMealPlanType(draft.selectedMealPlanType ?? 0)
        setDraftSessionAccount(selectedAccountId)
        setManualDays(draft.manualDays); setManualEveningSnackItems(draft.manualEveningSnackItems)
        setAutoGeneratedResult(draft.autoGeneratedResult); setPlannedServings(draft.plannedServings)
        setAutoWeekValue(draft.autoWeekValue); setMealEditorSource(draft.mealEditorSource)
        setIsManualEditorOpen(draft.isManualEditorOpen)
      }
    } catch { /* A stale draft does not prevent normal editing. */ }
  }, [selectedAccountId])

  const rawParsedResult = useMemo(
    () => (pdfText ? parseMealTable(pdfText.items, pdfText.pageCount, toMealSlotRows(accountMealSlots)) : null),
    [pdfText, accountMealSlots],
  )
  const parsedPdfResult = useMemo(
    () => {
      if (!rawParsedResult) return null
      const aliasMenuIds = new Map(menuAliases.map(alias => [normalizeMenuText(alias.alias_name), alias.menu_id]))
      const result = buildParsedPdfResult(rawParsedResult, accountMenuItems, aliasMenuIds)
      result.days.forEach(day => Object.entries(day.meals).forEach(([slot, items]) => items.forEach((item, index) => {
        const id = pdfMenuOverrides[`${selectedAccountId}/${day.id}/${slot}/${index}`]
        if (id === PDF_EXCLUDED) { item.matchedMenu = null; item.aliasMatched = false; item.excluded = true }
        else if (id) { item.matchedMenu = accountMenuItems.find(menu => menu.menu_id === id) || null; item.aliasMatched = false }
      })))
      return result
    },
    [rawParsedResult, accountMenuItems, menuAliases, pdfMenuOverrides, selectedAccountId],
  )

  useEffect(() => {
    const restored = restoredSettings.current
    if (restored?.accountId === selectedAccountId && restored.week === autoWeekValue) {
      setWeeklyMealSettings(restored.settings); restoredSettings.current = null
    } else { setWeeklyMealSettings({}) }
    setIsWeeklySettingsOpen(false)
  }, [selectedAccountId, autoWeekValue])

  const updateWeeklyMealSetting = (date: Date, slot: MealSlotRow, patch: Partial<WeeklyMealSetting>) => {
    const key = `${formatDateValue(date)}:${slot.code}`
    const profile = accountMealConfiguration?.profiles.find((item) => item.meal_slot_code === slot.code)
    setWeeklyMealSettings((current) => ({
      ...current,
      [key]: {
        food_type: current[key]?.food_type ?? profile?.default_food_type ?? ([1, 3, 4, 6, 7, 8].includes(slot.code) ? 6 : 1),
        meal_plan_type: current[key]?.meal_plan_type ?? profile?.default_meal_plan_type ?? selectedMealPlanType,
        ...patch,
      },
    }))
  }

  const currentMonthWeeks = useMemo(() => getCurrentMonthWeekOptions(), [])
  const selectedAutoWeek = currentMonthWeeks[Number(autoWeekValue)] ?? currentMonthWeeks[0]
  const displayedMealResult = parsedPdfResult ?? autoGeneratedResult
  const displayedMenuIds = useMemo(() => {
    const ids = new Set<string>()

    const sourceDays = [...(displayedMealResult?.days ?? []), ...manualDays]

    sourceDays.forEach((day) => {
      Object.values(day.meals).forEach((mealItems) => {
        mealItems.forEach((item) => {
          const matchedMenuId = item.matchedMenu?.menu_id ?? aiMatchedMenuIdsByText[normalizeMenuText(item.text)]
          if (matchedMenuId) {
            ids.add(matchedMenuId)
          }
        })
      })
    })

    return Array.from(ids)
  }, [aiMatchedMenuIdsByText, displayedMealResult, manualDays])

  const selectedAccountName = useMemo(
    () => accountOptions.find((option) => option.value === selectedAccountId)?.text ?? '',
    [accountOptions, selectedAccountId],
  )

  const configuredMealSlotRows = useMemo(() => toMealSlotRows(accountMealSlots), [accountMealSlots])

  const selectedTableMonthParts = useMemo(() => parseMonthValue(selectedTableMonth), [selectedTableMonth])

  const matchedCount = useMemo(
    () =>
      displayedMealResult?.days.reduce(
        (sum, day) =>
          sum +
          Object.values(day.meals).reduce(
            (mealSum, mealItems) => mealSum + mealItems.filter((item) => item.matchedMenu !== null).length,
            0,
          ),
        0,
      ) ?? 0,
    [displayedMealResult],
  )

  const tableMealDetailDays = useMemo(() => buildTableMealsDetailDays(tableMealDetailItems), [tableMealDetailItems])

  const manualSelectedDay = useMemo(
    () => (manualTarget ? manualDays.find((day) => day.id === manualTarget.dayId) ?? null : null),
    [manualDays, manualTarget],
  )

  const filteredManualMenus = useMemo(() => {
    const normalizedSearchText = normalizeMenuText(manualSearchText)

    return accountMenuItems.filter((menu) => {
      if ((menu.meal_plan_type ?? 0) !== selectedMealPlanType) return false
      if (manualFoodTypeFilter !== '' && String(getMenuFoodTypeCode(menu)) !== manualFoodTypeFilter) {
        return false
      }

      if (manualMenuTypeFilter !== '' && menu.menu_type !== manualMenuTypeFilter) {
        return false
      }

      if (normalizedSearchText !== '' && !normalizeMenuText(menu.menu_name).includes(normalizedSearchText)) {
        return false
      }

      return true
    })
  }, [accountMenuItems, manualFoodTypeFilter, manualMenuTypeFilter, manualSearchText, selectedMealPlanType])

  useEffect(() => {
    let isMounted = true

    const loadTableMealDetailList = async () => {
      if (!selectedTableMeal?.table_id) {
        setTableMealDetailItems([])
        setTableMealShortageById({})
        setTableMealDetailError('')
        setIsTableMealDetailLoading(false)
        return
      }

      const accountId = selectedTableMeal.account_id || selectedAccountId
      if (accountId === '') {
        setTableMealDetailItems([])
        setTableMealShortageById({})
        setTableMealDetailError('거래처 정보가 없어 식단표 상세를 조회할 수 없습니다.')
        setIsTableMealDetailLoading(false)
        return
      }

      try {
        setIsTableMealDetailLoading(true)
        setTableMealDetailError('')
        const queryPeriod = getTableMealsQueryPeriod(selectedTableMeal, selectedTableMonth)
        const [items, analysisItems] = await Promise.all([
          getTableMealsDetailList(accountId, selectedTableMeal.table_id, queryPeriod),
          getMealPlanAnalysis(accountId, selectedTableMeal.table_id, queryPeriod).catch(() => []),
        ])
        if (!isMounted) {
          return
        }

        setTableMealDetailItems(items)
        setTableMealShortageById(
          analysisItems.reduce<Record<string, boolean>>((result, item) => {
            if (item.menu_id && getIngredientStockStatus(item).needsOrder) {
              result[item.menu_id] = true
            }
            return result
          }, {}),
        )
      } catch (error) {
        if (!isMounted) {
          return
        }

        setTableMealDetailItems([])
        setTableMealShortageById({})
        setTableMealDetailError(error instanceof Error ? error.message : '식단표 상세를 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsTableMealDetailLoading(false)
        }
      }
    }

    void loadTableMealDetailList()

    return () => {
      isMounted = false
    }
  }, [selectedAccountId, selectedTableMeal, selectedTableMonth])

  useEffect(() => {
    let isMounted = true

    const loadShortageMenus = async () => {
      if (displayedMenuIds.length === 0) {
        setMenuShortageById({})
        return
      }

      const entries = await Promise.all(
        displayedMenuIds.map(async (menuId) => {
          try {
            const items = await getAccountMenuDetailList(menuId, selectedAccountId)
            return [menuId, hasIngredientShortage(items)] as const
          } catch {
            return [menuId, false] as const
          }
        }),
      )

      if (isMounted) {
        setMenuShortageById(Object.fromEntries(entries))
      }
    }

    void loadShortageMenus()

    return () => {
      isMounted = false
    }
  }, [displayedMenuIds, selectedAccountId])

  useEffect(() => {
    let isMounted = true

    const loadDetailList = async () => {
      if (!selectedDetailMenu?.menu_id) {
        setDetailItems([])
        setDetailError('')
        setIsDetailLoading(false)
        return
      }

      try {
        setIsDetailLoading(true)
        setDetailError('')
        const items = await getAccountMenuDetailList(selectedDetailMenu.menu_id, selectedAccountId)
        if (!isMounted) {
          return
        }

        setDetailItems(items)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setDetailItems([])
        setDetailError(error instanceof Error ? error.message : '식자재 상세 목록을 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          setIsDetailLoading(false)
        }
      }
    }

    void loadDetailList()

    return () => {
      isMounted = false
    }
  }, [selectedAccountId, selectedDetailMenu?.menu_id])

  useEffect(() => {
    const message =
      tableSaveMessage ||
      manualMessage ||
      autoGenerateMessage ||
      aiMatchMessage ||
      accountMenuError ||
      accountError ||
      tableError ||
      menuError ||
      pdfError

    if (!message) {
      return
    }

    const isSuccess =
      message.includes('완료') ||
      message.includes('만들었습니다') ||
      message.includes('채웠습니다') ||
      message.includes('반영했습니다')

    setAlert({
      type: isSuccess ? 'success' : 'error',
      title: isSuccess ? '알림' : '확인 필요',
      message,
    })
  }, [
    accountError,
    accountMenuError,
    aiMatchMessage,
    autoGenerateMessage,
    manualMessage,
    menuError,
    pdfError,
    tableError,
    tableSaveMessage,
  ])

  const closeAlert = () => {
    setAlert(null)
    setAccountError('')
    setAccountMenuError('')
    setAutoGenerateMessage('')
    setManualMessage('')
    setTableSaveMessage('')
    setAiMatchMessage('')
    setMenuError('')
    setTableError('')
    setPdfError('')
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const openTableMealDetail = (item: TableMealsItem) => {
    setSelectedTableMeal(item)
  }

  const closeTableMealDetail = () => {
    setSelectedTableMeal(null)
    setTableMealDetailItems([])
    setTableMealShortageById({})
  }

  // 식단표 업장 이름: 지금 거래처 목록의 이름(이름이 바뀌었어도 현재 이름) → 저장 당시 이름 → 로그인한 업장 이름
  const tableMealAccountName = (selectedTableMeal && (accountOptions.find(option => option.value === selectedTableMeal.account_id)?.text
    || selectedTableMeal.account_name)) || localStorage.getItem('account_name') || ''

  /** A4 가로 한 장에 맞춘다: 인쇄 폭(281mm)으로 잠깐 펼쳐 높이를 재고, 넘치면 그만큼 줄인 배율을 인쇄에만 쓴다. */
  const printTableMealDetail = () => {
    const sheet = document.querySelector<HTMLElement>('.table-meals-print-area .table-meals-hangyeol')
    if (sheet) {
      sheet.style.removeProperty('--meal-print-zoom')
      document.body.classList.add('meal-print-measure')
      const PRINT_WIDTH = 1062, PRINT_HEIGHT = 733 // A4 가로 297×210mm - 여백 8mm, 96dpi
      const scale = Math.min(1, (PRINT_HEIGHT / sheet.scrollHeight) * 0.97, PRINT_WIDTH / sheet.scrollWidth)
      document.body.classList.remove('meal-print-measure')
      sheet.style.setProperty('--meal-print-zoom', scale.toFixed(3))
    }
    window.print()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setPdfMenuOverrides({})
    setUploadedFileName(file.name)
    setPdfError('')
    setPdfText(null)
    setAutoGeneratedResult(null)
    setAutoGenerateMessage('')
    setTableSaveMessage('')
    setRegisterTarget(null)
    setAiMatchedMenuIdsByText({})
    setAiMatchMessage('')

    try {
      setIsPdfParsing(true)
      setPdfText(await extractPdfText(file))
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'PDF를 분석하지 못했습니다.')
    } finally {
      setIsPdfParsing(false)
      event.target.value = ''
    }
  }

  const transferPdfToEditor = async () => {
    if (!parsedPdfResult) return
    setPdfLinkMessage('')
    if (!selectedAccountId || !selectedAutoWeek) { setPdfLinkMessage('식단을 넣을 거래처와 주차를 먼저 선택해주세요.'); return }
    if (configuredMealSlotRows.length === 0) { setPdfLinkMessage('고객사 관리에서 제공할 식사구분을 먼저 설정해 주세요.'); return }
    // PDF에 연도까지 적힌 날짜가 있으면 선택한 주차와 같은 주인지 확인한다(다른 주에 저장되는 실수 방지)
    const weekDates = selectedAutoWeek.dates.map(formatDateValue)
    const pdfDates = parsedPdfResult.days.map(day => day.date).filter(date => /^\d{4}-/.test(date)).sort()
    if (pdfDates.length > 0 && !pdfDates.some(date => weekDates.includes(date))) {
      setPdfLinkMessage(`PDF 식단 날짜(${pdfDates[0]} ~ ${pdfDates[pdfDates.length - 1]})가 선택한 주차(${weekDates[0]} ~ ${weekDates[weekDates.length - 1]})와 다릅니다. 조회 월·주차를 PDF 날짜에 맞춰주세요.`)
      return
    }
    if (hasSameTableMealsWeek(await refreshTableMeals(), selectedAccountId, selectedAutoWeek)) {
      setPdfLinkMessage('이 주차에는 이미 저장된 식단표가 있습니다. 식단표 조회에서 열어 수정해주세요.')
      return
    }
    if (rememberPdfLinks) {
      const picked = new Map<string, { alias_name: string; menu_id: string }>()
      parsedPdfResult.days.forEach(day => Object.entries(day.meals).forEach(([slot, items]) => items.forEach((item, index) => {
        const id = pdfMenuOverrides[`${selectedAccountId}/${day.id}/${slot}/${index}`]
        if (!id || id === PDF_EXCLUDED || !item.matchedMenu) return
        if (normalizeMenuText(item.text) === normalizeMenuText(item.matchedMenu.menu_name)) return
        picked.set(normalizeMenuText(item.text), { alias_name: item.text, menu_id: item.matchedMenu.menu_id })
      })))
      if (picked.size > 0) {
        try {
          const result = await saveMenuAliases(selectedAccountId, [...picked.values()])
          setMenuAliases(await getMenuAliases(selectedAccountId))
          setPdfLinkMessage(`메뉴 연결 ${result.saved_count}건을 기억했습니다. 거래처 메뉴 관리에서 지울 수 있습니다.`)
        } catch (error) {
          // 연결 기억은 부가 기능이라 실패해도 편집은 계속한다.
          setPdfLinkMessage(`메뉴 연결을 기억하지 못했습니다: ${error instanceof Error ? error.message : ''}`)
        }
      }
    }
    // 선택 주차의 날짜 칸(manual-YYYY-MM-DD)에 PDF 요일을 채운다. 같은 날짜가 있으면 날짜로, 없으면 요일로 맞춘다
    setManualDays(createConfiguredManualTableMealsDays(selectedAutoWeek, configuredMealSlotRows).map((day, index) => {
      const date = weekDates[index]
      const source = parsedPdfResult.days.find(pdfDay => pdfDay.date === date || (pdfDay.date.length === 5 && date.endsWith(pdfDay.date)))
        ?? parsedPdfResult.days.find(pdfDay => !/^\d{4}-/.test(pdfDay.date) && pdfDay.label === WEEKDAYS[(selectedAutoWeek.dates[index].getDay() + 6) % 7])
      if (!source) return day
      return { ...day, meals: Object.fromEntries(Object.keys(day.meals).map(slot => [slot, (source.meals[slot] ?? []).filter(item => !item.excluded)])) }
    }))
    setManualEveningSnackItems({}); setMealEditorSource('manual'); setIsManualEditorOpen(true)
    setManualMessage('PDF 메뉴 선택 결과를 편집기로 가져왔습니다. 주차·예정 식수와 식사 합계를 확인한 뒤 저장하세요.')
  }

  const setPdfOverride = (dayId: string, mealKey: string, itemIndex: number, value: string | null) =>
    setPdfMenuOverrides(current => {
      const key = `${selectedAccountId}/${dayId}/${mealKey}/${itemIndex}`
      const next = { ...current }
      if (value) next[key] = value; else delete next[key]
      return next
    })

  const openRegisterModal = (menuText: string, day: ParsedDay, mealKey: string) => {
    const slot = configuredMealSlotRows.find(row => row.key === mealKey)
    setRegisterTarget({ text: menuText, context: [day.date, day.label, slot?.label].filter(Boolean).join(' '), slotCode: slot ? slot.code : null })
  }

  /** 등록 창에서 메뉴가 정해지면 메뉴 목록을 다시 읽고, 이 PDF에서 같은 표기인 칸을 모두 그 메뉴로 연결한다 */
  const handleRegisteredMenu = async (menuId: string, notice: string) => {
    if (!registerTarget) return
    const items = await getAccountMenuManagerList(selectedAccountId)
    setAccountMenuItems(items)
    const key = normalizeMenuText(registerTarget.text)
    setPdfMenuOverrides(current => {
      const next = { ...current }
      rawParsedResult?.days.forEach(day => Object.entries(day.meals).forEach(([slot, texts]) => texts.forEach((text, index) => {
        if (normalizeMenuText(text) === key) next[`${selectedAccountId}/${day.id}/${slot}/${index}`] = menuId
      })))
      return next
    })
    setPdfLinkMessage(notice)
    setRegisterTarget(null)
  }

  const getExtractedMenuTexts = () => {
    if (!rawParsedResult) {
      return []
    }

    return dedupeTexts(
      rawParsedResult.days.flatMap((day) => Object.values(day.meals).flatMap((mealItems) => mealItems)),
    )
  }

  const handleAiMatch = async () => {
    const extractedMenus = getExtractedMenuTexts()
    if (extractedMenus.length === 0) {
      setAiMatchMessage('AI로 매칭할 PDF 메뉴가 없습니다.')
      return
    }

    try {
      setIsAiMatching(true)
      setAiMatchMessage('')
      const result = await requestAiTableMealsMatch({
        account_id: selectedAccountId,
        account_name: selectedAccountName,
        extracted_menus: extractedMenus,
        menu_candidates: accountMenuItems.map((menu) => ({
          menu_id: menu.menu_id,
          menu_name: menu.menu_name,
          meal_category: menu.meal_category,
        })),
      })

      const nextMatches = Object.fromEntries(
        result.matches
          .filter((match) => match.text && match.menu_id)
          .map((match) => [normalizeMenuText(match.text), match.menu_id]),
      )
      setAiMatchedMenuIdsByText(nextMatches)
      setAiMatchMessage(
        result.matches.length > 0
          ? `AI 메뉴 후보 ${result.matches.length}건을 찾았습니다. 식사 예산을 확인하고 추천 메뉴를 선택해주세요.`
          : 'AI 매칭 서버가 준비되면 더 유연한 메뉴 매칭이 반영됩니다.',
      )
    } catch (error) {
      setAiMatchMessage(error instanceof Error ? error.message : 'AI 식단표 메뉴 매칭을 실행하지 못했습니다.')
    } finally {
      setIsAiMatching(false)
    }
  }

  const refreshTableMeals = async () => {
    if (selectedAccountId === '') {
      return []
    }

    setIsTableLoading(true)
    try {
      const items = await getTableMealsList(selectedAccountId, selectedTableMonthParts.year, selectedTableMonthParts.month)
      setTableMeals(items)
      setTableError('')
      return items
    } catch (error) {
      setTableError(error instanceof Error ? error.message : '식단표 목록을 다시 불러오지 못했습니다.')
      return tableMeals
    } finally {
      setIsTableLoading(false)
    }
  }

  const openManualEditor = async () => {
    if (selectedAccountId === '') {
      setManualMessage('거래처를 먼저 선택해주세요.')
      return
    }

    if (!selectedAutoWeek) {
      setManualMessage('수기 식단표를 만들 주차를 선택해주세요.')
      return
    }

    const latestTableMeals = await refreshTableMeals()
    if (hasSameTableMealsWeek(latestTableMeals, selectedAccountId, selectedAutoWeek)) {
      setManualMessage('이미 존재하는 식단표입니다.')
      return
    }

    try {
      setIsAccountMenuLoading(true)
      setAccountMenuError('')
      setManualMessage('')
      const items = await getAccountMenuManagerList(selectedAccountId)
      setAccountMenuItems(items)
      setMealEditorSource('manual')
      if (configuredMealSlotRows.length === 0) {
        setManualMessage('고객사 관리에서 제공할 식사구분을 먼저 설정해 주세요.')
        return
      }
      setManualDays(createConfiguredManualTableMealsDays(selectedAutoWeek, configuredMealSlotRows))
      setManualEveningSnackItems({})
      setManualTarget({
        dayId: `manual-${formatDateValue(selectedAutoWeek.dates[0] ?? new Date())}`,
        rowId: configuredMealSlotRows[0].id,
        mealKey: configuredMealSlotRows[0].key,
      })
      setIsManualEditorOpen(true)
    } catch (error) {
      setAccountMenuItems([])
      setAccountMenuError(error instanceof Error ? error.message : '거래처 메뉴 목록을 불러오지 못했습니다.')
    } finally {
      setIsAccountMenuLoading(false)
    }
  }

  const closeManualEditor = () => {
    setIsManualEditorOpen(false)
    setManualMessage('')
  }

  const openAutoEditor = () => {
    if (!autoGeneratedResult) {
      setAutoGenerateMessage('수정할 자동 식단표가 없습니다.')
      return
    }

    setMealEditorSource('auto')
    setManualDays(autoGeneratedResult.days)
    setManualEveningSnackItems({})
    setManualTarget(
      autoGeneratedResult.days[0]
        ? {
            dayId: autoGeneratedResult.days[0].id,
            rowId: configuredMealSlotRows[0]?.id ?? '',
            mealKey: configuredMealSlotRows[0]?.key ?? '',
          }
        : null,
    )
    setManualMessage('')
    setIsManualEditorOpen(true)
  }

  const getManualMealItems = (day: ParsedDay, mealSlot: { id: ManualMealRowId; key: MealSlotKey }) =>
    mealSlot.id === 'snack-evening' ? manualEveningSnackItems[day.id] ?? [] : day.meals[mealSlot.key] ?? []

  const addManualMenu = (menu: MenuManagerItem) => {
    if (!manualTarget) {
      setManualMessage('메뉴를 넣을 칸을 먼저 선택해주세요.')
      return
    }

    if (manualTarget.rowId === 'snack-evening') {
      setManualEveningSnackItems((current) => {
        const currentMeals = current[manualTarget.dayId] ?? []
        if (currentMeals.some((item) => item.matchedMenu?.menu_id === menu.menu_id)) {
          return current
        }

        return {
          ...current,
          [manualTarget.dayId]: [...currentMeals, { text: menu.menu_name, matchedMenu: menu }],
        }
      })
      return
    }

    setManualDays((currentDays) =>
      currentDays.map((day) => {
        if (day.id !== manualTarget.dayId) {
          return day
        }

        const currentMeals = day.meals[manualTarget.mealKey]
        if (currentMeals.some((item) => item.matchedMenu?.menu_id === menu.menu_id)) {
          return day
        }

        return {
          ...day,
          meals: {
            ...day.meals,
            [manualTarget.mealKey]: [...currentMeals, { text: menu.menu_name, matchedMenu: menu }],
          },
        }
      }),
    )
  }

  const removeManualMenu = (dayId: string, rowId: ManualMealRowId, mealKey: MealSlotKey, menuIndex: number) => {
    if (rowId === 'snack-evening') {
      setManualEveningSnackItems((current) => ({
        ...current,
        [dayId]: (current[dayId] ?? []).filter((_, index) => index !== menuIndex),
      }))
      return
    }

    setManualDays((currentDays) =>
      currentDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              meals: {
                ...day.meals,
                [mealKey]: day.meals[mealKey].filter((_, index) => index !== menuIndex),
              },
            }
          : day,
      ),
    )
  }

  const clearManualMeal = (dayId: string, rowId: ManualMealRowId, mealKey: MealSlotKey) => {
    if (rowId === 'snack-evening') {
      setManualEveningSnackItems((current) => ({
        ...current,
        [dayId]: [],
      }))
      return
    }

    setManualDays((currentDays) =>
      currentDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              meals: {
                ...day.meals,
                [mealKey]: [],
              },
            }
          : day,
      ),
    )
  }

  const fillManualWithAutoRecommendation = () => {
    if (!selectedAutoWeek || accountMenuItems.length === 0) {
      setManualMessage('추천으로 채울 거래처 메뉴가 없습니다.')
      return
    }

    const recommendedResult = buildConfiguredAutoTableMealsResult(
      accountMenuItems,
      selectedAutoWeek,
      configuredMealSlotRows,
      accountMealConfiguration,
      weeklyMealSettings,
    )
    setManualDays(recommendedResult.days)
    setManualEveningSnackItems({})
    setManualTarget(
      recommendedResult.days[0]
        ? {
            dayId: recommendedResult.days[0].id,
            rowId: configuredMealSlotRows[0]?.id ?? '',
            mealKey: configuredMealSlotRows[0]?.key ?? '',
          }
        : null,
    )
    setManualMessage('자동 추천 식단을 채웠습니다. 필요한 칸만 수정해서 저장하세요.')
  }

  const saveManualTableMeals = async () => {
    if (!selectedAccountId || !selectedAutoWeek) { setTableSaveMessage('거래처와 주차를 선택해주세요.'); return }
    if (!Number.isInteger(Number(plannedServings)) || Number(plannedServings) <= 0) { setTableSaveMessage('식사당 예정 식수를 입력해주세요.'); return }
    const result = buildTableMealsResultFromDays(mergeManualEveningSnacks(manualDays, manualEveningSnackItems))
    if (result.days.some(day => Object.values(day.meals).some(items => items.some(item => !item.matchedMenu)))) { setTableSaveMessage('등록되지 않은 메뉴가 있습니다. 메뉴 연결을 확인해주세요.'); return }
    const payload = buildTableMealsSavePayload(
      result,
      selectedAutoWeek,
      selectedAccountId,
      selectedAccountName,
      mealEditorSource,
      selectedMealPlanType,
      accountMealConfiguration,
      weeklyMealSettings,
    )
    if (!payload.meals.length) { setTableSaveMessage('저장할 메뉴가 없습니다.'); return }
    await preparePlan({ ...payload, planned_servings: Number(plannedServings) })
  }

  const handleAutoGenerate = async () => {
    if (!Number.isInteger(Number(plannedServings)) || Number(plannedServings) <= 0) { setAutoGenerateMessage('자동 식단의 부족재고를 계산할 예정 식수를 먼저 입력해주세요.'); return }
    if (selectedAccountId === '') {
      setAutoGenerateMessage('거래처를 먼저 선택해주세요.')
      return
    }

    if (!selectedAutoWeek) {
      setAutoGenerateMessage('자동 식단표를 만들 주차를 선택해주세요.')
      return
    }

    const latestTableMeals = await refreshTableMeals()
    if (hasSameTableMealsWeek(latestTableMeals, selectedAccountId, selectedAutoWeek)) {
      setAutoGenerateMessage('이미 존재하는 식단표입니다.')
      return
    }

    const accountId = selectedAccountId
    let selectedAccountMenus: MenuManagerItem[] = []
    let menusByDate: Record<string, MenuManagerItem[]> = {}

    try {
      setIsAccountMenuLoading(true)
      setAccountMenuError('')
      setAutoGenerateMessage('')
      selectedAccountMenus = await getAccountMenuManagerList(accountId)
      menusByDate = Object.fromEntries(selectedAutoWeek.dates.map(date => [formatDateValue(date), selectedAccountMenus]))
      setAccountMenuItems(selectedAccountMenus)
    } catch (error) {
      setAccountMenuItems([])
      setAccountMenuError(error instanceof Error ? error.message : 'Failed to load account menu list.')
      setAutoGenerateMessage('거래처 메뉴 목록을 불러오지 못했습니다.')
      return
    } finally {
      setIsAccountMenuLoading(false)
    }

    if (selectedAccountMenus.length === 0) {
      setAutoGenerateMessage('거래처 메뉴 목록이 비어 있어 자동 식단표를 만들 수 없습니다.')
      return
    }

    if (!Object.values(menusByDate).some(menus => menus.some(menu => getAutoMenuCost(menu) > 0))) {
      const reasons = selectedAccountMenus.map(menu => `${menu.menu_name}: ${menu.menu_cost_reason || '레시피·가격 확인 필요'}`).join(' / ')
      setAutoGenerateMessage(`원가가 산정된 거래처 메뉴가 없습니다. ${reasons}`)
      return
    }

    if (configuredMealSlotRows.length === 0) {
      setAutoGenerateMessage('고객사 관리에서 제공할 식사구분을 먼저 설정해 주세요.')
      return
    }

    const result = buildConfiguredAutoTableMealsResult(
      selectedAccountMenus,
      selectedAutoWeek,
      configuredMealSlotRows,
      accountMealConfiguration,
      weeklyMealSettings,
      menusByDate,
    )
    const generatedMenuCount = result.days.reduce(
      (sum, day) => sum + Object.values(day.meals).reduce((mealSum, items) => mealSum + items.length, 0),
      0,
    )

    setPdfText(null)
    setAiMatchedMenuIdsByText({})
    setAiMatchMessage('')
    setPdfError('')
    setUploadedFileName(`${selectedAutoWeek.label} 자동 식단표`)
    setAutoGeneratedResult(result)
    setMealEditorSource('auto')
    setManualDays(result.days)
    setManualEveningSnackItems({})
    setManualTarget(
      result.days[0]
        ? {
            dayId: result.days[0].id,
            rowId: configuredMealSlotRows[0].id,
            mealKey: configuredMealSlotRows[0].key,
          }
        : null,
    )
    setTableSaveMessage('')
    setAutoGenerateMessage(generatedMenuCount > 0 ? '' : '조건에 맞는 거래처 메뉴가 없어 자동 식단표를 만들지 못했습니다. 식단 유형·메뉴 분류·원가·식사 단가를 확인해주세요.')
    if (generatedMenuCount > 0) {
      setManualMessage('')
      setIsManualEditorOpen(true)
      const payload = buildTableMealsSavePayload(result, selectedAutoWeek, accountId, selectedAccountName,
        'auto', selectedMealPlanType, accountMealConfiguration, weeklyMealSettings)
      await preparePlan({ ...payload, planned_servings: Number(plannedServings) }, false)
    }
  }

  const handleSaveAutoTableMeals = async () => {
    if (!selectedAccountId || !selectedAutoWeek) { setTableSaveMessage('거래처와 주차를 선택해주세요.'); return }
    if (!Number.isInteger(Number(plannedServings)) || Number(plannedServings) <= 0) { setTableSaveMessage('식사당 예정 식수를 입력해주세요.'); return }
    if (!autoGeneratedResult) { setTableSaveMessage('저장할 자동 식단표가 없습니다.'); return }
    const payload = buildTableMealsSavePayload(
      autoGeneratedResult,
      selectedAutoWeek,
      selectedAccountId,
      selectedAccountName,
      'auto',
      selectedMealPlanType,
      accountMealConfiguration,
      weeklyMealSettings,
    )
    if (!payload.meals.length) { setTableSaveMessage('저장할 메뉴가 없습니다.'); return }
    await preparePlan({ ...payload, planned_servings: Number(plannedServings) })
  }

  const getAiMatchedMenu = (text: string) => {
    const matchedMenuId = aiMatchedMenuIdsByText[normalizeMenuText(text)]
    return matchedMenuId ? accountMenuItems.find((menu) => menu.menu_id === matchedMenuId) ?? null : null
  }

  const getMenuShortageClass = (menu: Pick<MenuManagerItem, 'menu_id'> | null | undefined) =>
    menu?.menu_id && menuShortageById[menu.menu_id] ? ' is-shortage' : ''

  const getTableMealShortageClass = (menu: Pick<TableMealsDetailItem, 'menu_id'>) =>
    menu.menu_id && tableMealShortageById[menu.menu_id] ? ' is-shortage' : ''

  const currentDraftPayload = () => {
    if (!selectedAccountId || !selectedAutoWeek) throw new Error('거래처와 주차를 선택해주세요.')
    if (!Number.isInteger(Number(plannedServings)) || Number(plannedServings) <= 0) throw new Error('식사당 예정 식수를 입력해주세요.')
    const result = buildTableMealsResultFromDays(mergeManualEveningSnacks(manualDays, manualEveningSnackItems))
    const payload = buildTableMealsSavePayload(result, selectedAutoWeek, selectedAccountId, selectedAccountName,
      mealEditorSource, selectedMealPlanType, accountMealConfiguration, weeklyMealSettings)
    if (!payload.meals.length) throw new Error('발주할 식단 메뉴를 먼저 구성해주세요.')
    return { ...payload, planned_servings: Number(plannedServings) }
  }
  const keepDraft = (criteria: ShortageCriteria) => {
    const key = `plan-procurement:${criteria.account_id}`
    sessionStorage.setItem(key, JSON.stringify(criteria))
    sessionStorage.setItem(`plan-editor:${criteria.account_id}`, JSON.stringify({ manualDays, manualEveningSnackItems,
      autoGeneratedResult, plannedServings, autoWeekValue, mealEditorSource, isManualEditorOpen, weeklyMealSettings, selectedMealPlanType }))
    return key
  }
  const openDraftProcurement = (criteria: ShortageCriteria) => {
    const key = keepDraft(criteria)
    navigate(`/order_manager/food_order?${new URLSearchParams({ account_id: criteria.account_id, source: 'DRAFT', draft_key: key })}`)
  }
  const goToSavedFoodOrder = () => {
    const query = new URLSearchParams({ account_id: selectedAccountId, source: 'PLAN' })
    if (selectedTableMeal?.table_id) query.set('table_id', selectedTableMeal.table_id)
    navigate(`/order_manager/food_order?${query}`)
  }
  const goToFoodOrder = (_menuId: string) => {
    void _menuId // 공통 메뉴 액션 콜백 시그니처를 유지하고 전체 식단을 발주한다.
    if (selectedTableMeal && !isManualEditorOpen) { goToSavedFoodOrder(); return }
    try { openDraftProcurement(createDraftCriteria(currentDraftPayload())) }
    catch (error) { setTableSaveMessage(error instanceof Error ? error.message : '식단의 필요량을 확인해주세요.') }
  }
  const checkCurrentDraftStock = async () => {
    try { await preparePlan(currentDraftPayload(), false) }
    catch (error) { setTableSaveMessage(error instanceof Error ? error.message : '식단의 필요량을 확인해주세요.') }
  }
  // Keep the returned editor and procurement criteria in sync, scoped to the restored account.
  useEffect(() => {
    if (!selectedAccountId || draftSessionAccount !== selectedAccountId) return
    try { keepDraft(createDraftCriteria(currentDraftPayload())) }
    catch { sessionStorage.removeItem(`plan-procurement:${selectedAccountId}`) }
  }, [draftSessionAccount, selectedAccountId, manualDays, manualEveningSnackItems, autoGeneratedResult,
    plannedServings, autoWeekValue, mealEditorSource, isManualEditorOpen, weeklyMealSettings, selectedMealPlanType, accountMealConfiguration])

  const createShortageOrder = goToFoodOrder

  const buildRecipeRequest = (menuName: string, menu?: Pick<MenuManagerItem, 'menu_id' | 'menu_name'> | null): RecipeRequest => ({
    menu_id: menu?.menu_id,
    menu_name: menu?.menu_name || menuName,
    account_id: selectedAccountId,
    account_name: selectedAccountName,
    source: 'table-meals',
    ingredients: detailItems
      .filter((item) => !menu || item.menu_id === menu.menu_id)
      .map((item) => ({
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient_name || item.ingredient_name_raw || '',
        category_name: item.category_name,
        required_qty: item.required_qty,
        qty_num: item.qty_num,
        qty_unit: item.qty_unit,
        base_unit: item.base_unit,
      })),
  })

  return { pdfMenuOverrides, setPdfMenuOverrides, menuAliases, setMenuAliases, rememberPdfLinks, setRememberPdfLinks, pdfLinkMessage, setPdfLinkMessage, navigate, searchParams, initialAccountId, fileInputRef, selectedAccountId, setSelectedAccountId, selectedTableMonth, setSelectedTableMonth, selectedMealPlanType, setSelectedMealPlanType, accountOptions, setAccountOptions, accountMealSlots, setAccountMealSlots, accountMealConfiguration, setAccountMealConfiguration, weeklyMealSettings, setWeeklyMealSettings, isWeeklySettingsOpen, setIsWeeklySettingsOpen, accountError, setAccountError, tableMeals, setTableMeals, setMenuItems, accountMenuItems, setAccountMenuItems, menuError, setMenuError, accountMenuError, setAccountMenuError, tableError, setTableError, isTableLoading, setIsTableLoading, isAccountMenuLoading, setIsAccountMenuLoading, isPdfParsing, setIsPdfParsing, pdfError, setPdfError, uploadedFileName, setUploadedFileName, pdfText, setPdfText, registerTarget, setRegisterTarget, originRevision, setOriginRevision, selectedTableMeal, setSelectedTableMeal, tableMealDetailItems, setTableMealDetailItems, tableMealDetailError, setTableMealDetailError, isTableMealDetailLoading, setIsTableMealDetailLoading, selectedDetailMenu, setSelectedDetailMenu, detailItems, setDetailItems, menuShortageById, setMenuShortageById, tableMealShortageById, setTableMealShortageById, detailError, setDetailError, isDetailLoading, setIsDetailLoading, recipeMenuState, setRecipeMenuState, recipeViewRequest, setRecipeViewRequest, recipeViewMode, setRecipeViewMode, recipeRegisterRequest, setRecipeRegisterRequest, aiMatchMessage, setAiMatchMessage, aiMatchedMenuIdsByText, setAiMatchedMenuIdsByText, isAiMatching, setIsAiMatching, autoWeekValue, setAutoWeekValue, autoGeneratedResult, setAutoGeneratedResult, autoGenerateMessage, setAutoGenerateMessage, isTableSaving, setIsTableSaving, tableSaveMessage, setTableSaveMessage, plannedServings, setPlannedServings, draftSessionAccount, setDraftSessionAccount, restoredSettings, savedStockCheck, setSavedStockCheck, persistPlan, saveAndOrder, saveCurrentAndOrder, createDraftCriteria, preparePlan, isManualEditorOpen, setIsManualEditorOpen, mealEditorSource, setMealEditorSource, manualDays, setManualDays, manualEveningSnackItems, setManualEveningSnackItems, manualTarget, setManualTarget, manualSearchText, setManualSearchText, manualFoodTypeFilter, setManualFoodTypeFilter, manualMenuTypeFilter, setManualMenuTypeFilter, manualMessage, setManualMessage, alert, setAlert, rawParsedResult, parsedPdfResult, updateWeeklyMealSetting, currentMonthWeeks, selectedAutoWeek, displayedMealResult, displayedMenuIds, selectedAccountName, configuredMealSlotRows, selectedTableMonthParts, matchedCount, tableMealDetailDays, manualSelectedDay, filteredManualMenus, closeAlert, handleUploadClick, openTableMealDetail, closeTableMealDetail, tableMealAccountName, printTableMealDetail, handleFileChange, transferPdfToEditor, setPdfOverride, openRegisterModal, handleRegisteredMenu, getExtractedMenuTexts, handleAiMatch, refreshTableMeals, openManualEditor, closeManualEditor, openAutoEditor, getManualMealItems, addManualMenu, removeManualMenu, clearManualMeal, fillManualWithAutoRecommendation, saveManualTableMeals, handleAutoGenerate, handleSaveAutoTableMeals, getAiMatchedMenu, getMenuShortageClass, getTableMealShortageClass, currentDraftPayload, keepDraft, openDraftProcurement, goToSavedFoodOrder, goToFoodOrder, checkCurrentDraftStock, createShortageOrder, buildRecipeRequest }
}
