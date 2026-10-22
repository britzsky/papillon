import type { AccountInventoryItem } from '../../api/inventory'
import { getIngredientStockStatus } from '../../utils/ingredientStockStatus'

/** 거래처 재고 화면 공용(PC·터치): 보관위치, 재고 상태, 정렬·검색. */

export const LOCATION_OPTIONS = [
  { value: 'L001', text: '상온창고' },
  { value: 'L002', text: '냉장고1' },
  { value: 'L003', text: '냉동고1' },
  { value: 'L999', text: '기타/미분류' },
] as const

export function getLocationName(locationId?: string) {
  const labels: Record<string, string> = {
    L001: '상온창고',
    L002: '냉장고',
    L003: '냉동고',
    L999: '기타/미분류',
  }
  return locationId ? labels[locationId] ?? locationId : '-'
}

export function getInventoryStockStatus(item: AccountInventoryItem) {
  if (item.stock_status === 'RED') return { emoji: '🔴', label: '즉시 재고 부족', needsOrder: true }
  if (item.stock_status === 'ORANGE') return { emoji: '🟠', label: '안전재고·입고예정량 반영 후 부족', needsOrder: true }
  if (item.stock_status === 'YELLOW') return { emoji: '🟡', label: '최근 사용 이력 없음 · 총용량 대비 재고 30% 이하', needsOrder: false }
  if (item.stock_status === 'EMPTY') return { emoji: '⚪', label: '재고 없음 · 필요량 미산정', needsOrder: false }
  if (item.stock_status === 'UNKNOWN') return { emoji: '⚪', label: '사용 이력 없음 · 적정재고 판단 불가', needsOrder: false }
  if (item.stock_status === 'GREEN') return { emoji: '🟢', label: '안전재고·입고예정량 반영 후 충족', needsOrder: false }
  return getIngredientStockStatus(item)
}

/**
 * 재고가 있는 상품을 먼저(같은 그룹 안에서는 서버의 위험도 순서 유지). 연결만 되고 입고 전인 0 재고 상품이 많으면
 * 방금 입고한 상품이 뒤로 밀려 '반영 안 됨'처럼 보였다.
 */
export function orderStockFirst<T extends AccountInventoryItem>(items: T[]) {
  return [...items].sort((a, b) => Number(Number(b.current_base_qty) > 0) - Number(Number(a.current_base_qty) > 0))
}

/** 식자재·상품명·코드·카테고리·위치로 찾기 */
export function matchesInventoryKeyword(item: AccountInventoryItem, keyword: string) {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return true
  return [item.menu_name, item.ingredient_name, item.product_name, item.supplier_item_code, item.category_name, item.location_id, getLocationName(item.location_id)]
    .filter(Boolean)
    .some(value => value?.toLowerCase().includes(normalized))
}

/** 발주하기 화면으로 가는 주소(재고 화면의 '발주하러 가기') */
export function inventoryOrderPath(accountId: string, item: AccountInventoryItem) {
  const params = new URLSearchParams({ account_id: accountId, ingredient_id: item.ingredient_id })
  params.set('source', 'INVENTORY')
  return `/order_manager/food_order?${params.toString()}`
}
