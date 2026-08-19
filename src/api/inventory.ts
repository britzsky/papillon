import { buildApiUrl } from '../config/api'

export type AccountInventoryItem = {
  inventory_balance_id?: number
  account_ingredient_product_id?: number
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
  current_base_qty: number
  current_unit: string
  safe_stock_qty: number
  shortage_qty: number
  order_needed_qty: number
  base_unit: string
  order_unit: string
  convert_value: number
  menu_usage_count?: number
  average_usage_qty?: number
  total_capacity_qty?: number
  last_used_at?: string
  supplier_name?: string
  supplier_product_id?: number
  purchase_price?: number
  package_base_qty?: number
  product_name?: string
  supplier_item_code?: string
  stock_status?: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN'
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

function convertBaseQtyToDisplay(qty: number, baseUnit: string, displayUnit: string) {
  const normalizedBase = baseUnit.toLowerCase()
  const normalizedDisplay = displayUnit.toLowerCase()
  if ((normalizedBase === 'g' && normalizedDisplay === 'kg') || (normalizedBase === 'ml' && normalizedDisplay === 'l')) {
    return qty / 1000
  }
  return qty
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
  const baseUnit = asText(record.base_unit ?? record.baseUnit)
  const currentUnit = asText(record.current_unit ?? record.currentUnit, baseUnit)
  const currentBaseQty = asNumber(record.current_base_qty ?? record.currentBaseQty ?? record.current_qty ?? record.currentQty)

  return {
    inventory_balance_id: asNumber(record.inventory_balance_id ?? record.inventoryBalanceId),
    account_ingredient_product_id: asNumber(record.account_ingredient_product_id ?? record.accountIngredientProductId),
    menu_id: asText(record.menu_id ?? record.menuId),
    menu_name: asText(record.menu_name ?? record.menuName),
    ingredient_id: asText(record.ingredient_id ?? record.ingredientId),
    location_id: asText(record.location_id ?? record.locationId),
    ingredient_name: asText(record.ingredient_name ?? record.ingredientName ?? record.product_name ?? record.productName),
    category_name: asText(record.category_name ?? record.categoryName),
    required_qty: qtyNum,
    qty_num: qtyNum,
    qty_unit: asText(record.qty_unit ?? record.qtyUnit ?? record.base_unit ?? record.baseUnit ?? record.order_unit ?? record.orderUnit),
    current_qty: convertBaseQtyToDisplay(currentBaseQty, baseUnit, currentUnit),
    current_base_qty: currentBaseQty,
    current_unit: currentUnit,
    safe_stock_qty: asNumber(record.safe_stock_base_qty ?? record.safeStockBaseQty ?? record.safe_stock_qty ?? record.safeStockQty),
    shortage_qty: asNumber(record.shortage_qty ?? record.shortageQty),
    order_needed_qty: asNumber(record.order_needed_qty ?? record.orderNeededQty),
    base_unit: baseUnit,
    order_unit: asText(record.order_unit ?? record.orderUnit),
    convert_value: asNumber(record.convert_value ?? record.convertValue),
    menu_usage_count: asNumber(record.menu_usage_count ?? record.menuUsageCount),
    average_usage_qty: asNumber(record.average_usage_qty ?? record.averageUsageQty ?? record.avg_daily_usage),
    total_capacity_qty: asNumber(record.total_capacity_qty ?? record.totalCapacityQty ?? record.max_stock_base_qty),
    last_used_at: asText(record.last_used_at ?? record.lastUsedAt ?? record.last_out_at),
    supplier_name: asText(record.supplier_name ?? record.supplierName),
    supplier_product_id: asNumber(record.supplier_product_id ?? record.supplierProductId),
    purchase_price: asNumber(record.purchase_price ?? record.purchasePrice),
    package_base_qty: asNumber(record.package_base_qty ?? record.packageBaseQty),
    product_name: asText(record.product_name ?? record.productName),
    supplier_item_code: asText(record.supplier_item_code ?? record.supplierItemCode),
    stock_status: asText(record.stock_status ?? record.stockStatus, 'GREEN') as AccountInventoryItem['stock_status'],
  }
}

export async function getAccountInventoryList(accountId = getLocalAccountId()): Promise<AccountInventoryItem[]> {
  const searchParams = new URLSearchParams({
    account_id: accountId,
  })

  const response = await fetch(`${buildApiUrl('/v2/inventory')}?${searchParams.toString()}`, {
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
  return Promise.all(payload.inventory_items.map(async (item) => {
    const isUpdate = Boolean(item.inventory_balance_id)
    if (!isUpdate && !item.account_ingredient_product_id) {
      throw new Error('신규 재고는 먼저 거래처 공급처 상품을 선택해야 합니다.')
    }
    const response = await fetch(buildApiUrl('/v2/inventory'), {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventory_balance_id: item.inventory_balance_id,
        account_id: accountId,
        account_ingredient_product_id: item.account_ingredient_product_id,
        location_id: item.location_id || 'L999',
        current_qty: item.current_qty,
        current_unit: item.current_unit || item.base_unit,
        base_unit: item.base_unit,
        user_id: getLocalUserId(),
      }),
    })
    if (!response.ok) throw new Error('거래처 재고 저장에 실패했습니다.')
    return response.json() as Promise<unknown>
  }))
}
