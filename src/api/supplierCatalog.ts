import { getIngredientMasterList } from './inventory'
import { convertQuantity, normalizeQuantityUnit } from "../utils/quantityUnits"
import { buildApiUrl } from '../config/api'

export type SupplierProductOption = {
  supplier_product_id: number
  supplier_id: number
  supplier_code: string
  supplier_name: string
  ingredient_id: string
  supplier_item_code: string
  product_name: string
  order_unit: string
  package_qty: number
  package_unit: string
  base_qty: number
  base_unit: string
  current_price: number
}

export type SupplierOption = {
  supplier_id: number
  supplier_code: string
  supplier_name: string
}

export function getHeadquartersBenchmarkProduct(products: SupplierProductOption[], ingredientId: string, baseUnit?: string) {
  const candidates = products.filter(item => item.ingredient_id === ingredientId && item.base_qty > 0 && item.current_price > 0)
  const units = candidates.map(item => normalizeQuantityUnit(item.base_unit)).map(unit => unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit)
  const target = baseUnit || (new Set(units).size === 1 ? units[0] : '')
  if (!target) return undefined
  return candidates.filter(item => convertQuantity(item.base_qty, item.base_unit, target) > 0)
    .sort((a, b) => a.current_price / convertQuantity(a.base_qty, a.base_unit, target) - b.current_price / convertQuantity(b.base_qty, b.base_unit, target))[0]
}

type RawRecord = Record<string, unknown>

const text = (value: unknown) => value == null ? '' : String(value).trim()
const number = (value: unknown) => Number(value) || 0

export async function getSupplierProducts(requestedAccountId?: string, purpose: 'order' | 'menu' = 'order'): Promise<SupplierProductOption[]> {
  const accountId = requestedAccountId?.trim()
    || (typeof window !== 'undefined' ? localStorage.getItem('account_id')?.trim() ?? '' : '')
  const deliveryDate = new Date().toLocaleDateString('sv-SE')
  const query = new URLSearchParams({ account_id: accountId, delivery_date: deliveryDate, orderable_only: 'Y' })
  const endpoint = purpose === 'menu' ? `/v2/catalog/account-products?${new URLSearchParams({ account_id: accountId, active_yn: 'Y' })}` : `/v2/supplier-integration/offers?${query}`
  const response = await fetch(buildApiUrl(endpoint))
  if (!response.ok) throw new Error('공급처 상품 목록을 불러오지 못했습니다.')
  const payload = await response.json() as unknown
  const rows = Array.isArray(payload) ? payload : []

  return rows.map((value) => {
    const row = value as RawRecord
    return {
      supplier_product_id: number(row.supplier_product_id),
      supplier_id: number(row.supplier_id),
      supplier_code: text(row.supplier_code),
      supplier_name: text(row.supplier_name),
      ingredient_id: text(row.ingredient_id),
      supplier_item_code: text(row.supplier_item_code),
      product_name: text(row.product_name),
      order_unit: text(row.order_unit),
      package_qty: number(row.package_qty),
      package_unit: text(row.package_unit),
      base_qty: number(row.base_qty),
      base_unit: text(row.base_unit),
      current_price: number(row.current_price ?? row.purchase_price),
    }
  })
}

// Menu display uses only products already linked to this account.
export function getMenuSupplierProducts(accountId: string): Promise<SupplierProductOption[]> {
  return getSupplierProducts(accountId, 'menu')
}

async function readResponse(response: Response, fallbackMessage: string) {
  const payload = await response.json() as { id?: number; code?: number; message?: string }
  if (!response.ok || (payload.code !== undefined && payload.code !== 200)) throw new Error(payload.message || fallbackMessage)
  return payload
}

export async function getSuppliers(): Promise<SupplierOption[]> {
  const response = await fetch(buildApiUrl('/v2/catalog/suppliers?active_yn=Y'))
  if (!response.ok) throw new Error('공급처 목록을 불러오지 못했습니다.')
  const payload = await response.json() as unknown
  return (Array.isArray(payload) ? payload : []).map((value) => {
    const row = value as RawRecord
    return {
      supplier_id: number(row.supplier_id),
      supplier_code: text(row.supplier_code),
      supplier_name: text(row.supplier_name),
    }
  })
}

export async function createSupplierProductWithPrice(input: {
  supplier_product_id?: number
  supplier_id: number
  ingredient_id: string
  supplier_item_code: string
  product_name: string
  order_unit: string
  package_qty: number
  package_unit: string
  base_qty: number
  base_unit: string
  purchase_price: number
  effective_from?: string
  user_id: string
}) {
  const response = await fetch(buildApiUrl('/v2/catalog/products-with-price'), {
    method: input.supplier_product_id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, active_yn: 'Y' }),
  })
  const payload = await readResponse(response, '공급상품과 가격 저장에 실패했습니다.')
  const id = Number(payload.id)
  if (!Number.isFinite(id) || id <= 0) throw new Error('저장된 공급상품 ID를 확인하지 못했습니다.')
  return id
}

// Use exactly the product and current management price shown in ingredient management.
export async function getHeadquartersProducts(): Promise<SupplierProductOption[]> {
  const rows = await getIngredientMasterList()
  return rows.filter(row => row.supplier_product_id > 0).map(row => ({
    supplier_product_id: row.supplier_product_id,
    supplier_id: row.supplier_id,
    supplier_code: '',
    supplier_name: row.supplier_name,
    ingredient_id: row.ingredient_id,
    supplier_item_code: row.supplier_item_code,
    product_name: row.product_name,
    order_unit: row.product_order_unit,
    package_qty: row.package_qty,
    package_unit: row.package_unit,
    base_qty: row.package_base_qty,
    base_unit: row.base_unit,
    current_price: row.purchase_price,
  }))
}
