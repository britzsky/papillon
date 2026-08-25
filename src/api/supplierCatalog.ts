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

export function getHeadquartersBenchmarkProduct(products: SupplierProductOption[], ingredientId: string) {
  const candidates = products
    .filter((item) => item.ingredient_id === ingredientId && item.base_qty > 0 && item.current_price > 0)
    .sort((left, right) => {
      const leftPriority = left.supplier_code.toUpperCase().includes('WELSTORY') ? 0 : 1
      const rightPriority = right.supplier_code.toUpperCase().includes('WELSTORY') ? 0 : 1
      return leftPriority - rightPriority || left.current_price / left.base_qty - right.current_price / right.base_qty
    })
  return candidates[0]
}

type RawRecord = Record<string, unknown>

const text = (value: unknown) => value == null ? '' : String(value).trim()
const number = (value: unknown) => Number(value) || 0

export async function getSupplierProducts(): Promise<SupplierProductOption[]> {
  const response = await fetch(buildApiUrl('/v2/catalog/products?active_yn=Y'))
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
      current_price: number(row.current_price),
    }
  })
}

async function readResponse(response: Response, fallbackMessage: string) {
  const payload = await response.json() as { id?: number; message?: string }
  if (!response.ok) throw new Error(payload.message || fallbackMessage)
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
  effective_from: string
  user_id: string
}) {
  const response = await fetch(buildApiUrl('/v2/catalog/products-with-price'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, active_yn: 'Y' }),
  })
  const payload = await readResponse(response, '공급상품과 가격 등록에 실패했습니다.')
  const id = Number(payload.id)
  if (!Number.isFinite(id) || id <= 0) throw new Error('등록된 공급상품 ID를 확인하지 못했습니다.')
  return id
}
