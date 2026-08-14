import { buildApiUrl } from '../config/api'

export type MenuCategory = '한식' | '중식' | '일식' | '양식' | '분식' | '간식' | '기타'
export type MealType = '조식' | '중식' | '석식'

export type OrderMenu = {
  menu_id: string
  food_type: MenuCategory
  meal_category: MenuCategory
  menu_type: string
  menu_name: string
  created_at?: string
  user_id?: string
  del_yn?: string
}

export type OrderDetailItem = {
  menu_id: string
  ingredient_id: string
  ingredient_name: string
  required_qty: number
  current_qty: number
  shortage_qty: number
  order_needed_qty: number
  base_unit: string
  order_unit: string
  convert_value: number
  average_usage_qty?: number
  total_capacity_qty?: number
  last_used_at?: string
  menu_usage_count?: number
}

type RawMenu = Record<string, unknown>
type RawOrderDetail = Record<string, unknown>

function getLocalAccountId() {
  return typeof window !== 'undefined' ? localStorage.getItem('account_id') ?? '' : ''
}

const categoryByFoodType: Record<number, MenuCategory> = {
  1: '한식',
  2: '중식',
  3: '일식',
  4: '양식',
  5: '분식',
  6: '간식',
  7: '기타',
}

const menuCategories = new Set<MenuCategory>(['한식', '중식', '일식', '양식', '분식', '간식', '기타'])

function asNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
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

function toCategory(menu: RawMenu): MenuCategory {
  const text = asText(menu.meal_category ?? menu.mealCategory ?? menu.category ?? menu.menuCategory ?? menu.categoryName ?? menu.cuisineType ?? menu.cuisine)
  if (menuCategories.has(text as MenuCategory)) {
    return text as MenuCategory
  }

  const foodType = asNumber(menu.food_type, Number.NaN)
  return Number.isFinite(foodType) && categoryByFoodType[foodType] ? categoryByFoodType[foodType] : '기타'
}

function normalizeMenu(menu: RawMenu, index: number): OrderMenu {
  const mealCategory = toCategory(menu)

  return {
    menu_id: asText(menu.menu_id),
    food_type: mealCategory,
    meal_category: mealCategory,
    menu_type: asText(menu.menu_type ?? menu.menuType),
    menu_name: asText(menu.menu_name, `메뉴 ${index + 1}`),
    created_at: asText(menu.created_at),
    user_id: asText(menu.user_id),
    del_yn: asText(menu.del_yn, 'N'),
  }
}

function isAvailableMenu(menu: OrderMenu) {
  return menu.menu_id !== '' && menu.menu_name !== '' && menu.del_yn !== 'Y'
}

function normalizeOrderDetail(detail: RawOrderDetail): OrderDetailItem {
  return {
    menu_id: asText(detail.menu_id),
    ingredient_id: asText(detail.ingredient_id),
    ingredient_name: asText(detail.ingredient_name),
    required_qty: asNumber(detail.required_qty, 0),
    current_qty: asNumber(detail.current_qty, 0),
    shortage_qty: asNumber(detail.shortage_qty, 0),
    order_needed_qty: asNumber(detail.order_needed_qty, 0),
    base_unit: asText(detail.base_unit),
    order_unit: asText(detail.order_unit),
    convert_value: asNumber(detail.convert_value, 0),
    average_usage_qty: asNumber(detail.average_usage_qty ?? detail.averageUsageQty ?? detail.avg_usage_qty ?? detail.avgUsageQty, 0),
    total_capacity_qty: asNumber(detail.total_capacity_qty ?? detail.totalCapacityQty ?? detail.total_qty ?? detail.totalQty ?? detail.capacity_qty ?? detail.capacityQty, 0),
    last_used_at: asText(detail.last_used_at ?? detail.lastUsedAt ?? detail.last_usage_date ?? detail.lastUsageDate),
    menu_usage_count: asNumber(detail.menu_usage_count ?? detail.menuUsageCount, 0),
  }
}

export async function getOrderMenuList(): Promise<OrderMenu[]> {
  const searchParams = new URLSearchParams({
    account_id: getLocalAccountId(),
  })

  const response = await fetch(`${buildApiUrl('/Menu/AccountMenuList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('메뉴 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  const rawMenus = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data as unknown[])
      : []

  return rawMenus
    .map((menu, index) => normalizeMenu(menu as RawMenu, index))
    .filter(isAvailableMenu)
}

export async function getOrderDetailList(menuId: string, servingQty: number, menuType = ''): Promise<OrderDetailItem[]> {
  const searchParams = new URLSearchParams({
    account_id: getLocalAccountId(),
    menu_id: menuId,
    servingQty: String(servingQty),
  })
  if (menuType) {
    searchParams.set('menu_type', menuType)
  }

  const response = await fetch(`${buildApiUrl('/Menu/AccountDetailList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('식재료 상세 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  const rawDetails = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data as unknown[])
      : []

  return rawDetails
    .map((detail) => normalizeOrderDetail(detail as RawOrderDetail))
    .filter((detail) => detail.ingredient_id !== '' || detail.ingredient_name !== '')
}
