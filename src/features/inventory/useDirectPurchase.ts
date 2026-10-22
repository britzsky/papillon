import { useEffect, useMemo, useRef, useState } from 'react'
import { buildApiUrl } from '../../config/api'
import { recordDirectPurchase, type AccountInventoryItem, type DirectPurchaseResult } from '../../api/inventory'
import { convertQuantity, normalizeQuantityUnit } from '../../utils/quantityUnits'
import { newRequestKey } from '../../utils/requestKey'

export type DirectPurchaseIngredient = { ingredient_id: string; ingredient_name: string; base_unit: string }

export function todayValue() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** 기준단위로 환산 가능한 입력 단위: g→g/kg, ml→ml/L, 그 외는 기준단위만 */
export function purchaseUnits(baseUnit: string) {
  const base = normalizeQuantityUnit(baseUnit)
  if (base === 'g') return ['kg', 'g']
  if (base === 'ml') return ['L', 'ml']
  return [baseUnit]
}

/**
 * 직접구매(마트·쿠팡 등) 기록 로직(PC 모달·터치 창 공용). 식재료·수량·결제 금액을 넣으면 그 식재료 재고에 바로 입고한다
 * (이동평균·LOT, 2026-10-22: 공급사 상품을 만들지 않는다). 산 물건 이름은 입고 기록에 남는다.
 */
export function useDirectPurchase(accountId: string, items: AccountInventoryItem[], onDone: (result: DirectPurchaseResult) => void) {
  const [ingredients, setIngredients] = useState<DirectPurchaseIngredient[]>([])
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [ingredientId, setIngredientId] = useState('')
  const [productName, setProductName] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayValue())
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [amount, setAmount] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestKey = useRef(newRequestKey())

  // 메뉴에 쓰는 거래처 식재료 + 이미 재고가 있는 식재료
  useEffect(() => {
    let active = true
    const fromStock = new Map<string, DirectPurchaseIngredient>()
    for (const item of items) if (item.ingredient_id && item.base_unit && !fromStock.has(item.ingredient_id))
      fromStock.set(item.ingredient_id, { ingredient_id: item.ingredient_id, ingredient_name: item.ingredient_name, base_unit: item.base_unit })
    void fetch(buildApiUrl(`/v2/menu-management/ingredients?${new URLSearchParams({ account_id: accountId })}`))
      .then(async response => {
        const data = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(data)) throw new Error('거래처 식재료를 불러오지 못했습니다.')
        return data as Array<Record<string, unknown>>
      })
      .then(rows => {
        if (!active) return
        const merged = new Map(fromStock)
        for (const row of rows) {
          const id = String(row.ingredient_id ?? '')
          const baseUnit = String(row.base_unit ?? '')
          if (id && baseUnit) merged.set(id, { ingredient_id: id, ingredient_name: String(row.ingredient_name ?? id), base_unit: baseUnit })
        }
        setIngredients([...merged.values()].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, 'ko')))
      })
      .catch(e => {
        if (!active) return
        setIngredients([...fromStock.values()])
        setLoadError(e instanceof Error ? e.message : '거래처 식재료를 불러오지 못했습니다.')
      })
    return () => { active = false }
  }, [accountId, items])

  const ingredient = ingredients.find(i => i.ingredient_id === ingredientId)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword ? ingredients.filter(i => i.ingredient_name.toLowerCase().includes(keyword) || i.ingredient_id.toLowerCase().includes(keyword)) : ingredients
  }, [ingredients, query])

  const selectIngredient = (id: string) => {
    const next = ingredients.find(i => i.ingredient_id === id)
    setIngredientId(id)
    setError('')
    if (!next) return
    setProductName(next.ingredient_name)
    setUnit(purchaseUnits(next.base_unit)[0])
  }

  const qty = Number(quantity)
  const paid = Number(amount)
  const baseQty = ingredient && qty > 0 ? convertQuantity(qty, unit, ingredient.base_unit) : 0
  const unitCost = baseQty > 0 && paid > 0 ? paid / baseQty : 0
  const ready = Boolean(ingredient && qty > 0 && paid > 0 && purchaseDate)

  const save = async () => {
    if (!ingredient || !ready || saving) return
    setSaving(true); setError('')
    try {
      const result = await recordDirectPurchase({
        account_id: accountId, ingredient_id: ingredient.ingredient_id, ingredient_name: ingredient.ingredient_name,
        product_name: productName.trim() || undefined,
        purchase_date: purchaseDate, quantity: qty, unit, total_amount: paid,
        ...(expirationDate ? { expiration_date: expirationDate } : {}), request_key: requestKey.current,
      })
      requestKey.current = newRequestKey()
      onDone(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '직접구매 기록에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return {
    ingredients, loadError, query, setQuery, filtered, ingredientId, ingredient, selectIngredient,
    productName, setProductName,
    purchaseDate, setPurchaseDate, quantity, setQuantity, unit, setUnit, amount, setAmount, expirationDate, setExpirationDate,
    baseQty, unitCost, ready, saving, error, save,
  }
}
