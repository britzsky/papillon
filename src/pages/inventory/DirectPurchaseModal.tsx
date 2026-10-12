import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildApiUrl } from '../../config/api'
import { recordDirectPurchase, type AccountInventoryItem, type DirectPurchaseResult } from '../../api/inventory'
import { convertQuantity, normalizeQuantityUnit } from '../../utils/quantityUnits'
import '../../components/IngredientProductLinkModal.css'

type Ingredient = { ingredient_id: string; ingredient_name: string; base_unit: string }
type DirectProduct = { account_ingredient_product_id: number; product_name: string }

const NEW_PRODUCT = 'NEW'

function today() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** 재시도해도 한 번만 반영되도록 요청마다 키를 만든다 (http 환경에서는 randomUUID가 없을 수 있음) */
function newRequestKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `DP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** 기준단위로 환산 가능한 입력 단위: g→g/kg, ml→ml/L, 그 외는 기준단위만 */
function purchaseUnits(baseUnit: string) {
  const base = normalizeQuantityUnit(baseUnit)
  if (base === 'g') return ['kg', 'g']
  if (base === 'ml') return ['L', 'ml']
  return [baseUnit]
}

/**
 * 직접구매(마트·쿠팡 등) 기록. 식재료·수량·결제 금액만 넣으면 서버가 거래처 자체 '직접구매' 상품을
 * 처음 한 번 만들고 재고에 입고한다(이동평균·LOT). 같은 상품명이면 기존 직접구매 상품을 재사용한다.
 */
export default function DirectPurchaseModal({ accountId, items, onClose, onDone }: {
  accountId: string; items: AccountInventoryItem[]; onClose: () => void; onDone: (result: DirectPurchaseResult) => void
}) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [ingredientId, setIngredientId] = useState('')
  const [productChoice, setProductChoice] = useState(NEW_PRODUCT)
  const [productName, setProductName] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today())
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
    const fromStock = new Map<string, Ingredient>()
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
  const directProducts = useMemo<DirectProduct[]>(() => {
    const seen = new Map<number, DirectProduct>()
    for (const item of items) if (item.supplier_code === 'DIRECT' && item.ingredient_id === ingredientId && item.account_ingredient_product_id)
      seen.set(item.account_ingredient_product_id, { account_ingredient_product_id: item.account_ingredient_product_id, product_name: item.product_name || item.ingredient_name })
    return [...seen.values()]
  }, [items, ingredientId])

  const selectIngredient = (id: string) => {
    const next = ingredients.find(i => i.ingredient_id === id)
    setIngredientId(id)
    setError('')
    if (!next) return
    const existing = items.find(item => item.supplier_code === 'DIRECT' && item.ingredient_id === id && item.account_ingredient_product_id)
    setProductChoice(existing?.account_ingredient_product_id ? String(existing.account_ingredient_product_id) : NEW_PRODUCT)
    setProductName(next.ingredient_name)
    setUnit(purchaseUnits(next.base_unit)[0])
  }

  const qty = Number(quantity)
  const paid = Number(amount)
  const baseQty = ingredient && qty > 0 ? convertQuantity(qty, unit, ingredient.base_unit) : 0
  const unitCost = baseQty > 0 && paid > 0 ? paid / baseQty : 0
  const ready = Boolean(ingredient && qty > 0 && paid > 0 && purchaseDate && (productChoice !== NEW_PRODUCT || productName.trim()))

  const save = async () => {
    if (!ingredient || !ready || saving) return
    setSaving(true); setError('')
    try {
      const result = await recordDirectPurchase({
        account_id: accountId, ingredient_id: ingredient.ingredient_id, ingredient_name: ingredient.ingredient_name,
        ...(productChoice === NEW_PRODUCT ? { product_name: productName.trim() } : { account_ingredient_product_id: Number(productChoice) }),
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

  return createPortal(<div className="ingredient-link-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
    <section className="ingredient-link-dialog" role="dialog" aria-modal="true" aria-labelledby="direct-purchase-title" style={{ width: 'min(720px, 100%)' }}>
      <header><div><h2 id="direct-purchase-title">직접구매 등록</h2>
        <p>마트·쿠팡 등에서 직접 산 식재료를 재고에 넣습니다. 처음 산 상품은 이 거래처 전용 '직접구매' 상품으로 자동 등록되고, 결제 금액 ÷ 수량이 입고 단가가 됩니다.</p></div>
        <button type="button" disabled={saving} onClick={onClose}>닫기</button></header>
      {loadError && <p className="ingredient-link-error">{loadError} 재고에 있는 식재료만 표시합니다.</p>}
      <div className="ingredient-link-filters">
        <label>식재료 검색<input value={query} placeholder="예: 양파" onChange={e => setQuery(e.target.value)} disabled={saving} /></label>
        <label>식재료<select aria-label="직접구매 식재료" value={ingredientId} disabled={saving} onChange={e => selectIngredient(e.target.value)}>
          <option value="">선택하세요 ({filtered.length}개)</option>
          {filtered.map(i => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name} ({i.base_unit})</option>)}
        </select></label>
      </div>
      {ingredient && <>
        <div className="ingredient-link-filters" style={{ marginTop: 12 }}>
          <label>상품<select aria-label="직접구매 상품" value={productChoice} disabled={saving} onChange={e => setProductChoice(e.target.value)}>
            {directProducts.map(p => <option key={p.account_ingredient_product_id} value={p.account_ingredient_product_id}>{p.product_name}</option>)}
            <option value={NEW_PRODUCT}>새 상품으로 등록</option>
          </select></label>
          {productChoice === NEW_PRODUCT && <label>상품명<input aria-label="직접구매 상품명" value={productName} maxLength={255} placeholder="예: 양파 (쿠팡)" disabled={saving}
            onChange={e => setProductName(e.target.value)} /></label>}
          <label>구매일<input type="date" aria-label="구매일" value={purchaseDate} max={today()} disabled={saving} onChange={e => setPurchaseDate(e.target.value)} /></label>
        </div>
        <div className="ingredient-link-filters" style={{ marginTop: 12 }}>
          <label>수량<span style={{ display: 'flex', gap: 6 }}>
            <input type="number" min="0" step="0.001" aria-label="구매 수량" value={quantity} disabled={saving} onChange={e => setQuantity(e.target.value)} />
            <select aria-label="구매 단위" value={unit} disabled={saving} onChange={e => setUnit(e.target.value)} style={{ width: 80 }}>
              {purchaseUnits(ingredient.base_unit).map(u => <option key={u} value={u}>{u}</option>)}
            </select></span></label>
          <label>결제 금액 (원)<input type="number" min="0" step="1" aria-label="결제 금액" value={amount} disabled={saving} onChange={e => setAmount(e.target.value)} /></label>
          <label>소비기한 (선택)<input type="date" aria-label="소비기한" value={expirationDate} disabled={saving} onChange={e => setExpirationDate(e.target.value)} /></label>
        </div>
        <p>{baseQty > 0 ? `${baseQty.toLocaleString('ko-KR', { maximumFractionDigits: 3 })} ${ingredient.base_unit}` : '수량을 입력하세요'}
          {unitCost > 0 && ` · 입고 단가 ${unitCost.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/${ingredient.base_unit}`}</p>
      </>}
      {error && <p className="ingredient-link-error" role="alert">{error}</p>}
      <footer><span>{productChoice === NEW_PRODUCT ? '기존 발주 상품의 우선 순위는 바뀌지 않습니다.' : '선택한 직접구매 상품으로 입고합니다.'}</span>
        <button type="button" className="menu-manager-save-button" disabled={!ready || saving} onClick={() => void save()}>{saving ? '등록 중…' : '재고에 반영'}</button></footer>
    </section>
  </div>, document.body)
}
