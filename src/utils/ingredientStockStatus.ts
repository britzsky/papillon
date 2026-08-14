export type IngredientStockSnapshot = {
  required_qty?: number
  current_qty?: number
  shortage_qty?: number
  average_usage_qty?: number
  total_capacity_qty?: number
  last_used_at?: string
  menu_usage_count?: number
  safe_stock_qty?: number
}

export type IngredientStockLevel = 'urgent' | 'forecast' | 'low-unused' | 'normal'

export type IngredientStockStatus = {
  level: IngredientStockLevel
  emoji: '🔴' | '🟠' | '🟡' | '🟢'
  label: string
  needsOrder: boolean
}

function positive(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : 0
}

export function getIngredientStockStatus(item: IngredientStockSnapshot): IngredientStockStatus {
  const current = Math.max(0, item.current_qty ?? 0)
  const required = positive(item.required_qty)
  const shortage = positive(item.shortage_qty)
  const averageUsage = positive(item.average_usage_qty)
  const totalCapacity = positive(item.total_capacity_qty)
  const hasUsageHistory = Boolean(item.last_used_at) || positive(item.menu_usage_count) > 0

  if (shortage > 0 || (required > 0 && current < required)) {
    return { level: 'urgent', emoji: '🔴', label: '즉시 재고 부족', needsOrder: true }
  }

  if (averageUsage > 0 && current < averageUsage) {
    return { level: 'forecast', emoji: '🟠', label: '평균 사용량 대비 부족 예상', needsOrder: true }
  }

  if (!hasUsageHistory && current > 0 && totalCapacity > 0 && current / totalCapacity <= 0.3) {
    return { level: 'low-unused', emoji: '🟡', label: '최근 사용 이력 없음 · 재고 30% 이하', needsOrder: false }
  }

  return { level: 'normal', emoji: '🟢', label: '재고 정상', needsOrder: false }
}

export function getAverageUsage(item: IngredientStockSnapshot) {
  return positive(item.average_usage_qty)
}
