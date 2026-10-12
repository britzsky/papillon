import MealPlanImpact, { type PlanImpact } from '../../components/MealPlanImpact'
import { formatQty } from '../../utils/formatQty'
import { buildApiUrl } from '../../config/api'
import MealUsageControls from '../../components/MealUsageControls'
import MenuOrigins from './MenuOrigins'
import PdfMenuRecommendations from './PdfMenuRecommendations'
import PdfMenuRegisterModal from './PdfMenuRegisterModal'
import { parseMealTable, WEEKDAYS, type ParsedMealTable, type PdfTextItem } from './pdfMealParser'
import { getMenuAliases, saveMenuAliases, type MenuAlias } from '../../api/menuAliases'
import { createPortal } from 'react-dom'
import { getShortages, type ShortageResult, type ShortageCriteria } from '../../api/shortageProcurement'
import MenuRecommendations from './MenuRecommendations'
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
  getAccountMealSlots,
  getAccountMealConfiguration,
  getMenuManagerList,
  getMealPlanAnalysis,
  getTableMealsDetailList,
  getTableMealsList,
  saveTableMeals,
  countConfirmedMeals,
  type AccountOption,
  type AccountMealSlot,
  type AccountMealConfiguration,
  type MenuIngredientItem,
  type MenuManagerItem,
  type TableMealsDetailItem,
  type TableMealsItem,
  type TableMealsQueryPeriod,
  type TableMealsSavePayload,
} from '../../api/operations'
import type { RecipeRequest } from '../../api/recipe'
import { requestAiTableMealsMatch } from '../../api/ai'
import { mealPlanTypeOptions } from './menuManagerShared'
import { PrintIcon } from '../../components/ActionIcons'
import './TableMealsManager.css'
import { getAverageUsage, getIngredientStockStatus } from '../../utils/ingredientStockStatus'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type MealSlotKey = string
type WeeklyMealSetting = { food_type: number; meal_plan_type: number }
type WeeklyMealSettings = Record<string, WeeklyMealSetting>

type ExtractedMenuItem = {
  text: string
  matchedMenu: MenuManagerItem | null
  /** 메뉴명이 아니라 저장된 별칭(전에 사람이 고른 연결)으로 찾은 경우 */
  aliasMatched?: boolean
  /** PDF 화면에서 '이번만 제외'한 글자(메뉴가 아닌 행사·안내 문구 등) */
  excluded?: boolean
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
  /** PDF에는 있으나 거래처 식사 설정에 없는 식사 */
  unconfiguredSlots?: string[]
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

type ManualMealRowId = string

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

type MealSlotRow = { id: string; key: MealSlotKey; label: string; code: number }

const ACCOUNT_MEAL_SLOT_ROWS: MealSlotRow[] = [
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

function toMealSlotRows(items: AccountMealSlot[]) {
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



/** 메뉴명 매칭 키. 백엔드 MenuNames.key와 같은 규칙이어야 한다(별칭 유일키). 알레르기 번호·장식 기호는 메뉴가 아니므로 지운다. */
function normalizeMenuText(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[([]\s*\d+(?:\s*[.,]\s*\d+)*\s*[)\]]/g, '')
    .trim()
    .replace(/(?<=\D)\d+(?:[.,]\d+)+$/, '')
    .replace(/[\s()[\]{}<>/\\|,.:;"'`~!@#$%^&*+=?_·•ㆍ\-★☆※◎○●◇◆□■▶▷♥♡]/g, '')
    .toLowerCase()
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

  return null
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

function getAutoMenuCost(menu: MenuManagerItem) {
  if (menu.menu_cost_complete === false) return 0
  return Math.max(menu.menu_cost_per_person ?? 0, 0)
}

function dailyMenuKeys(menu: MenuManagerItem) {
  return [`id:${menu.menu_id}`, `name:${normalizeMenuText(menu.menu_name)}`]
}

function pickRotatingMenu(
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

// 고객사에서 설정한 식사구분만 대상으로 자동 식단을 생성한다.
function buildConfiguredAutoTableMealsResult(
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
function createConfiguredManualTableMealsDays(week: MonthWeekOption, mealSlotRows: MealSlotRow[]): ParsedDay[] {
  return week.dates.map((date) => ({
    id: `manual-${formatDateValue(date)}`,
    label: AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7],
    date: formatDateLabel(date),
    meals: Object.fromEntries(mealSlotRows.map((slot) => [slot.key, [] as ExtractedMenuItem[]])),
  }))
}

// PDF 기존 형식 파서와의 호환을 위해 기존 고정 정의를 유지한다.
void [MEAL_SLOT_LABELS, MANUAL_MEAL_SLOT_ORDER, buildAutoTableMealsResult, createManualTableMealsDays]

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

function MealCalories({ menus }: { menus: ({ calories_per_serving?: number } | null)[] }) {
  if (menus.length === 0) return null
  // Existing menu forms use 0 as the default for unregistered calories.
  const known = menus.map(menu => menu?.calories_per_serving).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  )
  const missing = menus.length - known.length
  const total = known.reduce((sum, value) => sum + value, 0)
  return (
    <span className="table-meals-calories">
      {known.length === 0
        ? '열량 미등록'
        : `${missing ? '등록분 ' : ''}${total.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kcal / 1인분`}
      {missing > 0 && <small>칼로리 미등록 {missing}개 메뉴</small>}
    </span>
  )
}

function getMealBudgetSummary(
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

function hasIngredientShortage(items: MenuIngredientItem[]) {
  return items.some((item) => getIngredientStockStatus(item).needsOrder)
}

function mergeManualEveningSnacks(days: ParsedDay[], eveningSnacks: Record<string, ExtractedMenuItem[]>) {
  return days.map((day) => ({
    ...day,
    meals: {
      ...day.meals,
      snack: [...(day.meals.snack ?? []), ...(eveningSnacks[day.id] ?? [])],
    },
  }))
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

function matchPdfMenu(text: string, menuItems: MenuManagerItem[], aliasMenuIds: Map<string, string>): ExtractedMenuItem {
  const exact = findMatchedMenu(text, menuItems)
  if (exact) return { text, matchedMenu: exact }
  const aliasMenuId = aliasMenuIds.get(normalizeMenuText(text))
  const aliasMenu = aliasMenuId ? menuItems.find((menu) => menu.menu_id === aliasMenuId) ?? null : null
  return aliasMenu ? { text, matchedMenu: aliasMenu, aliasMatched: true } : { text, matchedMenu: null }
}

function buildParsedPdfResult(raw: ParsedMealTable, menuItems: MenuManagerItem[], aliasMenuIds: Map<string, string>): ParsedPdfResult {
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
async function extractPdfText(file: File): Promise<{ items: PdfTextItem[]; pageCount: number }> {
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
const PDF_EXCLUDED = '__excluded__'
const PDF_UNLINKED = '__unlinked__'

function TableMealsManager() {
  const [pdfMenuOverrides, setPdfMenuOverrides] = useState<Record<string, string>>({})
  const [menuAliases, setMenuAliases] = useState<MenuAlias[]>([])
  const [rememberPdfLinks, setRememberPdfLinks] = useState(true)
  const [pdfLinkMessage, setPdfLinkMessage] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountId = searchParams.get('account_id') || (searchParams.get('type') === 'vendor' ? searchParams.get('id') : '') || localStorage.getItem('account_id') || ''
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
  const [autoWeekValue, setAutoWeekValue] = useState('0')
  const [autoGeneratedResult, setAutoGeneratedResult] = useState<ParsedPdfResult | null>(null)
  const [autoGenerateMessage, setAutoGenerateMessage] = useState('')
  const [isTableSaving, setIsTableSaving] = useState(false)
  const [tableSaveMessage, setTableSaveMessage] = useState('')
  const [plannedServings, setPlannedServings] = useState('')
  const [draftSessionAccount, setDraftSessionAccount] = useState('')
  const restoredSettings = useRef<{ accountId: string; week: string; settings: WeeklyMealSettings } | null>(null)
  const [savedStockCheck, setSavedStockCheck] = useState<{ loading: boolean; saveWhenSufficient: boolean; criteria: ShortageCriteria; payload: TableMealsSavePayload; result?: ShortageResult; impact?: PlanImpact; error?: string } | null>(null)

  const persistPlan = async (payload: TableMealsSavePayload) => {
    // 사용 확정한 주를 다시 저장하면 그 주의 확정이 모두 풀리고 차감했던 재고가 복원된다(서버 저장 규칙).
    const confirmedMeals = await countConfirmedMeals(payload)
    if (confirmedMeals > 0 && !window.confirm(`이 식단표에는 사용 확정된 식사 ${confirmedMeals}개가 있습니다.
저장하면 이 주의 사용 확정이 모두 풀리고 차감했던 재고가 복원됩니다.
저장한 뒤 식단표 상세에서 '주간 사용 확정'을 다시 해야 재고가 맞습니다.

계속 저장할까요?`)) return
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
    } catch (error) {
      setTableSaveMessage(`식단표 저장 실패: ${error instanceof Error ? error.message : '다시 시도해주세요.'}`)
    } finally { setIsTableSaving(false) }
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
      setManualMessage('원가는 거래처에서 확인·적용한 편성 기준단가를 사용한 예상값입니다. 같은 날 동일 메뉴는 한 번만 배치합니다. 중복 제외·분류·예산 조건으로 구성이 부족한 식사는 메뉴를 보완해주세요.')
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

  return (
    <div className="table-meals-page">
      {savedStockCheck ? createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#0008', display: 'grid', placeItems: 'center', padding: 24 }}><section className="draft-stock-check" role="dialog" aria-modal="true" aria-label="등록 전 식단의 부족재고" style={{ background: 'white', padding: 24, borderRadius: 12, width: 'min(1100px, 95vw)', maxHeight: '85vh', overflow: 'auto' }}>
        <h2>등록 전 식단의 부족재고 확인</h2><p>아직 식단표를 저장하지 않았습니다. 예정 식수에 따른 부족 식재료를 먼저 발주할 수 있습니다. 현재고와 기발주 미입고량은 한 번씩 차감합니다.</p>
        {savedStockCheck.loading ? <p>식단 필요량과 재고를 확인하고 있습니다.</p> : savedStockCheck.error ? <p role="alert">부족량 확인 실패: {savedStockCheck.error}</p> : <>
          <h3>① 부족 식재료 <small>식단 기간 전체 필요량 기준 · 식재료별 합계</small></h3>
          <p>{savedStockCheck.result?.ingredients.length ? `부족 또는 확인이 필요한 식재료 ${savedStockCheck.result.ingredients.length}개입니다.` : '이 식단의 추가 발주가 필요한 식재료가 없습니다.'}</p>
          <div className="workspace-table-scroll" tabIndex={0} role="region" aria-label="부족 식재료 테이블"><table style={{ width: '100%' }}><thead><tr><th>식재료</th><th>필요량</th><th>안전재고</th><th>현재고</th><th>기발주 미입고</th><th>부족량</th></tr></thead><tbody>{savedStockCheck.result?.ingredients.map(row => <tr key={row.ingredient_id}><td><strong>{row.ingredient_name}</strong>{row.issues.map(issue => <small key={issue} className="draft-stock-check__issue">{issue}</small>)}</td>{[row.required_qty, row.safe_stock_qty, row.current_qty, row.incoming_qty, row.shortage_qty].map((quantity, index) => <td key={index} className={index === 4 ? 'draft-stock-check__shortage' : undefined}>{formatQty(quantity, row.base_unit)}</td>)}</tr>)}</tbody></table></div>
        </>}
        <MealPlanImpact impact={savedStockCheck.impact} /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}><button onClick={() => setSavedStockCheck(null)}>닫기</button><button disabled={savedStockCheck.loading} onClick={() => void preparePlan(savedStockCheck.payload, savedStockCheck.saveWhenSufficient)}>재고 다시 확인</button><button disabled={savedStockCheck.loading || !savedStockCheck.result?.ingredients.length} onClick={() => openDraftProcurement(savedStockCheck.criteria)}>부족 식재료 먼저 발주</button><button disabled={savedStockCheck.loading || isTableSaving || !!savedStockCheck.error || savedStockCheck.result?.ingredients.some(row => row.issues.length > 0)} onClick={() => void persistPlan(savedStockCheck.payload)}>발주는 나중에 · 식단만 저장</button></div>
      </section></div>, document.body) : null}
      {isTableSaving ? <LoadingScreen overlay message="식단표를 저장하고 있습니다." /> : null}
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
            <label className="table-meals-servings-field"><span>예정 식수</span><input aria-label="예정 식수" type="number" min="1" step="1" value={plannedServings} onChange={event => setPlannedServings(event.target.value)} placeholder="식수 입력" style={{ width: 100 }} /><span>명</span></label>
            {/* 버튼은 오른쪽에 흐름 순서로 모은다: PDF(불러오기 → AI 매칭) · 자동(제작 → 수정 → 저장) · 수기 */}
            <div className="table-meals-toolbar__actions">
              <button type="button" className="table-meals-upload-button" onClick={handleUploadClick} title="식단표 PDF의 글자를 읽어 요일·식사별로 불러옵니다(파일은 서버에 저장하지 않음)">
                PDF 식단표 불러오기
              </button>
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
                <button
                type="button"
                className="table-meals-upload-button"
                onClick={() => void openManualEditor()}
                disabled={selectedAccountId === '' || isAccountMenuLoading}
              >
                {isAccountMenuLoading ? '메뉴 불러오는 중' : '수기 식단표 제작'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="table-meals-hidden-input"
              onChange={handleFileChange}
            />
          </section>

          {selectedAccountId && selectedAutoWeek && configuredMealSlotRows.length > 0 ? (
            <section className="table-meals-weekly-summary" aria-label="주간 식사 편성 요약">
              <div>
                <strong>주간 식사 편성</strong>
                <span>
                  {Object.keys(weeklyMealSettings).length > 0
                    ? `고객사 기본값에서 ${Object.keys(weeklyMealSettings).length}개 식사를 변경했습니다.`
                    : '고객사 기본값을 적용합니다.'}
                </span>
              </div>
              <button type="button" onClick={() => setIsWeeklySettingsOpen(true)}>편성 설정</button>
            </section>
          ) : null}

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

              <div className={`table-meals-analysis${autoGeneratedResult ? ' table-meals-analysis--auto' : ''}`}>
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
                      {displayedMealResult.unconfiguredSlots?.length ? <p role="alert">PDF의 {displayedMealResult.unconfiguredSlots.join(', ')} 칸은 이 거래처 식사 설정에 없어 빠집니다. 고객사 관리에서 식사구분을 확인해주세요.</p> : null}
                    </section>

                    {parsedPdfResult && <div className="table-meals-pdf-transfer">
                      <button type="button" onClick={() => void transferPdfToEditor()}>선택한 PDF 식단 편집·저장</button>
                      <label><input type="checkbox" checked={rememberPdfLinks} onChange={event => setRememberPdfLinks(event.target.checked)} /> 직접 고른 메뉴 연결을 기억 (다음 PDF부터 같은 표기는 자동 연결)</label>
                      {pdfLinkMessage && <small>{pdfLinkMessage}</small>}
                    </div>}
                    <MenuOrigins accountId={selectedAccountId} menuIds={displayedMealResult.days.flatMap(day => Object.values(day.meals).flatMap(items => items.flatMap(item => item.matchedMenu ? [item.matchedMenu.menu_id] : [])))} />

                    <div className="table-meals-week-grid">
                      {displayedMealResult.days.map((day) => (
                        <article key={day.id} className="table-meals-day-card">
                          <header>
                            <strong>{day.label}</strong>
                            <span>{day.date || '-'}</span>
                          </header>
                          <dl>
                            {configuredMealSlotRows.map(({ key: mealKey, label: mealLabel }) => {
                              const mealItems = day.meals[mealKey as MealSlotKey] ?? []
                              if (mealItems.length === 0) {
                                return null
                              }

                              return (
                                <div key={mealKey}>
                                  <dt>{mealLabel}</dt>
                                  <dd className="table-meals-day-card__menus">
                                    <MealCalories menus={mealItems.map(item => item.matchedMenu)} />
                                    {mealItems.map((item, itemIndex) => {
                                      const matchedMenu = item.matchedMenu
                                      const profile = accountMealConfiguration?.profiles.find(p => p.meal_slot_code === configuredMealSlotRows.find(s => s.key === mealKey)?.code)
                                      const known = mealItems.filter(i => i !== item && i.matchedMenu).map(i => i.matchedMenu!)
                                      const remainingBudget = profile?.budget_per_person != null && known.every(m => getAutoMenuCost(m) > 0) ? profile.budget_per_person - known.reduce((sum, m) => sum + getAutoMenuCost(m), 0) : undefined

                                      if (item.excluded) return <span key={`${mealKey}-${itemIndex}`} className="table-meals-menu-excluded"><s>{item.text}</s> <button type="button" onClick={() => setPdfOverride(day.id, mealKey, itemIndex, null)}>되돌리기</button></span>
                                      const pdfOverride = pdfMenuOverrides[`${selectedAccountId}/${day.id}/${mealKey}/${itemIndex}`]
                                      return matchedMenu ? (
                                        <span key={`${mealKey}-${itemIndex}`}><button type="button" className={`table-meals-menu-text is-matched${getMenuShortageClass(matchedMenu)}`} {...createAiRecipeGestureHandlers(buildRecipeRequest(item.text, matchedMenu), setRecipeMenuState)} onClick={() => setSelectedDetailMenu(matchedMenu)}>{matchedMenu.menu_name}</button>
                                        {(item.aliasMatched || pdfOverride) && normalizeMenuText(item.text) !== normalizeMenuText(matchedMenu.menu_name) && <small className="table-meals-alias-note">PDF 표기 '{item.text}'{item.aliasMatched ? ' · 저장된 연결' : ''} <button type="button" onClick={() => setPdfOverride(day.id, mealKey, itemIndex, item.aliasMatched ? PDF_UNLINKED : null)}>{item.aliasMatched ? '이번만 다른 메뉴' : '선택 취소'}</button></small>}</span>
                                      ) : (
                                        <span key={`${mealKey}-${itemIndex}`}><button type="button" className="table-meals-menu-text is-unmatched" onClick={() => openRegisterModal(item.text, day, mealKey)}>{item.text}</button>
                                        <button type="button" className="table-meals-exclude-button" title="행사·안내 문구처럼 메뉴가 아닌 글자는 이번 식단에서 뺍니다" onClick={() => setPdfOverride(day.id, mealKey, itemIndex, PDF_EXCLUDED)}>이번만 제외</button>
                                        {getAiMatchedMenu(item.text) && <small>AI 후보: {getAiMatchedMenu(item.text)?.menu_name} · 예산을 확인하고 선택해주세요.</small>}
                                        <PdfMenuRecommendations text={item.text} menus={accountMenuItems.filter(m => (m.meal_plan_type ?? 0) === (profile?.default_meal_plan_type ?? selectedMealPlanType))} remainingBudget={remainingBudget} usedIds={known.map(m => m.menu_id)} onSelect={menu => setPdfOverride(day.id, mealKey, itemIndex, menu.menu_id)} /></span>
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

            <details className="table-meals-manual__origins">
              <summary>원산지 확인 <span>펼쳐서 식자재별 원산지를 확인하세요</span></summary>
              <MenuOrigins accountId={selectedAccountId} menuIds={mergeManualEveningSnacks(manualDays, manualEveningSnackItems).flatMap(day => Object.values(day.meals).flatMap(items => items.flatMap(item => item.matchedMenu ? [item.matchedMenu.menu_id] : [])))} />
            </details>

            <div className="table-meals-manual__guide">
              <strong>주간 식단 편집</strong>
              <span>날짜·식사 칸 선택 → 오른쪽 메뉴를 눌러 추가</span>
              <span>금액은 1인 기준입니다.</span>
            </div>
            <div className="table-meals-manual">
              <section className="table-meals-manual__grid" aria-label="주간 식단표 편집" style={{ gridTemplateColumns: `64px repeat(${Math.max(manualDays.length, 1)}, minmax(160px, 1fr))` }}>
                <div className="table-meals-manual__corner" style={{ gridColumn: 1, gridRow: 1 }}>
                  구분
                </div>
                {manualDays.map((day, dayIndex) => (
                  <div key={day.id} className="table-meals-manual__day-head" style={{ gridColumn: dayIndex + 2, gridRow: 1 }}>
                    <strong>{day.label}</strong>
                    <span>{day.date}</span>
                  </div>
                ))}

                {configuredMealSlotRows.map((mealSlot, mealRowIndex) => (
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
                      const budgetSummary = getMealBudgetSummary(mealItems, mealSlot.code, accountMealConfiguration)

                      return (
                        <button
                          key={`${day.id}-${mealSlot.id}`}
                          type="button"
                          className={`table-meals-manual__cell table-meals-manual__cell--${mealSlot.id}${
                            isSelected ? ' is-selected' : ''
                          }`}
                          style={{ gridColumn: dayIndex + 2, gridRow: mealRowIndex + 2 }}
                          aria-label={`${day.date} ${day.label} ${mealSlot.label} 메뉴 편집`}
                          aria-pressed={isSelected}
                          onClick={() => setManualTarget({ dayId: day.id, rowId: mealSlot.id, mealKey: mealSlot.key })}
                        >
                          <span className={`table-meals-budget table-meals-budget--cell${budgetSummary.isOverBudget ? ' is-over' : ''}${budgetSummary.hasUnpricedMenu ? ' is-unpriced' : ''}`}>
                            현재 {Math.round(budgetSummary.cost).toLocaleString('ko-KR')}원 / 목표 {budgetSummary.budget == null ? '미설정' : `${Math.round(budgetSummary.budget).toLocaleString('ko-KR')}원`}
                          </span>
                          <MealCalories menus={mealItems.map(item => item.matchedMenu)} />
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
                                    <small className="table-meals-menu-cost">
                                      {item.matchedMenu && getAutoMenuCost(item.matchedMenu) > 0
                                        ? `${Math.round(getAutoMenuCost(item.matchedMenu)).toLocaleString('ko-KR')}원`
                                        : `원가 미산정${item.matchedMenu?.menu_cost_reason ? ` (${item.matchedMenu.menu_cost_reason})` : ''}`}
                                    </small>
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

              <aside className="table-meals-manual__palette" aria-label="선택한 식사에 메뉴 추가">
                <h3 className="table-meals-manual__palette-title">메뉴 추가</h3>
                <div className="table-meals-manual__target">
                  <strong>
                    {manualSelectedDay
                      ? `${manualSelectedDay.label} ${manualSelectedDay.date} · ${
                          configuredMealSlotRows.find((slot) => slot.id === manualTarget?.rowId)?.label ?? ''
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
                    aria-label="추가할 메뉴 검색"
                    placeholder="메뉴 이름으로 검색"
                    onChange={(event) => setManualSearchText(event.target.value)}
                  />
                  <select aria-label="음식 분류" value={manualFoodTypeFilter} onChange={(event) => setManualFoodTypeFilter(event.target.value)}>
                    {MANUAL_FOOD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value || 'all-food'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label="메뉴 유형" value={manualMenuTypeFilter} onChange={(event) => setManualMenuTypeFilter(event.target.value)}>
                    {MANUAL_MENU_TYPE_OPTIONS.map((option) => (
                      <option key={option.value || 'all-menu'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <details className="table-meals-manual__recommendations"><summary>추천 메뉴 보기</summary>
                <MenuRecommendations accountId={selectedAccountId} mealDate={manualSelectedDay?.date || selectedAutoWeek?.dates[0]?.toLocaleDateString('sv-SE')} disabled={!manualTarget} onSelect={id => { const menu = accountMenuItems.find(item => item.menu_id === id); if (menu) addManualMenu(menu) }} />
                </details>
                <p className="table-meals-manual__count">검색 결과 {filteredManualMenus.length}개 · 누르면 선택한 식사에 추가됩니다.</p>
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
                          {MANUAL_MENU_TYPE_OPTIONS.find((option) => option.value === menu.menu_type)?.label ?? '기타'} · {menu.menu_gubun || '-'} ·{' '}
                          {getAutoMenuCost(menu) > 0 ? `1인 원가 ${Math.round(getAutoMenuCost(menu)).toLocaleString('ko-KR')}원` : `원가 미산정${menu.menu_cost_reason ? ` (${menu.menu_cost_reason})` : ''}`}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="table-meals-empty">조건에 맞는 거래처 메뉴가 없습니다.</div>
                  )}
                </div>
              </aside>
            </div>

            <div className="table-meals-modal__actions table-meals-manual__actions"><label className="table-meals-servings-field"><span>식사당 예정 식수</span><input aria-label="식사당 예정 식수" type="number" min="1" step="1" value={plannedServings} onChange={event => setPlannedServings(event.target.value)} placeholder="식수 입력" style={{ width: 100 }} /><span>명</span><span>(이번 식단 전체 식사에 적용)</span></label>
              <button type="button" className="table-meals-modal__button is-primary" disabled={isTableSaving} onClick={() => void checkCurrentDraftStock()}>부족재고 확인·발주</button>
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

      {isWeeklySettingsOpen && selectedAutoWeek ? (
        <div className="table-meals-modal-backdrop table-meals-modal-backdrop--weekly" role="presentation" onClick={() => setIsWeeklySettingsOpen(false)}>
          <section className="table-meals-modal table-meals-modal--weekly" role="dialog" aria-modal="true" aria-labelledby="table-meals-weekly-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="table-meals-modal__header">
              <div>
                <p className="table-meals-modal__eyebrow">Weekly Schedule</p>
                <h2 id="table-meals-weekly-modal-title">주간 식사 편성</h2>
              </div>
              <span>{selectedAutoWeek.label}</span>
            </div>

            <div className="table-meals-weekly-settings__notice">
              고객사 기본값으로 채워져 있습니다. 특별한 날짜의 식사분류나 식단유형만 변경하세요.
            </div>
            <div className="table-meals-weekly-settings__scroll">
              <table className="table-meals-weekly-settings__table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    {configuredMealSlotRows.map((slot) => <th key={slot.id}>{slot.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {selectedAutoWeek.dates.map((date) => (
                    <tr key={formatDateValue(date)}>
                      <th>{formatDateLabel(date)} ({AUTO_WEEKDAY_LABELS[(date.getDay() + 6) % 7]})</th>
                      {configuredMealSlotRows.map((slot) => {
                        const key = `${formatDateValue(date)}:${slot.code}`
                        const profile = accountMealConfiguration?.profiles.find((item) => item.meal_slot_code === slot.code)
                        const isSnack = [1, 3, 4, 6, 7, 8].includes(slot.code)
                        const setting = weeklyMealSettings[key]
                        const foodType = setting?.food_type ?? profile?.default_food_type ?? (isSnack ? 6 : 1)
                        const planType = setting?.meal_plan_type ?? profile?.default_meal_plan_type ?? selectedMealPlanType
                        return (
                          <td key={slot.id} className={setting ? 'is-changed' : ''}>
                            <select aria-label={`${formatDateLabel(date)} ${slot.label} 식사분류`} value={foodType} onChange={(event) => updateWeeklyMealSetting(date, slot, { food_type: Number(event.target.value) })}>
                              {MANUAL_FOOD_TYPE_OPTIONS.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <select aria-label={`${formatDateLabel(date)} ${slot.label} 식단유형`} value={planType} onChange={(event) => updateWeeklyMealSetting(date, slot, { meal_plan_type: Number(event.target.value) })}>
                              {mealPlanTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.text}</option>)}
                            </select>
                            <small>{profile?.budget_per_person == null ? '단가 서버 계산' : `${Math.round(profile.budget_per_person).toLocaleString('ko-KR')}원`}</small>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-meals-modal__actions">
              <button type="button" className="table-meals-modal__button is-secondary" onClick={() => setWeeklyMealSettings({})}>고객사 기본값으로 초기화</button>
              <button type="button" className="table-meals-modal__button is-primary" onClick={() => setIsWeeklySettingsOpen(false)}>편성 적용</button>
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
            <MealUsageControls accountId={selectedTableMeal.account_id || selectedAccountId} tableId={selectedTableMeal.table_id} onChanged={() => { setOriginRevision(r => r + 1); setSelectedTableMeal({ ...selectedTableMeal }) }} />

            <div className="table-meals-sheet">
              {isTableMealDetailLoading ? <LoadingScreen compact message="식단표 상세를 불러오는 중입니다." /> : null}
              {!isTableMealDetailLoading && tableMealDetailError ? (
                <div className="table-meals-empty">{tableMealDetailError}</div>
              ) : null}

              {!isTableMealDetailLoading && !tableMealDetailError && tableMealDetailDays.length > 0 ? (
                <div className="table-meals-hangyeol">
                  <div className="table-meals-hangyeol__title">
                    <h3>주 간 식 단 표</h3>
                    <p><strong className="table-meals-hangyeol__account">{tableMealAccountName}</strong>{selectedTableMeal.table_name ? ` · ${selectedTableMeal.table_name}` : ''}</p>
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
                      {(selectedTableMeal?.account_id === selectedAccountId && configuredMealSlotRows.length > 0
                        ? configuredMealSlotRows
                        : DETAIL_MEAL_SLOT_ORDER).map((mealRow) => (
                        <tr key={mealRow.id} className={`table-meals-hangyeol__row table-meals-hangyeol__row--${mealRow.id}`}>
                          <th>{mealRow.label}</th>
                          {tableMealDetailDays.map((day) => {
                            const menus = mealRow.id === 'snack-evening' ? [] : day.meals[mealRow.key]

                            return (
                              <td key={`${day.key}-${mealRow.id}`}>
                                <MealCalories menus={menus} />
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

                  <p className="table-meals-hangyeol__notice">* 상기메뉴는 식당 수급사정에 따라 변경될 수 있습니다.<br />* 열량은 현재 거래처 메뉴에 등록된 1인분 칼로리의 합계입니다. 미등록 메뉴가 있으면 등록분만 표시합니다.</p>
                  <div className="table-meals-hangyeol__origin">
                    <strong>원산지</strong>
                    <div>
                      <MenuOrigins key={`${selectedTableMeal.table_id}-${originRevision}`} tableId={selectedTableMeal.table_id} accountId={selectedTableMeal?.account_id || selectedAccountId} menuIds={tableMealDetailItems.map(item => item.menu_id)} />
                    </div>
                  </div>
                </div>
              ) : null}

              {!isTableMealDetailLoading && !tableMealDetailError && tableMealDetailDays.length === 0 ? (
                <div className="table-meals-empty">조회된 식단표 상세가 없습니다.</div>
              ) : null}
            </div>

            <div className="table-meals-modal__actions no-print">
              <button type="button" className="table-meals-modal__button is-secondary print-button" onClick={printTableMealDetail}>
                <PrintIcon />인쇄
              </button>
              <button type="button" className="table-meals-modal__button is-secondary" onClick={closeTableMealDetail}>
                닫기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {registerTarget ? (
        <PdfMenuRegisterModal
          accountId={selectedAccountId}
          accountName={selectedAccountName}
          pdfText={registerTarget.text}
          context={registerTarget.context}
          slotCode={registerTarget.slotCode}
          mealPlanType={selectedMealPlanType}
          accountMenus={accountMenuItems}
          onClose={() => setRegisterTarget(null)}
          onLinked={handleRegisteredMenu}
        />
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
                          {getIngredientStockStatus(detail).emoji} {detail.product_name || detail.ingredient_name || '-'}<br /><small>{detail.supplier_name || '상품 연결 필요'} · {detail.package_qty || ''}{detail.package_unit || ''} / {detail.order_unit || ''} · {detail.purchase_price == null ? '가격 미확인' : `${detail.purchase_price.toLocaleString('ko-KR')}원`} · {detail.origin_name || '원산지 미확인'}</small>
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
      {alert ? createPortal(<div style={{ position: 'relative', zIndex: 5000 }}><AppAlert alert={alert} onClose={closeAlert} /></div>, document.body) : null}
    </div>
  )
}

export default TableMealsManager
