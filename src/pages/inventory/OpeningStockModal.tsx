import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ESTIMATED_COST_SOURCE_LABELS, registerOpeningStock, type AccountInventoryItem } from '../../api/inventory'
import { convertQuantity, normalizeQuantityUnit, stockInputUnits } from '../../utils/quantityUnits'
import '../../components/IngredientProductLinkModal.css'

type Entry = { include: boolean; qty: string; unit: string; cost: string; edited: boolean; error: string; done: boolean }

/** 입력 수량을 재고 기준단위로 환산 (발주단위는 이 거래처 연결 규격으로). 백엔드 normalizeCurrentQuantity와 같은 규칙 */
function toBaseQty(item: AccountInventoryItem, qty: number, unit: string) {
  if (!Number.isFinite(qty)) return 0
  if (item.order_unit && item.package_base_qty && normalizeQuantityUnit(unit) === normalizeQuantityUnit(item.order_unit)
    && normalizeQuantityUnit(unit) !== normalizeQuantityUnit(item.base_unit)) return qty * item.package_base_qty
  return convertQuantity(qty, unit || item.base_unit, item.base_unit)
}

/**
 * 기준단위당 단가 제안: 서버 추정 단가(거래처·공통 공급가 → 최근 입고, 메뉴 예상 원가와 같은 기준)를 우선,
 * 없으면 현재 공급사 포장 가격 ÷ 포장 기준용량 (예: 계란 5,890원 ÷ 30EA)
 */
function suggestedCost(item: AccountInventoryItem) {
  if (item.estimated_unit_cost && item.estimated_unit_cost > 0) return Math.round(item.estimated_unit_cost * 100) / 100
  return item.purchase_price && item.package_base_qty ? Math.round((item.purchase_price / item.package_base_qty) * 100) / 100 : 0
}

function estimateLabel(item: AccountInventoryItem) {
  if (!item.estimated_unit_cost) return ''
  const source = ESTIMATED_COST_SOURCE_LABELS[item.estimated_cost_source ?? ''] ?? '공급가'
  return `추정: ${source}${item.estimated_cost_date ? ` (${item.estimated_cost_date})` : ''}`
}

export default function OpeningStockModal({ items, onClose, onDone }: {
  items: AccountInventoryItem[]; onClose: () => void; onDone: (saved: number, failed: number) => void
}) {
  const targets = useMemo(() => items.filter((item): item is AccountInventoryItem & { inventory_balance_id: number } =>
    Boolean(item.opening_available && item.inventory_balance_id)), [items])
  const [entries, setEntries] = useState<Record<number, Entry>>(() => Object.fromEntries(targets.map(item => [item.inventory_balance_id, {
    include: item.current_base_qty > 0, qty: String(item.current_qty ?? 0), unit: item.current_unit || item.base_unit,
    cost: String(suggestedCost(item) || ''), edited: false, error: '', done: false,
  }])))
  const [saving, setSaving] = useState(false)
  const update = (id: number, patch: Partial<Entry>) => setEntries(current => ({ ...current, [id]: { ...current[id], ...patch, error: '' } }))
  const selected = targets.filter(item => entries[item.inventory_balance_id]?.include && !entries[item.inventory_balance_id]?.done)
  const selectable = targets.filter(item => !entries[item.inventory_balance_id]?.done)
  const allSelected = selectable.length > 0 && selected.length === selectable.length
  const partiallySelected = selected.length > 0 && !allSelected
  const selectAll = (include: boolean) => setEntries(current => {
    const next = { ...current }
    for (const item of targets) {
      const entry = current[item.inventory_balance_id]
      if (entry && !entry.done) next[item.inventory_balance_id] = { ...entry, include }
    }
    return next
  })
  const total = selected.reduce((sum, item) => {
    const entry = entries[item.inventory_balance_id]
    return sum + toBaseQty(item, Number(entry.qty), entry.unit) * (Number(entry.cost) || 0)
  }, 0)

  const save = async () => {
    setSaving(true)
    let saved = 0, failed = 0
    for (const item of selected) {
      const entry = entries[item.inventory_balance_id]
      try {
        // 추정 단가를 고치지 않았으면 단가를 보내지 않는다: 서버가 같은 기준으로 계산해 '추정'으로 기록한다.
        const useEstimate = !entry.edited && Boolean(item.estimated_unit_cost)
        await registerOpeningStock({ inventory_balance_id: item.inventory_balance_id, current_qty: Number(entry.qty), current_unit: entry.unit,
          ...(useEstimate ? {} : { unit_cost: Number(entry.cost) }) })
        saved++
        setEntries(current => ({ ...current, [item.inventory_balance_id]: { ...current[item.inventory_balance_id], done: true, error: '' } }))
      } catch (e) {
        failed++
        setEntries(current => ({ ...current, [item.inventory_balance_id]: { ...current[item.inventory_balance_id], error: e instanceof Error ? e.message : '실패' } }))
      }
    }
    setSaving(false)
    onDone(saved, failed)
  }

  return createPortal(<div className="ingredient-link-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
    <section className="ingredient-link-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-stock-title">
      <header><div><h2 id="opening-stock-title">기초재고 등록</h2>
        <p>프로그램 도입 전부터 보유하던 재고를 수량과 단가로 등록합니다. 재고금액과 평균단가가 설정되고, 이후 식단 사용 시 이 단가로 원가가 차감됩니다.</p></div>
        <button disabled={saving} onClick={onClose}>닫기</button></header>
      <p>단가는 <strong>기준단위당 금액</strong>입니다. 실제 매입가를 모르면 그대로 두세요 — 공급가 기반 <strong>추정 단가</strong>로 등록되고 재고 목록에 '추정'으로 표시됩니다. 실제 매입가를 알면 고쳐 주세요. 상품마다 한 번만 등록할 수 있고, 입고·사용 이력이 생긴 상품은 목록에 나오지 않습니다(재고 조정을 사용).</p>
      {!targets.length ? <p>기초재고를 등록할 수 있는 상품이 없습니다.</p> : <div className="ingredient-link-table"><table>
        <thead><tr><th><label><input type="checkbox" aria-label="기초재고 등록 전체 선택"
          checked={allSelected} ref={input => { if (input) input.indeterminate = partiallySelected }}
          disabled={saving || !selectable.length} onChange={e => selectAll(e.target.checked)} /> 전체 선택</label></th><th>상품</th><th>수량</th><th>단가 (기준단위당)</th><th>재고금액</th></tr></thead>
        <tbody>{targets.map(item => {
          const entry = entries[item.inventory_balance_id]
          const baseQty = toBaseQty(item, Number(entry.qty), entry.unit)
          const units = stockInputUnits(item.base_unit, item.order_unit, item.package_base_qty) ?? [item.base_unit]
          return <tr key={item.inventory_balance_id}>
            <td><input type="checkbox" aria-label={`${item.product_name || item.ingredient_name} 기초재고 등록`} checked={entry.include} disabled={saving || entry.done}
              onChange={e => update(item.inventory_balance_id, { include: e.target.checked })} /></td>
            <td>{item.ingredient_name}<small>{item.product_name}</small>
              {entry.done && <small className="ingredient-link-success">등록 완료</small>}
              {entry.error && <small className="ingredient-link-error">{entry.error}</small>}</td>
            <td><input type="number" min="0" step="0.01" aria-label="기초재고 수량" value={entry.qty} disabled={saving || entry.done}
              onChange={e => update(item.inventory_balance_id, { qty: e.target.value })} style={{ width: 90 }} />
              <select aria-label="수량 단위" value={entry.unit} disabled={saving || entry.done} onChange={e => update(item.inventory_balance_id, { unit: e.target.value })}>
                {units.map(unit => <option key={unit} value={unit}>{unit === item.order_unit && item.package_base_qty ? `${unit} (${item.package_base_qty.toLocaleString()}${item.base_unit})` : unit}</option>)}
              </select>
              <small>= {baseQty.toLocaleString('ko-KR', { maximumFractionDigits: 3 })} {item.base_unit}</small></td>
            <td><input type="number" min="0" step="0.01" aria-label="기준단위당 단가" value={entry.cost} disabled={saving || entry.done}
              onChange={e => update(item.inventory_balance_id, { cost: e.target.value, edited: true })} style={{ width: 100 }} /> 원/{item.base_unit}
              {item.estimated_unit_cost && !entry.edited ? <small>{estimateLabel(item)}</small>
                : item.purchase_price ? <small>공급사 가격 {item.purchase_price.toLocaleString()}원 / {item.order_unit}</small> : <small>공급사 가격 없음 · 단가 입력 필요</small>}</td>
            <td>{Math.round(baseQty * (Number(entry.cost) || 0)).toLocaleString('ko-KR')}원</td>
          </tr>
        })}</tbody></table></div>}
      <footer><span>선택 {selected.length}건 · 합계 {Math.round(total).toLocaleString('ko-KR')}원</span>
        <button className="menu-manager-save-button" disabled={saving || !selected.length} onClick={() => void save()}>{saving ? '등록 중…' : '선택 항목 등록'}</button></footer>
    </section>
  </div>, document.body)
}
