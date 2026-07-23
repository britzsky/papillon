import { buildApiUrl } from '../config/api'

export type AccountInventoryItem = {
  menu_id?: string
  menu_name?: string
  ingredient_id: string
  location_id?: string
  ingredient_name: string
  category_name?: string
  required_qty: number
  qty_num?: number
  qty_unit?: string
  current_qty: number
  safe_stock_qty: number
  shortage_qty: number
  order_needed_qty: number
  base_unit: string
  order_unit: string
  convert_value: number
  menu_usage_count?: number
}

export type AccountInventorySavePayload = {
  account_id: string
  inventory_items: Array<AccountInventoryItem & {
    row_id?: string
  }>
}

type RawRecord = Record<string, unknown>

function getLocalUserId() {
  return typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : ''
}

function getLocalAccountId() {
  return typeof window !== 'undefined' ? localStorage.getItem('account_id') ?? '' : ''
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

function readArray(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data
  }

  return []
}

function normalizeAccountInventoryItem(record: RawRecord): AccountInventoryItem {
  const qtyNum = asNumber(record.qty_num ?? record.qtyNum ?? record.required_qty ?? record.requiredQty)

  return {
    menu_id: asText(record.menu_id ?? record.menuId),
    menu_name: asText(record.menu_name ?? record.menuName),
    ingredient_id: asText(record.ingredient_id ?? record.ingredientId),
    location_id: asText(record.location_id ?? record.locationId),
    ingredient_name: asText(record.ingredient_name ?? record.ingredientName),
    category_name: asText(record.category_name ?? record.categoryName),
    required_qty: qtyNum,
    qty_num: qtyNum,
    qty_unit: asText(record.qty_unit ?? record.qtyUnit ?? record.base_unit ?? record.baseUnit ?? record.order_unit ?? record.orderUnit),
    current_qty: asNumber(record.current_qty ?? record.currentQty),
    safe_stock_qty: asNumber(record.safe_stock_qty ?? record.safeStockQty),
    shortage_qty: asNumber(record.shortage_qty ?? record.shortageQty),
    order_needed_qty: asNumber(record.order_needed_qty ?? record.orderNeededQty),
    base_unit: asText(record.base_unit ?? record.baseUnit),
    order_unit: asText(record.order_unit ?? record.orderUnit),
    convert_value: asNumber(record.convert_value ?? record.convertValue),
    menu_usage_count: asNumber(record.menu_usage_count ?? record.menuUsageCount),
  }
}

export async function getAccountInventoryList(accountId = getLocalAccountId()): Promise<AccountInventoryItem[]> {
  const searchParams = new URLSearchParams({
    account_id: accountId,
  })

  const response = await fetch(`${buildApiUrl('/Inventory/AccountInventoryList')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('거래처 재고 목록을 불러오지 못했습니다.')
  }

  const payload = (await response.json()) as unknown
  return readArray(payload)
    .map((item) => normalizeAccountInventoryItem(item as RawRecord))
    .filter((item) => item.ingredient_id !== '' || item.ingredient_name !== '')
}

export async function saveAccountInventory(payload: AccountInventorySavePayload) {
  const accountId = payload.account_id || getLocalAccountId()

  const response = await fetch(buildApiUrl('/Inventory/AccountInventorySave'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      account_id: accountId,
      user_id: getLocalUserId(),
      inventory_items: payload.inventory_items.map((item) => ({
        ...item,
        account_id: accountId,
        user_id: getLocalUserId(),
      })),
    }),
  })

  if (!response.ok) {
    throw new Error('거래처 재고 저장에 실패했습니다.')
  }

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
