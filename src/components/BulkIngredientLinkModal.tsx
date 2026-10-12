import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSupplierOffers, type SupplierOffer } from '../api/supplierIntegration'
import { getUnlinkedSuggestions, linkIngredientProduct, type UnlinkedIngredientSuggestion } from '../api/ingredientProductMapping'
import { getLocalUserId } from '../api/inventory'
import './IngredientProductLinkModal.css'

type Entry = { offerId: number | null; include: boolean; status: 'idle' | 'done' | 'error'; error: string }

/**
 * 미연결 식자재 일괄 연결. 식자재마다 추천 1순위를 미리 골라 두고(다른 식자재에서 옮겨야 하는 상품은 기본 제외),
 * 사용자가 확인한 행만 '선택 항목 연결'로 저장한다. 자동 저장은 하지 않는다. 같은 상품을 두 식자재에 동시에 연결하지 않는다.
 */
export default function BulkIngredientLinkModal({ accountId, onClose, onDone, onSearch }: {
  accountId: string; onClose: () => void; onDone: (linked: number) => void
  onSearch: (ingredient: { ingredient_id: string; ingredient_name: string; base_unit: string }) => void
}) {
  const date = new Date().toLocaleDateString('sv-SE')
  const [rows, setRows] = useState<UnlinkedIngredientSuggestion[]>([])
  const [offers, setOffers] = useState<SupplierOffer[]>([])
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    // 추천된 상품 정보만 받는다(사업장 전체 상품을 받지 않음)
    void getUnlinkedSuggestions(accountId, date).then(async nextRows => [nextRows, await getSupplierOffers(accountId, date, undefined, undefined,
      { offerIds: [...new Set(nextRows.flatMap(row => row.suggestions.map(item => item.supplier_offer_id)))].slice(0, 500) })] as const).then(([nextRows, nextOffers]) => {
      if (!active) return
      setRows(nextRows); setOffers(nextOffers)
      const used = new Set<number>()
      setEntries(Object.fromEntries(nextRows.map(row => {
        const top = row.suggestions[0]
        // 1순위가 다른 식자재에서 옮겨야 하는 상품이거나 앞 행에서 이미 고른 상품이면 기본 제외
        const include = Boolean(top && !top.warning && !used.has(top.supplier_offer_id))
        if (top && include) used.add(top.supplier_offer_id)
        return [row.ingredient_id, { offerId: top?.supplier_offer_id ?? null, include, status: 'idle', error: '' } satisfies Entry]
      })))
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '추천을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accountId, date])

  const update = (id: string, patch: Partial<Entry>) => setEntries(current => ({ ...current, [id]: { ...current[id], ...patch, error: '' } }))
  // 같은 상품을 여러 식자재에 고르면 위쪽 행만 저장 대상으로 남긴다
  const duplicateOf = useMemo(() => {
    const owner = new Map<number, string>(), result: Record<string, string> = {}
    for (const row of rows) {
      const entry = entries[row.ingredient_id]
      if (!entry?.include || entry.status === 'done' || entry.offerId == null) continue
      const first = owner.get(entry.offerId)
      if (first) result[row.ingredient_id] = rows.find(item => item.ingredient_id === first)?.ingredient_name || first
      else owner.set(entry.offerId, row.ingredient_id)
    }
    return result
  }, [rows, entries])
  const targets = rows.filter(row => {
    const entry = entries[row.ingredient_id]
    return entry?.include && entry.status !== 'done' && entry.offerId != null && !duplicateOf[row.ingredient_id]
  })
  const selectable = rows.filter(row => row.suggestions.length && entries[row.ingredient_id]?.status !== 'done')
  const doneCount = rows.filter(row => entries[row.ingredient_id]?.status === 'done').length

  const save = async () => {
    if (saving || !targets.length) return
    setSaving(true); setError('')
    let linked = 0
    for (const row of targets) {
      const entry = entries[row.ingredient_id]
      const offer = offers.find(item => item.supplier_offer_id === entry.offerId)
      try {
        if (!offer) throw new Error('상품 정보를 다시 불러와주세요.')
        await linkIngredientProduct({ accountId, ingredientId: row.ingredient_id, baseUnit: row.base_unit, offer, userId: getLocalUserId() })
        linked++
        setEntries(current => ({ ...current, [row.ingredient_id]: { ...current[row.ingredient_id], status: 'done', error: '' } }))
      } catch (e) {
        setEntries(current => ({ ...current, [row.ingredient_id]: { ...current[row.ingredient_id], status: 'error', error: e instanceof Error ? e.message : '연결 실패' } }))
      }
    }
    setSaving(false)
    onDone(linked)
  }

  return createPortal(<div className="ingredient-link-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
    <section className="ingredient-link-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-link-title">
      <header><div><h2 id="bulk-link-title">미연결 식자재 일괄 연결</h2>
        <p>식자재마다 추천 1순위를 미리 골라 두었습니다. 맞지 않는 행은 다른 추천을 고르거나 체크를 해제하고, '선택 항목 연결'을 눌러주세요. 직접 고른 행만 저장합니다.</p></div>
        <button type="button" disabled={saving} onClick={onClose}>닫기</button></header>
      {error && <p role="alert" className="ingredient-link-error">{error}</p>}
      {loading ? <p role="status">미연결 식자재와 추천 상품을 불러오는 중입니다.</p> : !rows.length ? <p>상품 연결이 필요한 식자재가 없습니다.</p> : <div className="ingredient-link-table"><table>
        <thead><tr>
          <th><label><input type="checkbox" aria-label="일괄 연결 전체 선택" disabled={saving || !selectable.length}
            checked={selectable.length > 0 && selectable.every(row => entries[row.ingredient_id]?.include)}
            onChange={e => setEntries(current => {
              const next = { ...current }
              for (const row of selectable) next[row.ingredient_id] = { ...next[row.ingredient_id], include: e.target.checked }
              return next
            })} /> 전체</label></th>
          <th>식자재</th><th>연결할 상품</th><th>근거</th></tr></thead>
        <tbody>{rows.map(row => {
          const entry = entries[row.ingredient_id]
          const chosen = row.suggestions.find(item => item.supplier_offer_id === entry?.offerId)
          return <tr key={row.ingredient_id}>
            <td><input type="checkbox" aria-label={`${row.ingredient_name} 일괄 연결 선택`} disabled={saving || !row.suggestions.length || entry?.status === 'done'}
              checked={Boolean(entry?.include)} onChange={e => update(row.ingredient_id, { include: e.target.checked })} /></td>
            <td>{row.ingredient_name}<small>{row.category_name ? `${row.category_name} · ` : ''}기준 {row.base_unit} · 메뉴 {row.menu_usage_count}개</small>
              {entry?.status === 'done' && <small className="ingredient-link-success">연결 완료</small>}
              {entry?.error && <small className="ingredient-link-error">{entry.error}</small>}</td>
            <td>{row.suggestions.length ? <select aria-label={`${row.ingredient_name} 연결할 상품`} value={entry?.offerId ?? ''} disabled={saving || entry?.status === 'done'}
              onChange={e => update(row.ingredient_id, { offerId: Number(e.target.value), include: true })}>
              {row.suggestions.map(item => <option key={item.supplier_offer_id} value={item.supplier_offer_id}>
                {item.product_name} · {item.supplier_name} · {item.base_qty.toLocaleString()}{item.base_unit}{item.purchase_price > 0 ? ` · ${item.purchase_price.toLocaleString()}원` : ''}</option>)}
            </select> : <button type="button" disabled={saving} onClick={() => onSearch(row)}>추천 없음 · 직접 검색</button>}</td>
            <td>{chosen ? <><small className="ingredient-link-reasons">{chosen.reasons.join(' · ')}</small>
              {chosen.warning && <small className="ingredient-link-error">{chosen.warning}</small>}</> : null}
              {duplicateOf[row.ingredient_id] && <small className="ingredient-link-error">'{duplicateOf[row.ingredient_id]}'에서 이미 고른 상품입니다. 다른 상품을 고르거나 체크를 해제하세요.</small>}</td>
          </tr>
        })}</tbody></table></div>}
      <footer><span>저장 대상 {targets.length}건{doneCount ? ` · 연결 완료 ${doneCount}건` : ''}</span>
        <button type="button" className="menu-manager-save-button" disabled={saving || loading || !targets.length} onClick={() => void save()}>{saving ? '연결 중…' : '선택 항목 연결'}</button></footer>
    </section>
  </div>, document.body)
}
