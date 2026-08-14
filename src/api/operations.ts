import { API_ORIGIN, buildApiUrl } from '../config/api'

export type MealCategory = '한식' | '중식' | '일식' | '양식' | '분식' | '간식' | '기타'

export type AccountOption = {
  value: string
  text: string
}

export type MenuManagerItem = {
  menu_id: string
  menu_name: string
  food_type?: number
  food_type_reason?: string
  meal_category: string
  menu_type: string
  menu_gubun: string
  account_id: string
  account_name: string
  created_at?: string
  menu_img?: string | File
  image_url?: string
  image_file_id?: string
  like?: string
  meal_plan_type: number
  calories_per_serving?: number
}

export type MenuIngredientItem = {
  recipe_id?: string
  menu_id: string
  ingredient_seq?: number
  ingredient_id: string
  location_id?: string
  ingredient_name: string
  ingredient_name_raw?: string
  ingredient_name_std?: string
  category_name?: string
  required_qty: number
  qty_num?: number
  qty_unit?: string
  qty_raw?: string
  review_flag?: string
  current_qty: number
  shortage_qty: number
  order_needed_qty: number
  base_unit: string
  order_unit: string
  convert_value: number
  storage_type?: string
  menu_usage_count?: number
  needs_review?: number
  note?: string
  safe_stock_qty?: number
  average_usage_qty?: number
  total_capacity_qty?: number
  last_used_at?: string
  like?: string
}

export type IngredientOption = {
  ingredient_id: string
  ingredient_name: string
  ingredient_name_std?: string
  category_name: string
  base_unit: string
  order_unit?: string
  convert_value?: number
  storage_type?: string
  menu_usage_count: number
  needs_review?: number
  note?: string
  safe_stock_qty?: number
  like?: string
}

export type TableMealsItem = {
  table_id: string
  account_id: string
  account_name: string
  table_name: string
  table_year?: number
  table_month?: number
  table_week?: number
  source?: 'auto' | 'pdf' | 'manual'
  file_name: string
  created_at?: string
  meal_plan_type: number
}

export type TableMealsDetailItem = {
  table_id: string
  account_id: string
  account_name: string
  table_name: string
  meal_date: string
  weekday: string
  meal_slot: string
  sort_order: number
  menu_id: string
  menu_name: string
  food_type: number
  menu_type: number
  menu_gubun: number
}

export type MealPlanAnalysisItem = {
  menu_id: string
  menu_name: string
  ingredient_id: string
  required_qty: number
  current_qty: number
  shortage_qty: number
  ingredient_name?: string
  average_usage_qty?: number
  total_capacity_qty?: number
  last_used_at?: string
  menu_usage_count?: number
}

export type TableMealsQueryPeriod = {
  table_year: number
  table_month: number
  table_week: number
  start_date: string
  end_date: string
}

export type TableMealsSavePayload = {
  account_id: string
  account_name: string
  table_name: string
  table_year: number
  table_month: number
  table_week: number
  source: 'auto' | 'pdf' | 'manual'
  meal_plan_type: number
  meals: Array<{
    meal_date: string
    weekday: string
    meal_slot: string
    menu_count: number
    menus: Array<{
      sort_order: number
      menu_id: string
      menu_name: string
      food_type: number
      menu_type: number
      menu_gubun: number
    }>
  }>
  table_meals: Array<{
    meal_date: string
    weekday: string
    meal_slot: string
    sort_order: number
    menu_id: string
    menu_name: string
    food_type: number
    menu_type: number
    menu_gubun: number
  }>
}

export type MenuSavePayload = {
  menus: Array<{
    sort_order: number
    menu_id: string
    menu_name: string
    food_type: number
    menu_type: string
    menu_gubun: string
    created_at: string
    menu_img?: string | File
    image_file_id?: string
    meal_plan_type: number
    calories_per_serving?: number
  }>
  menu_details: Array<{
    recipe_id?: string
    menu_id: string
    ingredient_seq: number
    ingredient_id: string
    ingredient_name: string
    category_name: string
    qty_num: number
    qty_unit: string
    qty_raw: string
    review_flag: string
    current_qty: number
    shortage_qty: number
    order_needed_qty: number
    base_unit: string
    order_unit: string
    convert_value: number
    menu_usage_count: number
  }>
}

export type AccountMenuSavePayload = {
  account_id: string
  account_name: string
  meal_category: string
  menu_ids: string[]
  added_menus: Array<{
    sort_order: number
    menu_id: string
    menu_name: string
    meal_category: string
    food_type: number
    menu_type: string
    menu_gubun: string
    del_yn?: string
    meal_plan_type: number
    calories_per_serving?: number
  }>
  removed_menu_ids: string[]
  removed_menus?: Array<{
    sort_order: number
    menu_id: string
    menu_name: string
    meal_category: string
    food_type: number
    menu_type: string
    menu_gubun: string
    del_yn: string
    meal_plan_type: number
    calories_per_serving?: number
  }>
  menu_details: Array<{
    recipe_id: string
    menu_id: string
    ingredient_id: string
    location_id?: string
    ingredient_seq: number
    ingredient_name_raw: string
    qty_raw: string
    qty_num: number
    qty_unit: string
    recipe_yield_servings: number
    qty_base: number
    base_unit: string
    qty_per_person: number
    review_flag: string
  }>
  ingredient_detail: Array<{
    ingredient_id: string
    ingredient_name_raw: string
    ingredient_name_std: string
    category_name: string
    base_unit: string
    order_unit: string
    convert_value: number
    storage_type: string
    menu_usage_count: number
    needs_review: number
    note: string
    safe_stock_qty: number
    created_at: string
  }>
}

type RawRecord = Record<string, unknown>

function withLocalUserId<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    user_id: getLocalUserId(),
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('이미지 파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function getLocalUserId() {
  return typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : ''
}

function getLocalAccountId() {
  return typeof window !== 'undefined' ? localStorage.getItem('account_id') ?? '' : ''
}

function withAccountMenuSaveMetadata(payload: AccountMenuSavePayload) {
  const userId = getLocalUserId()

  return {
    ...payload,
    user_id: userId,
    added_menus: payload.added_menus.map((menu) => ({
      ...menu,
      user_id: userId,
      account_id: payload.account_id,
    })),
    removed_menus: (payload.removed_menus ?? []).map((menu) => ({
      ...menu,
      user_id: userId,
      account_id: payload.account_id,
    })),
    menu_details: payload.menu_details.map((detail) => ({
      ...detail,
      user_id: userId,
      account_id: payload.account_id,
    })),
    ingredient_detail: payload.ingredient_detail.map((detail) => ({
      ...detail,
      user_id: userId,
      account_id: payload.account_id,
    })),
  }
}

const mealCategoryByFoodType: Record<number, MealCategory> = {
  1: '한식',
  2: '중식',
  3: '일식',
  4: '양식',
  5: '분식',
  6: '간식',
  7: '기타',
}

const menuTypeValueByText: Record<string, string> = {
  주메뉴: '0',
  부메뉴: '1',
  '후식/간식': '2',
  음료: '3',
  기타: '4',
}

const menuGubunValueByText: Record<string, string> = {
  '밥류/덮밥': '0',
  '탕/찌개/국': '1',
  '무침/생채/겉절이': '2',
  '튀김/까스/강정': '3',
  '구이/스테이크': '4',
  '찜/수육': '5',
  '전/계란/부침': '6',
  면류: '7',
  조림: '8',
  볶음: '9',
  나물: '10',
  샐러드: '11',
  '분식/간식': '12',
  '후식/간식': '13',
  '절임/피클': '14',
  '소스/드레싱': '15',
  음료: '16',
  '기타 부찬': '17',
  기타: '18',
}

function asText(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return fallback
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

function asOptionValue(value: unknown, textMap: Record<string, string>, validValues: string[]) {
  const text = asText(value)
  if (validValues.includes(text)) {
    return text
  }

  return textMap[text] ?? ''
}

export function toBackendAssetUrl(value: unknown) {
  const path = asText(value)
  if (path === '' || path === '/image/menu/' || path === 'image/menu/') {
    return ''
  }

  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}${normalizedPath}`
}

function readArray(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { value?: unknown }).value)) {
    return (payload as { value: unknown[] }).value
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { Value?: unknown }).Value)) {
    return (payload as { Value: unknown[] }).Value
  }

  return []
}

async function parseResponseBody(response: Response) {
  const text = await response.text()
  if (text.trim() === '') {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function toMealCategory(record: RawRecord): string {
  const foodType = asNumber(record.food_type ?? record.foodType, Number.NaN)
  if (Number.isFinite(foodType) && mealCategoryByFoodType[foodType]) {
    return mealCategoryByFoodType[foodType]
  }

  const text = asText(
    record.food_type_name ??
      record.foodTypeName ??
      record.category ??
      record.menuCategory ??
      record.categoryName ??
      record.cuisineType ??
      record.cuisine ??
      record.meal_category ??
      record.mealCategory,
  )

  if (text === '한식' || text === '중식' || text === '일식' || text === '양식' || text === '분식' || text === '간식' || text === '기타') {
    return text
  }

  return '기타'
}

function normalizeAccountOption(record: RawRecord): AccountOption {
  return {
    value: asText(record.account_id ?? record.accountId),
    text: asText(record.account_name ?? record.accountName),
  }
}

function normalizeMenu(record: RawRecord, index: number): MenuManagerItem {
  const menuImg = asText(record.menu_img ?? record.menuImg ?? record.image_url ?? record.imageUrl)

  return {
    menu_id: asText(record.menu_id ?? record.menuId, `row-${index + 1}`),
    menu_name: asText(record.menu_name ?? record.menuName, `메뉴 ${index + 1}`),
    food_type: asNumber(record.food_type ?? record.foodType, Number.NaN),
    food_type_reason: asText(record.food_type_reason ?? record.foodTypeReason),
    meal_category: toMealCategory(record),
    menu_type: asOptionValue(record.menu_type ?? record.menuType, menuTypeValueByText, ['0', '1', '2', '3', '4']),
    menu_gubun: asOptionValue(
      record.menu_gubun ?? record.menuGubun,
      menuGubunValueByText,
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'],
    ),
    account_id: asText(record.account_id ?? record.accountId),
    account_name: asText(record.account_name ?? record.accountName),
    created_at: asText(record.created_at ?? record.createdAt),
    menu_img: menuImg,
    image_url: toBackendAssetUrl(menuImg),
    image_file_id: asText(record.image_file_id ?? record.imageFileId),
    like: asText(record.like ?? record.LIKE ?? record.is_like ?? record.isLike, 'N'),
    meal_plan_type: asNumber(record.meal_plan_type ?? record.mealPlanType, 0),
    calories_per_serving: asNumber(record.calories_per_serving ?? record.caloriesPerServing),
  }
}

function normalizeIngredient(record: RawRecord): MenuIngredientItem {
  const qtyNum = asNumber(record.qty_num ?? record.qtyNum ?? record.required_qty ?? record.requiredQty)
  const ingredientNameRaw = asText(
    record.ingredient_name_raw ?? record.ingredientNameRaw ?? record.ingredient_name ?? record.ingredientName,
  )

  return {
    recipe_id: asText(record.recipe_id ?? record.recipeId),
    menu_id: asText(record.menu_id ?? record.menuId),
    ingredient_seq: asNumber(record.ingredient_seq ?? record.ingredientSeq),
    ingredient_id: asText(record.ingredient_id ?? record.ingredientId),
    location_id: asText(record.location_id ?? record.locationId),
    ingredient_name: asText(record.ingredient_name ?? record.ingredientName, ingredientNameRaw),
    ingredient_name_raw: ingredientNameRaw,
    ingredient_name_std: asText(record.ingredient_name_std ?? record.ingredientNameStd ?? record.ingredient_name ?? record.ingredientName),
    category_name: asText(record.category_name ?? record.categoryName),
    required_qty: qtyNum,
    qty_num: qtyNum,
    qty_unit: asText(record.qty_unit ?? record.qtyUnit ?? record.base_unit ?? record.baseUnit ?? record.order_unit ?? record.orderUnit),
    qty_raw: asText(record.qty_raw ?? record.qtyRaw),
    review_flag: asText(record.review_flag ?? record.reviewFlag),
    current_qty: asNumber(record.current_qty ?? record.currentQty),
    shortage_qty: asNumber(record.shortage_qty ?? record.shortageQty),
    order_needed_qty: asNumber(record.order_needed_qty ?? record.orderNeededQty),
    base_unit: asText(record.base_unit ?? record.baseUnit),
    order_unit: asText(record.order_unit ?? record.orderUnit),
    convert_value: asNumber(record.convert_value ?? record.convertValue),
    storage_type: asText(record.storage_type ?? record.storageType),
    menu_usage_count: asNumber(record.menu_usage_count ?? record.menuUsageCount),
    needs_review: asNumber(record.needs_review ?? record.needsReview),
    note: asText(record.note),
    safe_stock_qty: asNumber(record.safe_stock_qty ?? record.safeStockQty),
    average_usage_qty: asNumber(record.average_usage_qty ?? record.averageUsageQty ?? record.avg_usage_qty ?? record.avgUsageQty),
    total_capacity_qty: asNumber(record.total_capacity_qty ?? record.totalCapacityQty ?? record.total_qty ?? record.totalQty ?? record.capacity_qty ?? record.capacityQty),
    last_used_at: asText(record.last_used_at ?? record.lastUsedAt ?? record.last_usage_date ?? record.lastUsageDate),
    like: asText(record.like ?? record.LIKE ?? record.is_like ?? record.isLike, 'N'),
  }
}

function normalizeIngredientOption(record: RawRecord): IngredientOption {
  return {
    ingredient_id: asText(record.ingredient_id ?? record.ingredientId),
    ingredient_name: asText(
      record.ingredient_name_raw ?? record.ingredientNameRaw ?? record.ingredient_name ?? record.ingredientName,
    ),
    ingredient_name_std: asText(record.ingredient_name_std ?? record.ingredientNameStd ?? record.ingredient_name ?? record.ingredientName),
    category_name: asText(record.category_name ?? record.categoryName),
    base_unit: asText(record.base_unit ?? record.baseUnit),
    order_unit: asText(record.order_unit ?? record.orderUnit),
    convert_value: asNumber(record.convert_value ?? record.convertValue, 1),
    storage_type: asText(record.storage_type ?? record.storageType),
    menu_usage_count: asNumber(record.menu_usage_count ?? record.menuUsageCount),
    needs_review: asNumber(record.needs_review ?? record.needsReview),
    note: asText(record.note),
    safe_stock_qty: asNumber(record.safe_stock_qty ?? record.safeStockQty),
    like: asText(record.like ?? record.LIKE ?? record.is_like ?? record.isLike, 'N'),
  }
}

function normalizeTableMealsItem(record: RawRecord, index: number): TableMealsItem {
  return {
    table_id: asText(record.table_id ?? record.tableId, `table-${index + 1}`),
    account_id: asText(record.account_id ?? record.accountId),
    account_name: asText(record.account_name ?? record.accountName),
    table_name: asText(record.table_name ?? record.tableName ?? record.title, `식단표 ${index + 1}`),
    table_year: asNumber(record.table_year ?? record.tableYear, Number.NaN),
    table_month: asNumber(record.table_month ?? record.tableMonth, Number.NaN),
    table_week: asNumber(record.table_week ?? record.tableWeek, Number.NaN),
    source: asText(record.source) as TableMealsItem['source'],
    file_name: asText(record.file_name ?? record.fileName ?? record.org_file_name ?? record.orgFileName),
    created_at: asText(record.created_at ?? record.createdAt),
    meal_plan_type: asNumber(record.meal_plan_type ?? record.mealPlanType, 0),
  }
}

function normalizeTableMealsDetailItem(record: RawRecord, index: number): TableMealsDetailItem {
  return {
    table_id: asText(record.table_id ?? record.tableId),
    account_id: asText(record.account_id ?? record.accountId),
    account_name: asText(record.account_name ?? record.accountName),
    table_name: asText(record.table_name ?? record.tableName ?? record.title),
    meal_date: asText(record.meal_date ?? record.mealDate ?? record.date),
    weekday: asText(record.weekday ?? record.week_day ?? record.weekDay ?? record.day),
    meal_slot: asText(record.meal_slot ?? record.mealSlot ?? record.meal_type ?? record.mealType),
    sort_order: asNumber(record.sort_order ?? record.sortOrder, index + 1),
    menu_id: asText(record.menu_id ?? record.menuId),
    menu_name: asText(record.menu_name ?? record.menuName, `메뉴 ${index + 1}`),
    food_type: asNumber(record.food_type ?? record.foodType),
    menu_type: asNumber(record.menu_type ?? record.menuType),
    menu_gubun: asNumber(record.menu_gubun ?? record.menuGubun),
  }
}

function normalizeMealPlanAnalysisItem(record: RawRecord): MealPlanAnalysisItem {
  return {
    menu_id: asText(record.menu_id ?? record.menuId),
    menu_name: asText(record.menu_name ?? record.menuName),
    ingredient_id: asText(record.ingredient_id ?? record.ingredientId),
    required_qty: asNumber(record.required_base_qty ?? record.requiredBaseQty ?? record.required_qty ?? record.requiredQty),
    current_qty: asNumber(record.current_base_qty ?? record.currentBaseQty ?? record.current_qty ?? record.currentQty),
    shortage_qty: asNumber(record.shortage_base_qty ?? record.shortageBaseQty ?? record.shortage_qty ?? record.shortageQty),
    ingredient_name: asText(record.ingredient_name ?? record.ingredientName ?? record.product_name ?? record.productName),
    average_usage_qty: asNumber(record.average_usage_qty ?? record.averageUsageQty ?? record.avg_usage_qty ?? record.avgUsageQty),
    total_capacity_qty: asNumber(record.total_capacity_qty ?? record.totalCapacityQty ?? record.total_qty ?? record.totalQty ?? record.capacity_qty ?? record.capacityQty),
    last_used_at: asText(record.last_used_at ?? record.lastUsedAt ?? record.last_usage_date ?? record.lastUsageDate),
    menu_usage_count: asNumber(record.menu_usage_count ?? record.menuUsageCount),
  }
}

function readMealPlanAnalysisItems(payload: unknown) {
  const directItems = readArray(payload)
  if (directItems.length > 0) {
    return directItems
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const record = payload as RawRecord
  const data = record.data && typeof record.data === 'object' ? (record.data as RawRecord) : undefined
  const candidates = [record.ingredients, record.items, record.analysis, data?.ingredients, data?.items, data?.analysis]
  return candidates.find(Array.isArray) ?? []
}

export async function getAccountOptions(): Promise<AccountOption[]> {
  const response = await fetch(buildApiUrl('/Account/AccountList'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('거래처 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  return readArray(payload)
    .map((item) => normalizeAccountOption(item as RawRecord))
    .filter((item) => item.value !== '' || item.text !== '')
}

export async function getMenuManagerList(): Promise<MenuManagerItem[]> {
  const response = await fetch(buildApiUrl('/Menu/MenuList'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('메뉴 목록을 불러오지 못했습니다.')
  }

  const payload = await parseResponseBody(response)
  return readArray(payload)
    .map((item, index) => normalizeMenu(item as RawRecord, index))
    .filter((item) => item.menu_id !== '' || item.menu_name !== '')
}

export async function getLikeMenuManagerList(): Promise<MenuManagerItem[]> {
  const searchParams = new URLSearchParams({
    account_id: getLocalAccountId(),
    user_id: getLocalUserId(),
  })

  const response = await fetch(`${buildApiUrl('/Menu/LikeMenuList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('나만의 메뉴 목록을 불러오지 못했습니다.')
  }

  const payload = await parseResponseBody(response)
  return readArray(payload)
    .map((item, index) => normalizeMenu(item as RawRecord, index))
    .filter((item) => item.menu_id !== '' || item.menu_name !== '')
}

export async function getAccountMenuManagerList(accountId: string): Promise<MenuManagerItem[]> {
  const searchParams = new URLSearchParams({
    account_id: accountId,
  })

  const response = await fetch(`${buildApiUrl('/Menu/AccountMenuList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to load account menu list.')
  }

  const payload = (await response.json()) as unknown
  return readArray(payload)
    .map((item, index) => normalizeMenu(item as RawRecord, index))
    .filter((item) => item.menu_id !== '' || item.menu_name !== '')
}

export async function getMenuDetailList(menuId: string): Promise<MenuIngredientItem[]> {
  const searchParams = new URLSearchParams({
    menu_id: menuId,
    servingQty: '1',
  })

  const response = await fetch(`${buildApiUrl('/Menu/DetailList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식자재 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  return readArray(payload)
    .map((item) => normalizeIngredient(item as RawRecord))
    .filter((item) => item.ingredient_id !== '' || item.ingredient_name !== '')
}

export async function getAccountMenuDetailList(menuId: string): Promise<MenuIngredientItem[]> {
  const searchParams = new URLSearchParams({
    menu_id: menuId,
    servingQty: '1',
  })

  const response = await fetch(`${buildApiUrl('/Menu/AccountDetailList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식자재 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  return readArray(payload)
    .map((item) => normalizeIngredient(item as RawRecord))
    .filter((item) => item.ingredient_id !== '' || item.ingredient_name !== '')
}

export async function getIngredientOptions(): Promise<IngredientOption[]> {
  const response = await fetch(buildApiUrl('/Menu/IngredientsList'), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식자재 목록을 불러오지 못했습니다.')
  }

  const payload = await parseResponseBody(response)
  return readArray(payload)
    .map((item) => normalizeIngredientOption(item as RawRecord))
    .filter((item) => item.ingredient_id !== '' || item.ingredient_name !== '')
}

export async function getLikeIngredientOptions(): Promise<IngredientOption[]> {
  const searchParams = new URLSearchParams({
    account_id: getLocalAccountId(),
    user_id: getLocalUserId(),
  })

  const response = await fetch(`${buildApiUrl('/Menu/LikeIngredientsList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('나만의 식자재 목록을 불러오지 못했습니다.')
  }

  const payload = await parseResponseBody(response)
  return readArray(payload)
    .map((item) => normalizeIngredientOption(item as RawRecord))
    .filter((item) => item.ingredient_id !== '' || item.ingredient_name !== '')
}

export async function getTableMealsList(accountId: string, tableYear?: number, tableMonth?: number): Promise<TableMealsItem[]> {
  const searchParams = new URLSearchParams({
    account_id: accountId,
  })

  if (tableYear && tableMonth) {
    searchParams.set('table_year', String(tableYear))
    searchParams.set('table_month', String(tableMonth))
  }

  const response = await fetch(`${buildApiUrl('/v2/meal-plans')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식단표 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  return readArray(payload)
    .map((item, index) => normalizeTableMealsItem(item as RawRecord, index))
    .filter((item) => item.table_id !== '' || item.table_name !== '')
}

function appendTableMealsPeriod(searchParams: URLSearchParams, period?: TableMealsQueryPeriod) {
  if (!period) return

  searchParams.set('table_year', String(period.table_year))
  searchParams.set('table_month', String(period.table_month))
  searchParams.set('table_week', String(period.table_week))
  searchParams.set('start_date', period.start_date)
  searchParams.set('end_date', period.end_date)
}

export async function getTableMealsDetailList(
  accountId: string,
  tableId: string,
  period?: TableMealsQueryPeriod,
): Promise<TableMealsDetailItem[]> {
  const searchParams = new URLSearchParams({
    account_id: accountId,
    table_id: tableId,
  })
  appendTableMealsPeriod(searchParams, period)

  const response = await fetch(`${buildApiUrl('/v2/meal-plans/details')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식단표 상세를 불러오지 못했습니다.')
  }

  const payload = await parseResponseBody(response)
  return readArray(payload)
    .map((item, index) => normalizeTableMealsDetailItem(item as RawRecord, index))
    .filter((item) => item.menu_id !== '' || item.menu_name !== '')
}

export async function getMealPlanAnalysis(
  accountId: string,
  tableId: string,
  period?: TableMealsQueryPeriod,
): Promise<MealPlanAnalysisItem[]> {
  const searchParams = new URLSearchParams({
    account_id: accountId,
    table_id: tableId,
  })
  appendTableMealsPeriod(searchParams, period)

  const response = await fetch(`${buildApiUrl('/v2/procurement/analysis')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식단표 원가·재고 분석을 불러오지 못했습니다.')
  }

  const payload = await parseResponseBody(response)
  return readMealPlanAnalysisItems(payload)
    .map((item) => normalizeMealPlanAnalysisItem(item as RawRecord))
    .filter((item) => item.ingredient_id !== '' || item.ingredient_name !== '')
}

export type ProcurementCartFromMealPlanResult = {
  code: number
  message: string
  procurement_cart_id: number
  item_count: number
}

export async function createProcurementCartFromMealPlan(
  accountId: string,
  tableId: string,
): Promise<ProcurementCartFromMealPlanResult> {
  const response = await fetch(buildApiUrl('/v2/procurement/carts/from-meal-plan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_id: accountId,
      table_id: tableId,
      status: 'DRAFT',
      note: `식단표 자동 발주: ${tableId}`,
      user_id: getLocalUserId(),
    }),
  })
  const payload = await parseResponseBody(response) as Partial<ProcurementCartFromMealPlanResult> & { message?: string }
  if (!response.ok) {
    throw new Error(payload?.message ?? '부족 식자재를 발주 카트에 담지 못했습니다.')
  }
  return {
    code: Number(payload.code ?? 200),
    message: String(payload.message ?? 'success'),
    procurement_cart_id: Number(payload.procurement_cart_id ?? 0),
    item_count: Number(payload.item_count ?? 0),
  }
}

export async function saveTableMeals(payload: TableMealsSavePayload) {
  const userId = getLocalUserId()
  const tableId = `${payload.account_id}_${payload.table_year}_${payload.table_month}_${payload.table_week}_${payload.source}_${payload.meal_plan_type}`
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, user_id: userId }),
    })
    const result = await parseResponseBody(response)
    if (!response.ok) throw new Error((result as { message?: string } | null)?.message ?? '식단표 저장에 실패했습니다.')
    return result as { id?: string | number }
  }

  await post('/v2/meal-plans', { ...payload, table_id: tableId, status: 'DRAFT' })
  for (const meal of payload.meals) {
    const service = await post('/v2/meal-plans/services', {
      table_id: tableId,
      account_id: payload.account_id,
      meal_date: meal.meal_date,
      weekday: meal.weekday,
      meal_slot: meal.meal_slot,
      planned_servings: 1,
      meal_budget_per_person: 3500,
      status: 'DRAFT',
    })
    const mealServiceId = service.id
    for (const menu of meal.menus) {
      await post('/v2/meal-plans/details', {
        meal_service_id: mealServiceId,
        table_id: tableId,
        account_id: payload.account_id,
        ...menu,
      })
    }
    await post('/v2/meal-plans/recalculate', { meal_service_id: mealServiceId, account_id: payload.account_id })
  }
  return { code: 200, message: 'success', table_id: tableId }
}

export async function saveMenuManager(payload: MenuSavePayload) {
  const payloadForJson: MenuSavePayload = {
    ...payload,
    menus: await Promise.all(
      payload.menus.map(async (menu) => ({
        ...menu,
        menu_img: menu.menu_img instanceof File ? await readFileAsDataUrl(menu.menu_img) : menu.menu_img,
      })),
    ),
  }

  const response = await fetch(buildApiUrl('/Menu/MenuSave'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(withLocalUserId(payloadForJson)),
  })

  if (!response.ok) {
    throw new Error('메뉴 저장에 실패했습니다.')
  }

  return parseResponseBody(response)
}

export async function saveLikeMenu(menuId: string, like: 'Y' | 'N') {
  const response = await fetch(buildApiUrl('/Menu/LikeMenuSave'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(withLocalUserId({ menu_id: menuId, like, account_id: getLocalAccountId() })),
  })

  if (!response.ok) {
    throw new Error('나만의 메뉴 저장에 실패했습니다.')
  }

  return parseResponseBody(response)
}

export async function saveLikeIngredient(ingredientId: string, like: 'Y' | 'N') {
  const response = await fetch(buildApiUrl('/Menu/LikeIngredientsSave'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(withLocalUserId({ ingredient_id: ingredientId, like, account_id: getLocalAccountId() })),
  })

  if (!response.ok) {
    throw new Error('나만의 식자재 저장에 실패했습니다.')
  }

  return parseResponseBody(response)
}

export async function saveAccountMenuManager(payload: AccountMenuSavePayload) {
  const response = await fetch(buildApiUrl('/Menu/AccountMenuSave'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(withAccountMenuSaveMetadata(payload)),
  })

  if (!response.ok) {
    throw new Error('거래처 메뉴 저장에 실패했습니다.')
  }

  return parseResponseBody(response)
}
