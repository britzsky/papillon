import { convertQuantity } from "../utils/quantityUnits"
import { API_ORIGIN, buildApiUrl } from '../config/api'
import { getProductImageUrl, getProductOriginalImageUrl } from '../utils/productImage'

export type AccountInventoryItem = {
  image_url?: string
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
  average_unit_cost?: number
  inventory_amount?: number
  /** 기초재고 등록 가능 여부 (입고·사용·기초재고 이력이 없을 때 true) */
  opening_available?: boolean
  /** 기초재고 추정 단가(재고 기준단위당). 공급가·최근 입고 기반, 등록 가능한 행에만 */
  estimated_unit_cost?: number
  /** 추정 단가 출처: MANUAL(직접 입력 예상 단가)/SITE_PRICE/COMMON_PRICE/SITE_PRICE_NEAREST/COMMON_PRICE_NEAREST/RECENT_RECEIPT */
  estimated_cost_source?: string
  estimated_cost_date?: string
  /** 기초재고를 추정 단가로 등록했는지 */
  opening_cost_estimated?: boolean
  /** 공급사 코드. DIRECT = 직접구매(마트·쿠팡 등) 거래처 자체 상품 */
  supplier_code?: string
  product_name?: string
  supplier_item_code?: string
  stock_status?: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'EMPTY' | 'UNKNOWN'
}

export type AccountInventorySavePayload = {
  account_id: string
  inventory_items: Array<AccountInventoryItem & {
    row_id?: string
  }>
}

// 본사에서 공통으로 사용하는 식자재 마스터와 기준 공급가격이다.
export type IngredientMasterItem = {
  image_url?: string
  full_image_url?: string
  ingredient_id: string
  ingredient_name: string
  category_name: string
  storage_type: string
  base_unit: string
  order_unit: string
  convert_value: number
  safe_stock_qty: number
  menu_usage_count: number
  note: string
  supplier_name: string
  supplier_product_id: number
  supplier_id: number
  supplier_item_code: string
  product_name: string
  product_order_unit: string
  package_qty: number
  package_unit: string
  purchase_price: number
  package_base_qty: number
  is_new?: boolean
}

type RawRecord = Record<string, unknown>

export function getLocalUserId() {
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

const convertBaseQtyToDisplay = convertQuantity

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
    image_url: getProductImageUrl(record, API_ORIGIN),
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
    average_unit_cost: asNumber(record.average_unit_cost ?? record.averageUnitCost),
    inventory_amount: asNumber(record.inventory_amount ?? record.inventoryAmount),
    opening_available: asText(record.opening_available) === 'Y',
    estimated_unit_cost: record.estimated_unit_cost == null ? undefined : asNumber(record.estimated_unit_cost),
    estimated_cost_source: asText(record.estimated_cost_source) || undefined,
    estimated_cost_date: asText(record.estimated_cost_date) || undefined,
    opening_cost_estimated: asText(record.opening_cost_estimated) === 'Y',
    supplier_code: asText(record.supplier_code ?? record.supplierCode) || undefined,
    product_name: asText(record.product_name ?? record.productName),
    supplier_item_code: asText(record.supplier_item_code ?? record.supplierItemCode),
    stock_status: asText(record.stock_status ?? record.stockStatus, 'UNKNOWN') as AccountInventoryItem['stock_status'],
  }
}

/** 추정 단가 출처 표시 이름 */
export const ESTIMATED_COST_SOURCE_LABELS: Record<string, string> = {
  MANUAL: '직접 입력한 예상 단가', SITE_PRICE: '거래처 공급가', COMMON_PRICE: '공통 공급가',
  SITE_PRICE_NEAREST: '가까운 날짜 거래처 공급가', COMMON_PRICE_NEAREST: '가까운 날짜 공통 공급가', RECENT_RECEIPT: '최근 입고 단가',
}

/**
 * 기초재고 등록: 도입 전부터 보유한 재고를 수량과 기준단위당 단가로 등록한다.
 * 백엔드가 평균단가·재고금액을 설정하고 OPENING 이력을 남긴다. 재고행당 한 번만 가능.
 * unit_cost를 생략하면 서버가 공급가 기반 추정 단가로 등록하고 '추정'으로 표시한다.
 */
export async function registerOpeningStock(input: {
  inventory_balance_id: number; current_qty: number; current_unit: string; unit_cost?: number
}) {
  const response = await fetch(buildApiUrl('/v2/inventory/opening'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, user_id: getLocalUserId() }),
  })
  const payload = await response.json().catch(() => null) as { message?: string } | null
  if (!response.ok) throw new Error(payload?.message || '기초재고 등록에 실패했습니다.')
  return payload
}

export type DirectPurchaseInput = {
  account_id: string
  ingredient_id: string
  ingredient_name?: string
  /** 기존 직접구매 상품을 고르면 그 상품으로 기록. 없으면 product_name으로 찾거나 새로 만든다 */
  account_ingredient_product_id?: number
  product_name?: string
  purchase_date: string
  quantity: number
  unit: string
  total_amount: number
  expiration_date?: string
  origin?: string
  /** 같은 요청 재시도 시 중복 반영 방지 */
  request_key: string
}

export type DirectPurchaseResult = {
  replayed: boolean
  product_created: boolean
  preferred?: boolean
  product_name: string
  base_qty: number
  base_unit: string
  total_amount: number
  unit_cost: number
}

/** 마트·쿠팡 등 직접구매 기록. 첫 구매면 거래처 자체 '직접구매' 상품이 자동으로 만들어지고 재고에 입고된다. */
export async function recordDirectPurchase(input: DirectPurchaseInput): Promise<DirectPurchaseResult> {
  const response = await fetch(buildApiUrl('/v2/inventory/direct-purchases'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, user_id: getLocalUserId() }),
  })
  const payload = await response.json().catch(() => null) as (DirectPurchaseResult & { message?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.message || '직접구매 기록에 실패했습니다.')
  return payload
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
    if (!response.ok) {
      // 서버가 알려주는 실패 이유(예: 단위 환산 불가)를 그대로 보여준다
      const detail = await response.json().catch(() => null) as { message?: string } | null
      const name = item.product_name || item.ingredient_name
      throw new Error(`${name ? `[${name}] ` : ''}${detail?.message || '거래처 재고 저장에 실패했습니다.'}`)
    }
    return response.json() as Promise<unknown>
  }))
}

function normalizeIngredientMasterItem(record: RawRecord): IngredientMasterItem {
  return {
    image_url: getProductImageUrl(record, API_ORIGIN),
    full_image_url: getProductOriginalImageUrl(record, API_ORIGIN),
    ingredient_id: asText(record.ingredient_id ?? record.ingredientId),
    ingredient_name: asText(record.ingredient_name ?? record.ingredientName ?? record.ingredient_name_std),
    category_name: asText(record.category_name ?? record.categoryName),
    storage_type: asText(record.storage_type ?? record.storageType),
    base_unit: asText(record.base_unit ?? record.baseUnit),
    order_unit: asText(record.order_unit ?? record.orderUnit),
    convert_value: asNumber(record.convert_value ?? record.convertValue, 1),
    safe_stock_qty: asNumber(record.safe_stock_qty ?? record.safeStockQty),
    menu_usage_count: asNumber(record.menu_usage_count ?? record.menuUsageCount),
    note: asText(record.note),
    supplier_name: asText(record.supplier_name ?? record.supplierName),
    supplier_product_id: asNumber(record.supplier_product_id ?? record.supplierProductId),
    supplier_id: asNumber(record.supplier_id ?? record.supplierId),
    supplier_item_code: asText(record.supplier_item_code ?? record.supplierItemCode),
    product_name: asText(record.product_name ?? record.productName),
    product_order_unit: asText(record.product_order_unit ?? record.productOrderUnit),
    package_qty: asNumber(record.package_qty ?? record.packageQty, 1),
    package_unit: asText(record.package_unit ?? record.packageUnit),
    purchase_price: asNumber(record.purchase_price ?? record.purchasePrice),
    package_base_qty: asNumber(record.package_base_qty ?? record.packageBaseQty),
  }
}

// 거래처 재고와 분리된 본사 식자재 마스터 전용 API다.
export async function getIngredientMasterList(): Promise<IngredientMasterItem[]> {
  const response = await fetch(buildApiUrl('/v2/ingredients'), { headers: { 'Content-Type': 'application/json' } })
  if (!response.ok) throw new Error('본사 식자재 마스터를 불러오지 못했습니다.')
  return readArray(await response.json()).map((item) => normalizeIngredientMasterItem(item as RawRecord))
}

export async function saveIngredientMasters(items: IngredientMasterItem[]) {
  return Promise.all(items.map(async (item) => {
    const payload = { ...item }
    delete payload.image_url // Display-only field; preserve the existing save contract.
    delete payload.full_image_url
    const response = await fetch(buildApiUrl('/v2/ingredients'), {
      method: item.is_new ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, user_id: getLocalUserId() }),
    })
    const result = await response.json() as { message?: string }
    if (!response.ok) throw new Error(result.message ?? '본사 식자재 마스터 저장에 실패했습니다.')
    return result
  }))
}

/** 재고 변동 이력 한 건 (GET /v2/inventory/movements). 근거 업무(식사·입고·발주)는 조회 시 함께 붙는다 */
export type InventoryMovement = {
  movement_id: string
  movement_at: string
  movement_type: string
  account_ingredient_product_id: number
  ingredient_id?: string
  ingredient_name?: string
  product_name?: string
  supplier_name?: string
  supplier_item_code?: string
  location_id?: string
  quantity_before: number
  quantity_after: number
  quantity_delta: number
  base_unit: string
  unit_cost_snapshot?: number
  amount_delta?: number
  reference_type?: string
  reference_id?: string
  user_id?: string
  /** MEAL_SERVICE: 식사일·식사구분·메뉴 */
  meal_date?: string
  meal_slot_name?: string
  menu_name?: string
  /** GOODS_RECEIPT: 입고일·발주 */
  receipt_date?: string
  purchase_order_id?: string
  requested_delivery_date?: string
}

/** 변동 구분별 합계 (GET /v2/inventory/movements/summary). quantity_sum은 unit_count가 1일 때만 의미가 있다 */
export type InventoryMovementSummary = {
  movement_type: string
  movement_count: number
  quantity_sum: number
  amount_sum: number
  unit_count: number
  base_unit: string
}

export type InventoryMovementQuery = {
  account_id: string
  date_from?: string
  date_to?: string
  keyword?: string
  /** 쉼표 목록. IN/OUT/ADJUST/RETURN/DISCARD/OPENING */
  movement_type?: string
  account_ingredient_product_id?: string
  ingredient_id?: string
  limit?: number
  offset?: number
}

function movementSearch(query: InventoryMovementQuery) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
  return params.toString()
}

async function readJson<T>(path: string, signal: AbortSignal | undefined, failure: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), { signal })
  const payload = await response.json().catch(() => null) as (T & { message?: string }) | null
  if (!response.ok || !payload) throw new Error((payload as { message?: string } | null)?.message || failure)
  return payload
}

export async function getInventoryMovements(query: InventoryMovementQuery, signal?: AbortSignal) {
  const rows = await readJson<unknown>(`/v2/inventory/movements?${movementSearch(query)}`, signal, '재고 이력을 불러오지 못했습니다.')
  return readArray(rows) as InventoryMovement[]
}

export async function getInventoryMovementSummary(query: InventoryMovementQuery, signal?: AbortSignal) {
  const filter = movementSearch({ ...query, limit: undefined, offset: undefined })
  const rows = await readJson<unknown>(`/v2/inventory/movements/summary?${filter}`, signal, '재고 이력 합계를 불러오지 못했습니다.')
  return readArray(rows).map(row => {
    const record = row as RawRecord
    return {
      movement_type: asText(record.movement_type),
      movement_count: asNumber(record.movement_count),
      quantity_sum: asNumber(record.quantity_sum),
      amount_sum: asNumber(record.amount_sum),
      unit_count: asNumber(record.unit_count),
      base_unit: asText(record.base_unit),
    } satisfies InventoryMovementSummary
  })
}
