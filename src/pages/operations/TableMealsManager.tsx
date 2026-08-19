import { Fragment, type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import HeaderBar from '../../components/HeaderBar'
import LoadingScreen from '../../components/LoadingScreen'
import SideMenuLayout from '../../components/SideMenuLayout'
import AppAlert, { type AppAlertState } from '../../components/AppAlert'
import RecipeActionMenu from '../../components/RecipeActionMenu'
import type { RecipeActionMenuState } from '../../components/RecipeActionMenu'
import RecipeRegisterModal from '../../components/RecipeRegisterModal'
import RecipeViewModal, { type RecipeViewMode } from '../../components/RecipeViewModal'
import { createAiRecipeGestureHandlers } from '../../components/aiRecipeGesture'
import {
  getAccountOptions,
  getAccountMenuManagerList,
  getAccountMenuDetailList,
  getMenuManagerList,
  getMealPlanAnalysis,
  getTableMealsDetailList,
  getTableMealsList,
  saveTableMeals,
  type AccountOption,
  type MenuIngredientItem,
  type MenuManagerItem,
  type TableMealsDetailItem,
  type TableMealsItem,
  type TableMealsQueryPeriod,
  type TableMealsSavePayload,
} from '../../api/operations'
import type { RecipeRequest } from '../../api/recipe'
import { requestAiTableMealsMatch } from '../../api/ai'
import { mealCategoryOptions, mealPlanTypeOptions } from './menuManagerShared'
import './TableMealsManager.css'
import { getAverageUsage, getIngredientStockStatus } from '../../utils/ingredientStockStatus'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type MealSlotKey = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dcSnack'

type PdfTextItem = {
  text: string
  normalized: string
  x: number
  y: number
  page: number
}

type WeekdayAnchor = {
  id: string
  label: string
  x: number
  y: number
  page: number
}

type MealAnchor = {
  key: MealSlotKey
  x: number
  y: number
  page: number
}

type RawParsedDay = {
  id: string
  label: string
  date: string
  meals: Record<MealSlotKey, string[]>
}

type RawParsedPdfResult = {
  pageCount: number
  textItemCount: number
  originTexts: string[]
  days: RawParsedDay[]
}

type ExtractedMenuItem = {
  text: string
  matchedMenu: MenuManagerItem | null
}

type ParsedDay = {
  id: string
  label: string
  date: string
  meals: Record<MealSlotKey, ExtractedMenuItem[]>
}

type ParsedPdfResult = {
  pageCount: number
  textItemCount: number
  originTexts: string[]
  days: ParsedDay[]
}

type MonthWeekOption = {
  value: string
  label: string
  dates: Date[]
}

type TableMealsDetailDay = {
  key: string
  date: string
  weekday: string
  meals: Record<MealSlotKey, TableMealsDetailItem[]>
}

type ManualMealRowId = 'breakfast' | 'lunch' | 'snack-afternoon' | 'dc-snack' | 'dinner' | 'snack-evening'

type ManualMealTarget = {
  dayId: string
  rowId: ManualMealRowId
  mealKey: MealSlotKey
}

const MEAL_SLOT_LABELS: Record<MealSlotKey, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
  dcSnack: 'DC',
}

const AUTO_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const
const AUTO_KOREAN_FOOD_TYPE = 1
const AUTO_CHINESE_FOOD_TYPE = 2
const AUTO_JAPANESE_FOOD_TYPE = 3
const AUTO_SNACK_FOOD_TYPE = 6
const AUTO_MAIN_MENU_TYPE = '0'
const AUTO_SIDE_MENU_TYPE = '1'
const RICE_MENU_GUBUN_VALUE = '0'
const SOUP_MENU_GUBUN_VALUE = '1'

const WEEKDAY_ORDER = ['월', '화', '수', '목', '금', '토', '일']
const WEEKDAY_PATTERN = /([월화수목금토일])(?:요일)?/

const DETAIL_MEAL_SLOT_ORDER: Array<{ id: string; key: MealSlotKey; label: string }> = [
  { id: 'breakfast', key: 'breakfast', label: '아침' },
  { id: 'lunch', key: 'lunch', label: '점심' },
  { id: 'snack-afternoon', key: 'snack', label: '간식' },
  { id: 'dc-snack', key: 'dcSnack', label: 'DC' },
  { id: 'dinner', key: 'dinner', label: '저녁' },
  { id: 'snack-evening', key: 'snack', label: '간식' },
]

const MANUAL_MEAL_SLOT_ORDER: Array<{ id: ManualMealRowId; key: MealSlotKey; label: string }> = [
  { id: 'breakfast', key: 'breakfast', label: '아침' },
  { id: 'lunch', key: 'lunch', label: '점심' },
  { id: 'snack-afternoon', key: 'snack', label: '간식' },
  { id: 'dc-snack', key: 'dcSnack', label: 'DC' },
  { id: 'dinner', key: 'dinner', label: '저녁' },
  { id: 'snack-evening', key: 'snack', label: '간식' },
]

const MANUAL_FOOD_TYPE_OPTIONS = [
  { value: '', label: '전체' },
  { value: '1', label: '한식' },
  { value: '2', label: '중식' },
  { value: '3', label: '일식' },
  { value: '4', label: '양식' },
  { value: '5', label: '분식' },
  { value: '6', label: '간식' },
  { value: '7', label: '기타' },
]

const MANUAL_MENU_TYPE_OPTIONS = [
  { value: '', label: '전체' },
  { value: '0', label: '주메뉴' },
  { value: '1', label: '부메뉴' },
  { value: '2', label: '후식/간식' },
  { value: '3', label: '음료' },
  { value: '4', label: '기타' },
]

const HANGYEOL_ORIGIN_LINES = [
  '쌀(죽,미음):국내산,미국산 / 현미:국내산 / 찹쌀:국내산 / 흑미:국내산 / 혼합잡곡:국내산',
  '소고기:호주산,뉴질랜드산,캐나다산 / 돼지고기,돈민찌,돈등뼈:국내산 / 닭고기:국내산,브라질산',
  '동태,코다리:러시아산,국내산 / 고등어:국내산,노르웨이산 / 가자미:러시아산 / 갈치:인도네시아산',
  '참치캔(원양산) / 오징어채:페루산,중국산,외국산 / 배추김치:중국산 / 백김치:중국산',
  '콩(비지),두부,순두부,연두부:외국산,인도산 / 달걀:국내산 / 유제품:국내산',
]

function createEmptyMeals(): Record<MealSlotKey, string[]> {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
    dcSnack: [],
  }
}

function normalizeMenuText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[()[\]{}<>/\\|,.:;"'`~!@#$%^&*+=?_·•ㆍ-]/g, '')
    .toLowerCase()
}

function normalizeWeekdayLabel(value: string) {
  return value.trim().match(WEEKDAY_PATTERN)?.[1] ?? ''
}

function detectMealSlot(value: string): MealSlotKey | null {
  const normalized = normalizeMenuText(value)

  if (normalized === normalizeMenuText('조식') || normalized === normalizeMenuText('아침')) {
    return 'breakfast'
  }

  if (normalized === normalizeMenuText('중식') || normalized === normalizeMenuText('점심')) {
    return 'lunch'
  }

  if (normalized === normalizeMenuText('석식') || normalized === normalizeMenuText('저녁')) {
    return 'dinner'
  }

  if (normalized === normalizeMenuText('간식')) {
    return 'snack'
  }

  if (normalized === 'dcsnack' || normalized === `dc${normalizeMenuText('간식')}` || normalized === 'dc') {
    return 'dcSnack'
  }

  return null
}

function isDateText(value: string) {
  const trimmed = value.trim()
  return /^\d{1,2}[./-]\d{1,2}$/.test(trimmed) || /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(trimmed)
}

function isOriginText(value: string) {
  return /(원산지|국내산|수입산|산지|알레르기|kcal|칼로리)/i.test(value)
}

function isMenuCandidateText(value: string) {
  const trimmed = value.trim()
  const normalized = normalizeMenuText(trimmed)

  if (trimmed.length < 2 || normalized.length < 2) {
    return false
  }

  if (/^\d+$/.test(trimmed) || isDateText(trimmed)) {
    return false
  }

  if (normalizeWeekdayLabel(trimmed) !== '' || detectMealSlot(trimmed) !== null) {
    return false
  }

  if (isOriginText(trimmed)) {
    return false
  }

  if (
    normalized === normalizeMenuText('구분') ||
    normalized === normalizeMenuText('메뉴') ||
    normalized === normalizeMenuText('식단') ||
    normalized === normalizeMenuText('식단표')
  ) {
    return false
  }

  return true
}

function splitMenuText(text: string) {
  return text
    .split(/[\/|]/)
    .map((part) => part.trim())
    .filter((part) => isMenuCandidateText(part))
}

function findMatchedMenu(text: string, menuItems: MenuManagerItem[]) {
  const normalizedText = normalizeMenuText(text)
  if (normalizedText.length < 2) {
    return null
  }

  const exactMatch = menuItems.find((menu) => normalizeMenuText(menu.menu_name) === normalizedText) ?? null
  if (exactMatch) {
    return exactMatch
  }

  return (
    menuItems.find((menu) => {
      const normalizedMenuName = normalizeMenuText(menu.menu_name)
      return normalizedMenuName.length >= 2 && normalizedText.includes(normalizedMenuName)
    }) ?? null
  )
}

function dedupeTexts(values: string[]) {
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

function formatDateLabel(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}.${day}`
}

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function parseMonthValue(value: string) {
  const [yearText, monthText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)

  return {
    year: Number.isFinite(year) ? year : 0,
    month: Number.isFinite(month) ? month : 0,
  }
}

function getCurrentMonthWeekOptions(baseDate = new Date()): MonthWeekOption[] {
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

function getTableMealsQueryPeriod(item: TableMealsItem, fallbackMonth: string): TableMealsQueryPeriod {
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

function normalizeCuisineText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function toDetailMealSlotKey(value: string): MealSlotKey {
  const normalized = value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

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

function buildTableMealsDetailDays(items: TableMealsDetailItem[]): TableMealsDetailDay[] {
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
      meals: {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
        dcSnack: [],
      },
    }

    day.meals[toDetailMealSlotKey(item.meal_slot)].push(item)
    dayMap.set(key, day)
  })

  return Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      meals: {
        breakfast: [...day.meals.breakfast].sort((a, b) => a.sort_order - b.sort_order),
        lunch: [...day.meals.lunch].sort((a, b) => a.sort_order - b.sort_order),
        dinner: [...day.meals.dinner].sort((a, b) => a.sort_order - b.sort_order),
        snack: [...day.meals.snack].sort((a, b) => a.sort_order - b.sort_order),
        dcSnack: [...day.meals.dcSnack].sort((a, b) => a.sort_order - b.sort_order),
      },
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function toCodeNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toFoodTypeCode(mealCategory: string) {
  const normalized = normalizeCuisineText(mealCategory)

  if (normalized.includes('한식')) return 1
  if (normalized.includes('중식')) return 2
  if (normalized.includes('일식')) return 3
  if (normalized.includes('양식')) return 4
  if (normalized.includes('분식')) return 5
  if (normalized.includes('간식')) return 6
  return 7
}

function getMenuFoodTypeCode(menu: MenuManagerItem) {
  return Number.isFinite(menu.food_type) ? menu.food_type ?? 7 : toFoodTypeCode(menu.meal_category)
}

function isJjajangMenu(menu: MenuManagerItem) {
  const normalizedName = normalizeMenuText(menu.menu_name)
  return normalizedName.includes(normalizeMenuText('짜장면')) || normalizedName.includes(normalizeMenuText('자장면'))
}

const AUTO_MEAL_BUDGET_PER_PERSON = 3500

function getAutoMenuCost(menu: MenuManagerItem) {
  return Math.max(menu.menu_cost_per_person ?? 0, 0)
}

function pickRotatingMenu(
  items: MenuManagerItem[],
  usedMenuIds: Set<string>,
  seed: number,
  remainingBudget = Number.POSITIVE_INFINITY,
) {
  if (items.length === 0) {
    return null
  }

  const unusedItems = items.filter((item) => !usedMenuIds.has(item.menu_id))
  const availableItems = unusedItems.length > 0 ? unusedItems : items
  const pricedItems = availableItems.filter((item) => getAutoMenuCost(item) > 0 && getAutoMenuCost(item) <= remainingBudget)
  const unpricedItems = availableItems.filter((item) => getAutoMenuCost(item) === 0)
  const candidates = pricedItems.length > 0 ? pricedItems : unpricedItems
  if (candidates.length === 0) return null
  const picked = candidates[seed % candidates.length]
  usedMenuIds.add(picked.menu_id)
  return picked
}

function addMenuIfPresent(target: MenuManagerItem[], menu: MenuManagerItem | null, usedMenuIds: Set<string>) {
  if (!menu || target.some((item) => item.menu_id === menu.menu_id)) {
    return
  }

  target.push(menu)
  usedMenuIds.add(menu.menu_id)
}

function pickAutoMealMenus(
  accountMenus: MenuManagerItem[],
  foodType: number,
  usedMenuIds: Set<string>,
  seed: number,
  preferredMainMenu: MenuManagerItem | null = null,
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
    Math.max(AUTO_MEAL_BUDGET_PER_PERSON - mealMenus.reduce((sum, menu) => sum + getAutoMenuCost(menu), 0), 0)
  const affordablePreferredMain =
    preferredMainMenu && getAutoMenuCost(preferredMainMenu) <= remainingBudget() ? preferredMainMenu : null

  addMenuIfPresent(
    mealMenus,
    affordablePreferredMain ??
      pickRotatingMenu(primaryMainMenus.length > 0 ? primaryMainMenus : mainMenus, usedMenuIds, seed, remainingBudget()),
    usedMenuIds,
  )

  if (foodType === AUTO_KOREAN_FOOD_TYPE) {
    addMenuIfPresent(mealMenus, pickRotatingMenu(riceMenus, usedMenuIds, seed + 10, remainingBudget()), usedMenuIds)
  }

  addMenuIfPresent(mealMenus, pickRotatingMenu(soupMenus, usedMenuIds, seed + 1, remainingBudget()), usedMenuIds)

  Array.from({ length: 2 }).forEach((_, sideIndex) => {
    addMenuIfPresent(
      mealMenus,
      pickRotatingMenu(normalSideMenus, usedMenuIds, seed + sideIndex + 2, remainingBudget()),
      usedMenuIds,
    )
  })

  return mealMenus
}

function buildAutoTableMealsResult(accountMenus: MenuManagerItem[], week: MonthWeekOption): ParsedPdfResult {
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

function createManualTableMealsDays(week: MonthWeekOption): ParsedDay[] {
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

function buildTableMealsResultFromDays(days: ParsedDay[]): ParsedPdfResult {
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

function hasIngredientShortage(items: MenuIngredientItem[]) {
  return items.some((item) => getIngredientStockStatus(item).needsOrder)
}

function mergeManualEveningSnacks(days: ParsedDay[], eveningSnacks: Record<string, ExtractedMenuItem[]>) {
  return days.map((day) => ({
    ...day,
    meals: {
      ...day.meals,
      snack: [...day.meals.snack, ...(eveningSnacks[day.id] ?? [])],
    },
  }))
}

function hasSameTableMeals(tableMeals: TableMealsItem[], payload: TableMealsSavePayload) {
  const expectedWeekText = `${payload.table_year}년 ${payload.table_month}월 ${payload.table_week}주차`

  return tableMeals.some((item) => {
    if (item.account_id && item.account_id !== payload.account_id) {
      return false
    }

    const hasTableParts =
      Number.isFinite(item.table_year) && Number.isFinite(item.table_month) && Number.isFinite(item.table_week)

    if (hasTableParts) {
      return item.table_year === payload.table_year && item.table_month === payload.table_month && item.table_week === payload.table_week
    }

    return item.table_name.includes(expectedWeekText)
  })
}

function hasSameTableMealsWeek(tableMeals: TableMealsItem[], accountId: string, week: MonthWeekOption) {
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

function buildTableMealsSavePayload(
  result: ParsedPdfResult,
  week: MonthWeekOption,
  accountId: string,
  accountName: string,
  source: TableMealsSavePayload['source'] = 'auto',
  mealPlanType = 0,
): TableMealsSavePayload {
  const firstDate = week.dates[0] ?? new Date()
  const meals = result.days.flatMap((day) =>
    Object.entries(day.meals)
      .map(([mealSlot, mealItems]) => {
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

function buildParsedPdfResult(raw: RawParsedPdfResult, menuItems: MenuManagerItem[]): ParsedPdfResult {
  return {
    pageCount: raw.pageCount,
    textItemCount: raw.textItemCount,
    originTexts: raw.originTexts,
    days: raw.days.map((day) => ({
      ...day,
      meals: {
        breakfast: day.meals.breakfast.map((text) => ({ text, matchedMenu: findMatchedMenu(text, menuItems) })),
        lunch: day.meals.lunch.map((text) => ({ text, matchedMenu: findMatchedMenu(text, menuItems) })),
        dinner: day.meals.dinner.map((text) => ({ text, matchedMenu: findMatchedMenu(text, menuItems) })),
        snack: day.meals.snack.map((text) => ({ text, matchedMenu: findMatchedMenu(text, menuItems) })),
        dcSnack: day.meals.dcSnack.map((text) => ({ text, matchedMenu: findMatchedMenu(text, menuItems) })),
      },
    })),
  }
}

function ensureWeekdayAnchors(items: PdfTextItem[]) {
  const weekdayItems = items
    .filter((item) => normalizeWeekdayLabel(item.text) !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)

  const pages = Array.from(new Set(weekdayItems.map((item) => item.page)))
  const anchors: WeekdayAnchor[] = []

  pages.forEach((page) => {
    const pageWeekdays = weekdayItems.filter((item) => item.page === page)
    if (pageWeekdays.length === 0) {
      return
    }

    const topY = Math.max(...pageWeekdays.map((item) => item.y))
    const headerWeekdays = pageWeekdays
      .filter((item) => topY - item.y <= 40)
      .sort((a, b) => a.x - b.x)

    const clustered = headerWeekdays.filter((item, index, source) => {
      const prev = source[index - 1]
      return !prev || Math.abs(prev.x - item.x) > 22
    })

    const uniqueByLabel = clustered.filter((item, index, source) => {
      const firstIndex = source.findIndex((candidate) => normalizeWeekdayLabel(candidate.text) === normalizeWeekdayLabel(item.text))
      return firstIndex === index
    })

    uniqueByLabel.forEach((item, index) => {
      anchors.push({
        id: `weekday-${page}-${index}-${normalizeWeekdayLabel(item.text)}`,
        label: normalizeWeekdayLabel(item.text),
        x: item.x,
        y: item.y,
        page,
      })
    })
  })

  return anchors.sort((a, b) => a.page - b.page || a.x - b.x)
}

function ensureMealAnchors(items: PdfTextItem[]) {
  const anchors: MealAnchor[] = []

  const pages = Array.from(new Set(items.map((item) => item.page)))
  pages.forEach((page) => {
    const pageMealItems = items
      .map((item) => {
        const key = detectMealSlot(item.text)
        return key ? { key, x: item.x, y: item.y, page: item.page } : null
      })
      .filter((item): item is MealAnchor => item !== null && item.page === page)
      .sort((a, b) => a.x - b.x || b.y - a.y)

    if (pageMealItems.length === 0) {
      return
    }

    const leftMostX = Math.min(...pageMealItems.map((item) => item.x))
    const labelColumnItems = pageMealItems
      .filter((item) => item.x - leftMostX <= 90)
      .sort((a, b) => b.y - a.y)

    labelColumnItems.forEach((item) => {
      const exists = anchors.find(
        (anchor) =>
          anchor.page === item.page &&
          anchor.key === item.key &&
          Math.abs(anchor.y - item.y) < 12,
      )
      if (!exists) {
        anchors.push(item)
      }
    })
  })

  return anchors.sort((a, b) => a.page - b.page || b.y - a.y)
}

function nearestWeekdayAnchor(item: PdfTextItem, anchors: WeekdayAnchor[]) {
  const samePage = anchors.filter((anchor) => anchor.page === item.page)
  if (samePage.length === 0) {
    return null
  }

  return samePage.reduce((closest, current) =>
    Math.abs(current.x - item.x) < Math.abs(closest.x - item.x) ? current : closest,
  )
}

function nearestMealAnchor(item: PdfTextItem, anchors: MealAnchor[]) {
  const samePage = anchors.filter((anchor) => anchor.page === item.page)
  if (samePage.length === 0) {
    return null
  }

  return samePage.reduce((closest, current) =>
    Math.abs(current.y - item.y) < Math.abs(closest.y - item.y) ? current : closest,
  )
}

async function extractPdfStructure(file: File): Promise<RawParsedPdfResult> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const items: PdfTextItem[] = []
  let textItemCount = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()

    textContent.items.forEach((entry) => {
      if (!('str' in entry)) {
        return
      }

      const text = entry.str.trim()
      if (text === '') {
        return
      }

      textItemCount += 1
      items.push({
        text,
        normalized: normalizeMenuText(text),
        x: Array.isArray(entry.transform) ? Number(entry.transform[4] ?? 0) : 0,
        y: Array.isArray(entry.transform) ? Number(entry.transform[5] ?? 0) : 0,
        page: pageNumber,
      })
    })
  }

  const weekdayAnchors = ensureWeekdayAnchors(items)
  const mealAnchors = ensureMealAnchors(items)
  const originTexts = dedupeTexts(items.filter((item) => isOriginText(item.text)).map((item) => item.text))
  const dayMap = new Map<string, RawParsedDay>()

  weekdayAnchors.forEach((anchor) => {
    const dateText =
      items.find(
        (item) =>
          item.page === anchor.page &&
          isDateText(item.text) &&
          Math.abs(item.x - anchor.x) < 28 &&
          Math.abs(item.y - anchor.y) < 80,
      )?.text ?? ''

    dayMap.set(anchor.id, {
      id: anchor.id,
      label: anchor.label,
      date: dateText,
      meals: createEmptyMeals(),
    })
  })

  items
    .filter((item) => {
      if (splitMenuText(item.text).length > 0) {
        return true
      }

      return isMenuCandidateText(item.text)
    })
    .forEach((item) => {
      const weekdayAnchor = nearestWeekdayAnchor(item, weekdayAnchors)
      const mealAnchor = nearestMealAnchor(item, mealAnchors)
      if (!weekdayAnchor || !mealAnchor) {
        return
      }

      const dayEntry = dayMap.get(weekdayAnchor.id)
      if (!dayEntry) {
        return
      }

      const parts = splitMenuText(item.text)
      const candidates = parts.length > 0 ? parts : [item.text]

      candidates.forEach((candidate) => {
        const normalizedCandidate = normalizeMenuText(candidate)
        if (!isMenuCandidateText(candidate)) {
          return
        }

        const mealList = dayEntry.meals[mealAnchor.key]
        if (!mealList.some((value) => normalizeMenuText(value) === normalizedCandidate)) {
          mealList.push(candidate)
        }
      })
    })

  const days = Array.from(dayMap.values())
    .sort((a, b) => WEEKDAY_ORDER.indexOf(a.label) - WEEKDAY_ORDER.indexOf(b.label))
    .map((day) => ({
      ...day,
      meals: {
        breakfast: dedupeTexts(day.meals.breakfast),
        lunch: dedupeTexts(day.meals.lunch),
        dinner: dedupeTexts(day.meals.dinner),
        snack: dedupeTexts(day.meals.snack),
        dcSnack: dedupeTexts(day.meals.dcSnack),
      },
    }))

  return {
    pageCount: pdf.numPages,
    textItemCount,
    originTexts,
    days,
  }
}

function TableMealsManager() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountId = searchParams.get('type') === 'vendor' ? searchParams.get('account_id') ?? searchParams.get('id') ?? '' : ''
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId)
  const [selectedTableMonth, setSelectedTableMonth] = useState(() => formatMonthValue(new Date()))
  const [selectedMealPlanType, setSelectedMealPlanType] = useState(0)
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [accountError, setAccountError] = useState('')
  const [tableMeals, setTableMeals] = useState<TableMealsItem[]>([])
  const [menuItems, setMenuItems] = useState<MenuManagerItem[]>([])
  const [accountMenuItems, setAccountMenuItems] = useState<MenuManagerItem[]>([])
  const [menuError, setMenuError] = useState('')
  const [accountMenuError, setAccountMenuError] = useState('')
  const [tableError, setTableError] = useState('')
  const [isTableLoading, setIsTableLoading] = useState(false)
  const [isAccountMenuLoading, setIsAccountMenuLoading] = useState(false)
  const [isPdfParsing, setIsPdfParsing] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('업로드한 PDF가 없습니다.')
  const [rawParsedResult, setRawParsedResult] = useState<RawParsedPdfResult | null>(null)
  const [registerTargetText, setRegisterTargetText] = useState<string | null>(null)
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
  const [draftMenuName, setDraftMenuName] = useState('')
  const [draftMealCategory, setDraftMealCategory] = useState('한식')
  const [draftMenuType, setDraftMenuType] = useState('조식')
  const [recipeMenuState, setRecipeMenuState] = useState<RecipeActionMenuState | null>(null)
  const [recipeViewRequest, setRecipeViewRequest] = useState<RecipeRequest | null>(null)
  const [recipeViewMode, setRecipeViewMode] = useState<RecipeViewMode>('ai')
  const [recipeRegisterRequest, setRecipeRegisterRequest] = useState<RecipeRequest | null>(null)
  const [aiMatchMessage, setAiMatchMessage] = useState('')
  const [aiMatchedMenuIdsByText, setAiMatchedMenuIdsByText] = useState<Record<string, string>>({})
  const [isAiMatching, setIsAiMatching] = useState(false)
  const [autoWeekValue, setAutoWeekValue] = useState('0')
  const [autoGeneratedResult, setAutoGeneratedResult] = useState<ParsedPdfResult | null>(null)
  const [autoGenerateMessage, setAutoGenerateMessage] = useState('')
  const [isTableSaving, setIsTableSaving] = useState(false)
  const [tableSaveMessage, setTableSaveMessage] = useState('')
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
        const items = await getAccountMenuManagerList(selectedAccountId)
        if (!isMounted) {
          return
        }

        setAccountMenuItems(items)
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

  const parsedPdfResult = useMemo(
    () => (rawParsedResult ? buildParsedPdfResult(rawParsedResult, menuItems) : null),
    [rawParsedResult, menuItems],
  )

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

  const printTableMealDetail = () => {
    window.print()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setUploadedFileName(file.name)
    setPdfError('')
    setRawParsedResult(null)
    setAutoGeneratedResult(null)
    setAutoGenerateMessage('')
    setTableSaveMessage('')
    setRegisterTargetText(null)
    setAiMatchedMenuIdsByText({})
    setAiMatchMessage('')

    try {
      setIsPdfParsing(true)
      const result = await extractPdfStructure(file)
      setRawParsedResult(result)
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'PDF를 분석하지 못했습니다.')
    } finally {
      setIsPdfParsing(false)
      event.target.value = ''
    }
  }

  const openRegisterModal = (menuText: string) => {
    setRegisterTargetText(menuText)
    setDraftMenuName(menuText)
    setDraftMealCategory('한식')
    setDraftMenuType('조식')
  }

  const closeRegisterModal = () => {
    setRegisterTargetText(null)
    setDraftMenuName('')
  }

  const handleQuickRegister = () => {
    const trimmedName = draftMenuName.trim()
    if (trimmedName === '') {
      return
    }

    const newItem: MenuManagerItem = {
      menu_id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `quick-${crypto.randomUUID()}`
          : `quick-${Date.now()}`,
      menu_name: trimmedName,
      meal_category: draftMealCategory,
      menu_type: draftMenuType,
      menu_gubun: '',
      account_id: selectedAccountId,
      account_name: selectedAccountName,
      created_at: new Date().toISOString().slice(0, 10),
      meal_plan_type: selectedMealPlanType,
      calories_per_serving: 0,
    }

    setMenuItems((current) => [newItem, ...current])
    closeRegisterModal()
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
        menu_candidates: menuItems.map((menu) => ({
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
          ? `AI 메뉴 매칭 ${result.matches.length}건을 반영했습니다.`
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
      setManualDays(createManualTableMealsDays(selectedAutoWeek))
      setManualEveningSnackItems({})
      setManualTarget({
        dayId: `manual-${formatDateValue(selectedAutoWeek.dates[0] ?? new Date())}`,
        rowId: 'breakfast',
        mealKey: 'breakfast',
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
            rowId: 'breakfast',
            mealKey: 'breakfast',
          }
        : null,
    )
    setManualMessage('')
    setIsManualEditorOpen(true)
  }

  const getManualMealItems = (day: ParsedDay, mealSlot: { id: ManualMealRowId; key: MealSlotKey }) =>
    mealSlot.id === 'snack-evening' ? manualEveningSnackItems[day.id] ?? [] : day.meals[mealSlot.key]

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

    const recommendedResult = buildAutoTableMealsResult(
      accountMenuItems.filter((menu) => (menu.meal_plan_type ?? 0) === selectedMealPlanType),
      selectedAutoWeek,
    )
    setManualDays(recommendedResult.days)
    setManualEveningSnackItems({})
    setManualTarget(
      recommendedResult.days[0]
        ? {
            dayId: recommendedResult.days[0].id,
            rowId: 'breakfast',
            mealKey: 'breakfast',
          }
        : null,
    )
    setManualMessage('자동 추천 식단을 채웠습니다. 필요한 칸만 수정해서 저장하세요.')
  }

  const saveManualTableMeals = async () => {
    if (!selectedAutoWeek) {
      setManualMessage('저장할 주차를 선택해주세요.')
      return
    }

    const result = buildTableMealsResultFromDays(mergeManualEveningSnacks(manualDays, manualEveningSnackItems))
    const payload = buildTableMealsSavePayload(
      result,
      selectedAutoWeek,
      selectedAccountId,
      selectedAccountName,
      mealEditorSource,
      selectedMealPlanType,
    )

    if (payload.table_meals.length === 0) {
      setManualMessage('저장할 메뉴가 없습니다.')
      return
    }

    if (await offerGeneratedShortageOrder(result, payload.account_id)) return

    const latestTableMeals = await refreshTableMeals()
    if (hasSameTableMeals(latestTableMeals, payload)) {
      setManualMessage('이미 존재하는 식단표입니다.')
      return
    }

    try {
      setIsTableSaving(true)
      setManualMessage('')
      await saveTableMeals(payload)
      if (mealEditorSource === 'auto') {
        setAutoGeneratedResult(result)
      }
      setTableSaveMessage(`${payload.table_name} 저장이 완료되었습니다.`)
      setIsManualEditorOpen(false)
      await refreshTableMeals()
    } catch (error) {
      setManualMessage(error instanceof Error ? error.message : '수기 식단표 저장에 실패했습니다.')
    } finally {
      setIsTableSaving(false)
    }
  }

  const handleAutoGenerate = async () => {
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

    try {
      setIsAccountMenuLoading(true)
      setAccountMenuError('')
      setAutoGenerateMessage('')
      selectedAccountMenus = await getAccountMenuManagerList(accountId)
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

    const result = buildAutoTableMealsResult(
      selectedAccountMenus.filter((menu) => (menu.meal_plan_type ?? 0) === selectedMealPlanType),
      selectedAutoWeek,
    )
    const generatedMenuCount = result.days.reduce(
      (sum, day) => sum + day.meals.lunch.length + day.meals.snack.length,
      0,
    )

    setRawParsedResult(null)
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
            rowId: 'breakfast',
            mealKey: 'breakfast',
          }
        : null,
    )
    setTableSaveMessage('')
    setAutoGenerateMessage(
      generatedMenuCount > 0
        ? `${selectedAutoWeek.label} 자동 식단표를 만들었습니다. 아침/점심/저녁은 주메뉴 1개, 탕/찌개/국 1개, 부메뉴 2개 기준이며 점심 간식도 포함합니다.`
        : '조건에 맞는 거래처 메뉴가 없어 자동 식단표를 만들지 못했습니다.',
    )
    if (generatedMenuCount > 0) {
      setManualMessage('자동 생성된 식단입니다. 필요한 메뉴를 추가하거나 삭제한 뒤 저장하세요.')
      setIsManualEditorOpen(true)
      await offerGeneratedShortageOrder(result, selectedAccountId)
    }
  }

  const handleSaveAutoTableMeals = async () => {
    if (!autoGeneratedResult || !selectedAutoWeek) {
      setTableSaveMessage('저장할 자동 식단표가 없습니다.')
      return
    }

    const payload = buildTableMealsSavePayload(
      autoGeneratedResult,
      selectedAutoWeek,
      selectedAccountId,
      selectedAccountName,
      'auto',
      selectedMealPlanType,
    )

    if (payload.table_meals.length === 0) {
      setTableSaveMessage('저장할 메뉴가 없습니다.')
      return
    }

    if (await offerGeneratedShortageOrder(autoGeneratedResult, payload.account_id)) return

    const latestTableMeals = await refreshTableMeals()
    if (hasSameTableMeals(latestTableMeals, payload)) {
      setTableSaveMessage('이미 존재하는 식단표입니다.')
      return
    }

    try {
      setIsTableSaving(true)
      setTableSaveMessage('')
      await saveTableMeals(payload)
      setTableSaveMessage(`${payload.table_name} 저장이 완료되었습니다.`)

      if (selectedAccountId !== '') {
        setIsTableLoading(true)
        try {
          const items = await getTableMealsList(selectedAccountId, selectedTableMonthParts.year, selectedTableMonthParts.month)
          setTableMeals(items)
          setTableError('')
        } catch (error) {
          setTableError(error instanceof Error ? error.message : '식단표 목록을 다시 불러오지 못했습니다.')
        } finally {
          setIsTableLoading(false)
        }
      }
    } catch (error) {
      setTableSaveMessage(error instanceof Error ? error.message : '식단표 저장에 실패했습니다.')
    } finally {
      setIsTableSaving(false)
    }
  }

  const offerGeneratedShortageOrder = async (result: ParsedPdfResult, accountId: string): Promise<boolean> => {
    const menuCounts = new Map<string, { menu: MenuManagerItem; count: number }>()
    result.days.forEach((day) => {
      Object.values(day.meals).flat().forEach((item) => {
        const menu = item.matchedMenu
        if (!menu?.menu_id) return
        const current = menuCounts.get(menu.menu_id)
        menuCounts.set(menu.menu_id, { menu, count: (current?.count ?? 0) + 1 })
      })
    })

    try {
      const menuDetails = await Promise.all(
        Array.from(menuCounts.values()).map(async ({ menu, count }) => ({
          menu,
          count,
          ingredients: await getAccountMenuDetailList(menu.menu_id, accountId),
        })),
      )
      const totals = new Map<string, {
        menu_id: string
        menu_names: string[]
        ingredient_name: string
        required_qty: number
        current_qty: number
        base_unit: string
      }>()

      menuDetails.forEach(({ menu, count, ingredients }) => {
        ingredients.forEach((ingredient) => {
          const current = totals.get(ingredient.ingredient_id)
          totals.set(ingredient.ingredient_id, {
            menu_id: current?.menu_id ?? menu.menu_id,
            menu_names: current
              ? Array.from(new Set([...current.menu_names, menu.menu_name]))
              : [menu.menu_name],
            ingredient_name: ingredient.ingredient_name || ingredient.ingredient_name_raw || ingredient.ingredient_id,
            required_qty: (current?.required_qty ?? 0) + ingredient.required_qty * count,
            current_qty: current?.current_qty ?? ingredient.current_qty,
            base_unit: ingredient.base_unit,
          })
        })
      })

      const shortages = Array.from(totals.values())
        .map((item) => ({ ...item, shortage_qty: Math.max(item.required_qty - item.current_qty, 0) }))
        .filter((item) => item.shortage_qty > 0)
        .sort((a, b) => b.shortage_qty - a.shortage_qty)
      if (shortages.length === 0) return false

      const lines = shortages.slice(0, 8).map(
        (item) => `${item.menu_names.join(', ')} - ${item.ingredient_name}: 부족 ${Number(item.shortage_qty.toFixed(3))}${item.base_unit}`,
      )
      if (shortages.length > 8) lines.push(`외 ${shortages.length - 8}건`)
      const shouldOrder = window.confirm(`이 식단은 현재고가 부족하여 저장할 수 없습니다.\n\n${lines.join('\n')}\n\n발주하러 가시겠습니까?`)

      if (shouldOrder) {
        const first = shortages[0]
        const params = new URLSearchParams({ account_id: accountId })
        navigate(`/order_manager/food_order/${encodeURIComponent(first.menu_id)}?${params.toString()}`)
      }
      return true
    } catch (error) {
      setAlert({
        type: 'error',
        title: '자동완성 재고 확인 실패',
        message: error instanceof Error ? error.message : '자동완성 메뉴의 재고를 확인하지 못했습니다.',
      })
      return true
    }
  }

  const getAiMatchedMenu = (text: string) => {
    const matchedMenuId = aiMatchedMenuIdsByText[normalizeMenuText(text)]
    return matchedMenuId ? menuItems.find((menu) => menu.menu_id === matchedMenuId) ?? null : null
  }

  const getMenuShortageClass = (menu: Pick<MenuManagerItem, 'menu_id'> | null | undefined) =>
    menu?.menu_id && menuShortageById[menu.menu_id] ? ' is-shortage' : ''

  const getTableMealShortageClass = (menu: Pick<TableMealsDetailItem, 'menu_id'>) =>
    menu.menu_id && tableMealShortageById[menu.menu_id] ? ' is-shortage' : ''

  const goToFoodOrder = (menuId: string) => {
    navigate(`/order_manager/food_order/${encodeURIComponent(menuId)}`)
  }

  const createShortageOrder = (menuId: string) => {
    const searchParams = new URLSearchParams()
    if (selectedAccountId) searchParams.set('account_id', selectedAccountId)
    if (selectedTableMeal?.table_id) searchParams.set('table_id', selectedTableMeal.table_id)

    const query = searchParams.toString()
    navigate(`/order_manager/food_order/${encodeURIComponent(menuId)}${query ? `?${query}` : ''}`)
  }

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

  return (
    <div className="table-meals-page">
      <main className="table-meals-content">
        <SideMenuLayout
          header={
            <HeaderBar
              title="식단표 관리"
              breadcrumbs={[
                { label: 'Home', to: '/home' },
                { label: '운영 관리', to: '/operations/table-meals' },
                { label: '식단표 관리' },
              ]}
            />
          }
        >
          <section className="table-meals-toolbar">
            <div className="table-meals-field">
              <label htmlFor="table-account-id">거래처</label>
              <select
                id="table-account-id"
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
              >
                <option value="">선택하세요</option>
                {accountOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.text}
                  </option>
                ))}
              </select>
            </div>

            <div className="table-meals-field">
              <label htmlFor="table-meal-plan-type">식단 유형</label>
              <select
                id="table-meal-plan-type"
                value={selectedMealPlanType}
                onChange={(event) => setSelectedMealPlanType(Number(event.target.value))}
              >
                {mealPlanTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.text}</option>
                ))}
              </select>
            </div>

            <div className="table-meals-field table-meals-field--month">
              <label htmlFor="table-month">조회월</label>
              <input
                id="table-month"
                type="month"
                value={selectedTableMonth}
                onChange={(event) => setSelectedTableMonth(event.target.value)}
              />
            </div>

            <button type="button" className="table-meals-upload-button" onClick={handleUploadClick}>
              식단표 등록
            </button>
            <div className="table-meals-field table-meals-field--week">
              <label htmlFor="table-auto-week">주차</label>
              <select id="table-auto-week" value={autoWeekValue} onChange={(event) => setAutoWeekValue(event.target.value)}>
                {currentMonthWeeks.map((week) => (
                  <option key={week.value} value={week.value}>
                    {week.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="table-meals-upload-button"
              onClick={() => void handleAiMatch()}
              disabled={!rawParsedResult || isAiMatching}
            >
              {isAiMatching ? 'AI 매칭 중' : 'AI 매칭'}
            </button>
            <button
              type="button"
              className="table-meals-upload-button"
              onClick={() => void handleAutoGenerate()}
              disabled={selectedAccountId === '' || isAccountMenuLoading}
            >
              {isAccountMenuLoading ? '메뉴 불러오는 중' : '자동 식단표 제작'}
            </button>
            
            <button
              type="button"
              className="table-meals-upload-button"
              onClick={() => void openManualEditor()}
              disabled={selectedAccountId === '' || isAccountMenuLoading}
            >
              {isAccountMenuLoading ? '메뉴 불러오는 중' : '수기 식단표 제작'}
            </button>

            <button
              type="button"
              className="table-meals-upload-button is-summary"
              onClick={openAutoEditor}
              disabled={!autoGeneratedResult || isTableSaving}
            >
              자동 식단표 수정
            </button>

            <button
              type="button"
              className="table-meals-upload-button is-summary"
              onClick={() => void handleSaveAutoTableMeals()}
              disabled={!autoGeneratedResult || isTableSaving}
            >
              {isTableSaving ? '저장 중' : '자동 식단표 저장'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="table-meals-hidden-input"
              onChange={handleFileChange}
            />
          </section>

          <section className="table-meals-layout">
            <section className="table-meals-panel">
              <div className="table-meals-panel__header">
                <div>
                  <h2>식단표 조회</h2>
                  <span>{selectedAccountName || '거래처를 선택하세요.'}</span>
                </div>
              </div>

              <div className="table-meals-table-scroll">
                {isTableLoading ? <LoadingScreen compact message="식단표를 불러오는 중입니다." /> : null}
                {!isTableLoading && tableError ? <div className="table-meals-empty">{tableError}</div> : null}

                {!isTableLoading && !tableError && tableMeals.length > 0 ? (
                  <table className="table-meals-table">
                    <thead>
                      <tr>
                        <th>식단표명</th>
                        <th>거래처</th>
                        <th>파일명</th>
                        <th>등록일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableMeals.map((item) => (
                        <tr
                          key={item.table_id}
                          className="table-meals-clickable-row"
                          tabIndex={0}
                          onClick={() => openTableMealDetail(item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openTableMealDetail(item)
                            }
                          }}
                        >
                          <td>{item.table_name}</td>
                          <td>{item.account_name || item.account_id || '-'}</td>
                          <td>{item.file_name || '-'}</td>
                          <td>{item.created_at || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}

                {!isTableLoading && !tableError && selectedAccountId !== '' && tableMeals.length === 0 ? (
                  <div className="table-meals-empty">선택한 거래처의 식단표가 없습니다.</div>
                ) : null}

                {selectedAccountId === '' ? (
                  <div className="table-meals-empty">거래처를 선택하면 `/Table/TableMealsList` 결과를 조회합니다.</div>
                ) : null}
              </div>
            </section>

            <section className="table-meals-panel">
              <div className="table-meals-panel__header">
                <div>
                  <h2>PDF 분석 결과</h2>
                  <span>{uploadedFileName}</span>
                </div>
              </div>

              <div className="table-meals-analysis">
                {menuError ? <div className="table-meals-empty">{menuError}</div> : null}
                {isPdfParsing ? <LoadingScreen compact message="PDF에서 식단표를 분석하는 중입니다." /> : null}
                {!isPdfParsing && pdfError ? <div className="table-meals-empty">{pdfError}</div> : null}

                {!isPdfParsing && !pdfError && displayedMealResult ? (
                  <>
                    <section className="table-meals-summary-card">
                      <strong>분석 요약</strong>
                      <p>
                        {autoGeneratedResult ? selectedAutoWeek?.label ?? '자동 식단표' : `PDF ${displayedMealResult.pageCount}페이지`}에서
                        텍스트 {displayedMealResult.textItemCount}건을 읽었고,
                        메뉴 매핑 {matchedCount}건을 확인했습니다.
                      </p>
                      <p>요일별 식단표 구조를 유지하면서 `/`로 연결된 메뉴는 각각 분리해 매핑합니다.</p>
                    </section>

                    {displayedMealResult.originTexts.length > 0 ? (
                      <section className="table-meals-origin-card">
                        <strong>원산지 요약</strong>
                        <ul>
                          {displayedMealResult.originTexts.map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    <div className="table-meals-week-grid">
                      {displayedMealResult.days.map((day) => (
                        <article key={day.id} className="table-meals-day-card">
                          <header>
                            <strong>{day.label}</strong>
                            <span>{day.date || '-'}</span>
                          </header>
                          <dl>
                            {Object.entries(MEAL_SLOT_LABELS).map(([mealKey, mealLabel]) => {
                              const mealItems = day.meals[mealKey as MealSlotKey]
                              if (mealItems.length === 0) {
                                return null
                              }

                              return (
                                <div key={mealKey}>
                                  <dt>{mealLabel}</dt>
                                  <dd className="table-meals-day-card__menus">
                                    {mealItems.map((item) => {
                                      const matchedMenu = item.matchedMenu ?? getAiMatchedMenu(item.text)

                                      return matchedMenu ? (
                                        <button
                                          key={`${mealKey}-${item.text}`}
                                          type="button"
                                          className={`table-meals-menu-text is-matched${getMenuShortageClass(matchedMenu)}`}
                                          title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                          {...createAiRecipeGestureHandlers(
                                            buildRecipeRequest(item.text, matchedMenu),
                                            setRecipeMenuState,
                                            menuShortageById[matchedMenu.menu_id] ? { orderMenuId: matchedMenu.menu_id } : undefined,
                                          )}
                                          onClick={() => setSelectedDetailMenu(matchedMenu)}
                                        >
                                          {item.text}
                                        </button>
                                      ) : (
                                        <button
                                          key={`${mealKey}-${item.text}`}
                                          type="button"
                                          className="table-meals-menu-text is-unmatched"
                                          title="우클릭 또는 길게 터치하면 AI 레시피를 볼 수 있습니다."
                                          {...createAiRecipeGestureHandlers(buildRecipeRequest(item.text), setRecipeMenuState)}
                                          onClick={() => openRegisterModal(item.text)}
                                        >
                                          {item.text}
                                        </button>
                                      )
                                    })}
                                  </dd>
                                </div>
                              )
                            })}
                          </dl>
                        </article>
                      ))}
                    </div>

                  </>
                ) : null}

                {!isPdfParsing && !pdfError && !displayedMealResult ? (
                  <section className="table-meals-summary-card">
                    <strong>PDF 분석 대기</strong>
                    <p>식단표 PDF를 업로드하면 요일별 식단표 모양으로 결과를 보여줍니다.</p>
                    <p>빨간 메뉴를 누르면 빠르게 메뉴를 등록할 수 있습니다.</p>
                  </section>
                ) : null}
              </div>
            </section>
          </section>
        </SideMenuLayout>
      </main>

      {isManualEditorOpen ? (
        <div className="table-meals-modal-backdrop table-meals-modal-backdrop--manual" role="presentation" onClick={closeManualEditor}>
          <section
            className="table-meals-modal table-meals-modal--manual"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-meals-manual-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="table-meals-modal__header table-meals-manual-header">
              <div>
                <p className="table-meals-modal__eyebrow">
                  {mealEditorSource === 'auto' ? 'Auto Meal Table' : 'Manual Meal Table'}
                </p>
                <h2 id="table-meals-manual-modal-title">
                  {mealEditorSource === 'auto' ? '자동 식단표 수정' : '수기 식단표 제작'}
                </h2>
              </div>
              <span>{selectedAccountName || selectedAccountId} · {selectedAutoWeek?.label ?? '-'}</span>
            </div>

            <div className="table-meals-manual">
              <section className="table-meals-manual__grid" aria-label="수기 식단표 편집 그리드">
                <div className="table-meals-manual__corner" style={{ gridColumn: 1, gridRow: 1 }}>
                  구분
                </div>
                {manualDays.map((day, dayIndex) => (
                  <div key={day.id} className="table-meals-manual__day-head" style={{ gridColumn: dayIndex + 2, gridRow: 1 }}>
                    <strong>{day.label}</strong>
                    <span>{day.date}</span>
                  </div>
                ))}

                {MANUAL_MEAL_SLOT_ORDER.map((mealSlot, mealRowIndex) => (
                  <Fragment key={mealSlot.id}>
                    <div
                      key={`${mealSlot.id}-label`}
                      className={`table-meals-manual__meal-head table-meals-manual__meal-head--${mealSlot.id}`}
                      style={{ gridColumn: 1, gridRow: mealRowIndex + 2 }}
                    >
                      {mealSlot.label}
                    </div>
                    {manualDays.map((day, dayIndex) => {
                      const isSelected = manualTarget?.dayId === day.id && manualTarget.rowId === mealSlot.id
                      const mealItems = getManualMealItems(day, mealSlot)

                      return (
                        <button
                          key={`${day.id}-${mealSlot.id}`}
                          type="button"
                          className={`table-meals-manual__cell table-meals-manual__cell--${mealSlot.id}${
                            isSelected ? ' is-selected' : ''
                          }`}
                          style={{ gridColumn: dayIndex + 2, gridRow: mealRowIndex + 2 }}
                          onClick={() => setManualTarget({ dayId: day.id, rowId: mealSlot.id, mealKey: mealSlot.key })}
                        >
                          {mealItems.length > 0 ? (
                            <ul>
                              {mealItems.map((item, index) => (
                                <li key={`${item.text}-${index}`}>
                                  <span
                                    className={getMenuShortageClass(item.matchedMenu)}
                                    {...(item.matchedMenu
                                      ? createAiRecipeGestureHandlers(
                                          buildRecipeRequest(item.text, item.matchedMenu),
                                          setRecipeMenuState,
                                          menuShortageById[item.matchedMenu.menu_id]
                                            ? { orderMenuId: item.matchedMenu.menu_id }
                                            : undefined,
                                        )
                                      : {})}
                                  >
                                    {item.text}
                                  </span>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="table-meals-manual__remove"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      removeManualMenu(day.id, mealSlot.id, mealSlot.key, index)
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        removeManualMenu(day.id, mealSlot.id, mealSlot.key, index)
                                      }
                                    }}
                                  >
                                    삭제
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="table-meals-manual__empty">메뉴 추가</span>
                          )}
                        </button>
                      )
                    })}
                  </Fragment>
                ))}
              </section>

              <aside className="table-meals-manual__palette">
                <div className="table-meals-manual__target">
                  <strong>
                    {manualSelectedDay
                      ? `${manualSelectedDay.label} ${manualSelectedDay.date} · ${
                          MANUAL_MEAL_SLOT_ORDER.find((slot) => slot.id === manualTarget?.rowId)?.label ?? ''
                        }`
                      : '칸을 선택해주세요'}
                  </strong>
                  <button
                    type="button"
                    className="table-meals-modal__button is-secondary"
                    disabled={!manualTarget}
                    onClick={() => {
                      if (manualTarget) {
                        clearManualMeal(manualTarget.dayId, manualTarget.rowId, manualTarget.mealKey)
                      }
                    }}
                  >
                    칸 비우기
                  </button>
                </div>

                <div className="table-meals-manual__filters">
                  <input
                    value={manualSearchText}
                    placeholder="메뉴 검색"
                    onChange={(event) => setManualSearchText(event.target.value)}
                  />
                  <select value={manualFoodTypeFilter} onChange={(event) => setManualFoodTypeFilter(event.target.value)}>
                    {MANUAL_FOOD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value || 'all-food'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select value={manualMenuTypeFilter} onChange={(event) => setManualMenuTypeFilter(event.target.value)}>
                    {MANUAL_MENU_TYPE_OPTIONS.map((option) => (
                      <option key={option.value || 'all-menu'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="table-meals-manual__menu-list">
                  {filteredManualMenus.length > 0 ? (
                    filteredManualMenus.map((menu) => (
                      <button
                        key={menu.menu_id}
                        type="button"
                        className="table-meals-manual__menu"
                        disabled={!manualTarget}
                        onClick={() => addManualMenu(menu)}
                      >
                        <strong>{menu.menu_name}</strong>
                        <span>
                          {MANUAL_FOOD_TYPE_OPTIONS.find((option) => option.value === String(getMenuFoodTypeCode(menu)))?.label ?? '기타'} ·{' '}
                          {MANUAL_MENU_TYPE_OPTIONS.find((option) => option.value === menu.menu_type)?.label ?? '기타'} · {menu.menu_gubun || '-'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="table-meals-empty">조건에 맞는 거래처 메뉴가 없습니다.</div>
                  )}
                </div>
              </aside>
            </div>

            <div className="table-meals-modal__actions table-meals-manual__actions">
              <button type="button" className="table-meals-modal__button is-secondary" onClick={fillManualWithAutoRecommendation}>
                자동 추천 채우기
              </button>
              <button type="button" className="table-meals-modal__button is-secondary" onClick={closeManualEditor}>
                닫기
              </button>
              <button
                type="button"
                className="table-meals-modal__button is-primary is-summary"
                disabled={isTableSaving}
                onClick={() => void saveManualTableMeals()}
              >
                {isTableSaving ? '저장 중' : mealEditorSource === 'auto' ? '수정한 자동 식단표 저장' : '수기 식단표 저장'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedTableMeal ? (
        <div
          className="table-meals-modal-backdrop table-meals-modal-backdrop--sheet"
          role="presentation"
          onClick={closeTableMealDetail}
        >
          <section
            className="table-meals-modal table-meals-modal--sheet table-meals-print-area"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-meals-sheet-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="table-meals-modal__header no-print">
              <div>
                <p className="table-meals-modal__eyebrow">Meal Table</p>
                <h2 id="table-meals-sheet-modal-title">식단표 상세</h2>
              </div>
              <span>{selectedTableMeal.account_name || selectedTableMeal.account_id || '-'}</span>
            </div>

            <div className="table-meals-sheet">
              {isTableMealDetailLoading ? <LoadingScreen compact message="식단표 상세를 불러오는 중입니다." /> : null}
              {!isTableMealDetailLoading && tableMealDetailError ? (
                <div className="table-meals-empty">{tableMealDetailError}</div>
              ) : null}

              {!isTableMealDetailLoading && !tableMealDetailError && tableMealDetailDays.length > 0 ? (
                <div className="table-meals-hangyeol">
                  <div className="table-meals-hangyeol__title">
                    <h3>주 간 식 단 표</h3>
                    <p>{selectedTableMeal.table_name || ''}</p>
                  </div>

                  <table className="table-meals-hangyeol__table">
                    <thead>
                      <tr>
                        <th className="table-meals-hangyeol__meal-head" />
                        {tableMealDetailDays.map((day) => (
                          <th key={day.key}>
                            <strong>{day.weekday || '-'}</strong>
                            <span>{day.date || '-'}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DETAIL_MEAL_SLOT_ORDER.map((mealRow) => (
                        <tr key={mealRow.id} className={`table-meals-hangyeol__row table-meals-hangyeol__row--${mealRow.id}`}>
                          <th>{mealRow.label}</th>
                          {tableMealDetailDays.map((day) => {
                            const menus = mealRow.id === 'snack-evening' ? [] : day.meals[mealRow.key]

                            return (
                              <td key={`${day.key}-${mealRow.id}`}>
                                {menus.length > 0 ? (
                                  <ul>
                                    {menus.map((menu) => (
                                      <li
                                        key={`${day.key}-${mealRow.id}-${menu.sort_order}-${menu.menu_id || menu.menu_name}`}
                                        className={getTableMealShortageClass(menu)}
                                        {...(menu.menu_id
                                          ? createAiRecipeGestureHandlers(
                                              buildRecipeRequest(menu.menu_name || '-', menu),
                                              setRecipeMenuState,
                                              tableMealShortageById[menu.menu_id] ? { orderMenuId: menu.menu_id } : undefined,
                                            )
                                          : {})}
                                      >
                                        {menu.menu_name || '-'}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span>-</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="table-meals-hangyeol__notice">* 상기메뉴는 식당 수급사정에 따라 변경될 수 있습니다.</p>
                  <div className="table-meals-hangyeol__origin">
                    <strong>원산지</strong>
                    <div>
                      {HANGYEOL_ORIGIN_LINES.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {!isTableMealDetailLoading && !tableMealDetailError && tableMealDetailDays.length === 0 ? (
                <div className="table-meals-empty">조회된 식단표 상세가 없습니다.</div>
              ) : null}
            </div>

            <div className="table-meals-modal__actions no-print">
              <button type="button" className="table-meals-modal__button is-secondary" onClick={printTableMealDetail}>
                인쇄
              </button>
              <button type="button" className="table-meals-modal__button is-secondary" onClick={closeTableMealDetail}>
                닫기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {registerTargetText ? (
        <div className="table-meals-modal-backdrop" role="presentation" onClick={closeRegisterModal}>
          <section
            className="table-meals-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-meals-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="table-meals-modal__header">
              <div>
                <p className="table-meals-modal__eyebrow">Quick Register</p>
                <h2 id="table-meals-modal-title">메뉴 빠른 등록</h2>
              </div>
              <span>{registerTargetText}</span>
            </div>

            <div className="table-meals-modal__body">
              <label className="table-meals-modal__field">
                <span>메뉴명</span>
                <input value={draftMenuName} onChange={(event) => setDraftMenuName(event.target.value)} />
              </label>
              <label className="table-meals-modal__field">
                <span>식사분류</span>
                <select value={draftMealCategory} onChange={(event) => setDraftMealCategory(event.target.value)}>
                  {mealCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="table-meals-modal__field">
                <span>메뉴타입</span>
                <select value={draftMenuType} onChange={(event) => setDraftMenuType(event.target.value)}>
                  <option value="조식">조식</option>
                  <option value="중식">중식</option>
                  <option value="석식">석식</option>
                </select>
              </label>
            </div>

            <div className="table-meals-modal__actions">
              <button type="button" className="table-meals-modal__button is-secondary" onClick={closeRegisterModal}>
                취소
              </button>
              <button type="button" className="table-meals-modal__button is-primary" onClick={handleQuickRegister}>
                등록
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedDetailMenu ? (
        <div className="table-meals-modal-backdrop" role="presentation" onClick={() => setSelectedDetailMenu(null)}>
          <section
            className="table-meals-modal table-meals-modal--detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-meals-detail-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="table-meals-modal__header">
              <div>
                <p className="table-meals-modal__eyebrow">Menu Ingredients</p>
                <h2 id="table-meals-detail-modal-title">메뉴 식자재 상세</h2>
              </div>
              <span>{selectedDetailMenu.menu_name}</span>
            </div>

            <div className="table-meals-detail-table-scroll">
              {isDetailLoading ? <LoadingScreen compact message="식자재 상세를 불러오는 중입니다." /> : null}
              {!isDetailLoading && detailError ? <div className="table-meals-empty">{detailError}</div> : null}

              {!isDetailLoading && !detailError && detailItems.length > 0 ? (
                <>
                <table className="table-meals-table">
                  <thead>
                    <tr>
                      <th>식자재명</th>
                      <th>필요수량</th>
                      <th>현재고</th>
                      <th>부족재고</th>
                      <th>기본단위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((detail) => (
                      <tr key={`${detail.menu_id}-${detail.ingredient_id}`}>
                        <td title={getIngredientStockStatus(detail).label}>
                          {getIngredientStockStatus(detail).emoji} {detail.ingredient_name || '-'}
                        </td>
                        <td>{detail.required_qty}{detail.base_unit || ''}</td>
                        <td>
                          {detail.current_qty}{detail.base_unit || ''}
                          {getAverageUsage(detail) > 0 ? ` (평균 ${getAverageUsage(detail)}${detail.base_unit || ''})` : ''}
                        </td>
                        <td>{detail.shortage_qty}{detail.base_unit || ''}</td>
                        <td>{detail.base_unit || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detailItems.some((item) => getIngredientStockStatus(item).needsOrder) ? (
                  <button
                    type="button"
                    className="table-meals-button table-meals-button--primary"
                    onClick={() => createShortageOrder(selectedDetailMenu.menu_id)}
                  >
                    부족 식자재 발주하기
                  </button>
                ) : null}
                </>
              ) : null}

              {!isDetailLoading && !detailError && detailItems.length === 0 ? (
                <div className="table-meals-empty">선택한 메뉴의 식자재 상세 정보가 없습니다.</div>
              ) : null}
            </div>

            <div className="table-meals-modal__actions">
              <button
                type="button"
                className="table-meals-modal__button is-secondary"
                onClick={() => setSelectedDetailMenu(null)}
              >
                닫기
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <RecipeActionMenu
        state={recipeMenuState}
        onClose={() => setRecipeMenuState(null)}
        onViewAi={(request) => {
          setRecipeViewMode('ai')
          setRecipeViewRequest(request)
        }}
        onViewBasic={(request) => {
          setRecipeViewMode('basic')
          setRecipeViewRequest(request)
        }}
        onRegister={setRecipeRegisterRequest}
        onOrder={goToFoodOrder}
      />
      <RecipeViewModal
        request={recipeViewRequest}
        mode={recipeViewMode}
        onClose={() => setRecipeViewRequest(null)}
        onRegister={(request) => {
          setRecipeViewRequest(null)
          setRecipeRegisterRequest(request)
        }}
      />
      <RecipeRegisterModal request={recipeRegisterRequest} onClose={() => setRecipeRegisterRequest(null)} />
      <AppAlert alert={alert} onClose={closeAlert} />
    </div>
  )
}

export default TableMealsManager
