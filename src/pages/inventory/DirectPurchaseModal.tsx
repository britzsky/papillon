import { createPortal } from 'react-dom'
import type { AccountInventoryItem, DirectPurchaseResult } from '../../api/inventory'
import { purchaseUnits, todayValue as today, useDirectPurchase } from '../../features/inventory/useDirectPurchase'
import '../../components/IngredientProductLinkModal.css'

/**
 * 직접구매(마트·쿠팡 등) 기록 — PC 모달. 로직은 features/inventory/useDirectPurchase(터치 화면과 공용).
 */
export default function DirectPurchaseModal({ accountId, items, onClose, onDone }: {
  accountId: string; items: AccountInventoryItem[]; onClose: () => void; onDone: (result: DirectPurchaseResult) => void
}) {
  const {
    loadError, query, setQuery, filtered, ingredientId, ingredient, selectIngredient,
    productName, setProductName,
    purchaseDate, setPurchaseDate, quantity, setQuantity, unit, setUnit, amount, setAmount, expirationDate, setExpirationDate,
    baseQty, unitCost, ready, saving, error, save,
  } = useDirectPurchase(accountId, items, onDone)

  return createPortal(<div className="ingredient-link-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
    <section className="ingredient-link-dialog" role="dialog" aria-modal="true" aria-labelledby="direct-purchase-title" style={{ width: 'min(720px, 100%)' }}>
      <header><div><h2 id="direct-purchase-title">직접구매 등록</h2>
        <p>마트·쿠팡 등에서 직접 산 식재료를 그 식재료 재고에 바로 넣습니다. 결제 금액 ÷ 수량이 입고 단가가 되고, 산 물건 이름은 입고 기록에 남습니다.</p></div>
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
          <label>산 물건 이름 (선택)<input aria-label="직접구매 상품명" value={productName} maxLength={255} placeholder="예: 양파 (쿠팡)" disabled={saving}
            onChange={e => setProductName(e.target.value)} /></label>
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
      <footer><span>공급사 상품과 연결하지 않고 식재료 재고에 더합니다.</span>
        <button type="button" className="menu-manager-save-button" disabled={!ready || saving} onClick={() => void save()}>{saving ? '등록 중…' : '재고에 반영'}</button></footer>
    </section>
  </div>, document.body)
}
