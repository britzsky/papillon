export function normalizeQuantityUnit(unit: string) {
  const value = unit.trim().toLowerCase()
  return ({ '개': 'ea', '팩': 'pac', '봉': 'pac', '박스': 'box' } as Record<string, string>)[value] ?? value
}
export function convertQuantity(qty: number, from: string, to: string) {
  const a = normalizeQuantityUnit(from), b = normalizeQuantityUnit(to)
  if (!a || !b || !Number.isFinite(qty)) return 0
  if (a === b) return qty
  if ((a === 'kg' && b === 'g') || (a === 'l' && b === 'ml')) return qty * 1000
  if ((a === 'g' && b === 'kg') || (a === 'ml' && b === 'l')) return qty / 1000
  return 0
}
/**
 * 재고 현재고 입력 단위 (백엔드 InventoryService.allowedUnits와 같은 규칙):
 * 기준단위, 같은 차원의 큰 단위(g→kg, ml→L), 상품 발주단위(규격이 있을 때). 기준단위를 모르면(신규 행) null.
 */
export function stockInputUnits(baseUnit: string, orderUnit?: string, packageBaseQty?: number) {
  const base = baseUnit.trim()
  if (!base) return null
  const units = [base]
  const normalized = normalizeQuantityUnit(base)
  if (normalized === 'g') units.push('kg')
  if (normalized === 'ml') units.push('L')
  const order = (orderUnit ?? '').trim()
  if (order && (packageBaseQty ?? 0) > 0 && !units.some(unit => normalizeQuantityUnit(unit) === normalizeQuantityUnit(order))) units.push(order)
  return units
}
/** 상품 규격 후보 중 식재료 기준단위로 환산되는 첫 규격 (백엔드 QuantityUnits.packFor와 같은 규칙). 없으면 null */
export function pickPack(options: { base_qty: number; base_unit: string }[], ingredientUnit: string) {
  for (const option of options) {
    const converted = option.base_qty > 0 ? convertQuantity(option.base_qty, option.base_unit, ingredientUnit) : 0
    if (converted > 0) return { ...option, converted }
  }
  return null
}
