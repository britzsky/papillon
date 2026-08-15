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
    }
  })
}
