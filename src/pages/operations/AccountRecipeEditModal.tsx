import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IngredientOption } from '../../api/operations'
import { getAccountIngredients, registerAccountIngredient, resetAccountRecipeToStandard, type AccountIngredient } from '../../api/accountMenuRegistration'
import { deleteAccountRecipeRow, getAccountRecipe, saveAccountRecipeRow, type AccountRecipeRow } from '../../api/accountRecipes'
import IngredientSearchSelect from './IngredientSearchSelect'
import './AccountRecipeEditModal.css'

type Props = {
  accountId: string
  accountName?: string
  menuId: string
  menuName: string
  onClose: () => void
  /** 저장이 끝났을 때(부모가 메뉴·원가를 다시 읽는다) */
  onSaved?: (message: string) => void
  /** 창을 열어 둔 채 서버 레시피가 바뀌었을 때(본사 레시피로 되돌리기) — 부모는 원가만 다시 읽는다 */
  onChanged?: () => void
}

/** 편집 줄: 이미 있던 줄은 id·seq가 있다. 목록에 없는 식재료는 newName으로 입력하면 저장할 때 거래처 식재료로 만든다 */
type Row = { key: string; id?: number; seq?: number; ingredient_id: string; qty: string; newName: string | null; newUnit: string; hint?: string }

const toOption = (item: AccountIngredient): IngredientOption => ({ ingredient_id: item.ingredient_id, ingredient_name: item.ingredient_name, category_name: item.category_name, base_unit: item.base_unit, menu_usage_count: 0 })
const nameKey = (value: string) => value.replace(/\s+/g, '').toLowerCase()
const qtyText = (value: number) => (Number.isFinite(value) && value > 0 ? String(Math.round(value * 1000) / 1000) : '')
let rowSeq = 0
const nextKey = () => `are-${++rowSeq}`
const toRows = (recipe: AccountRecipeRow[]): Row[] => recipe.map(row => ({
  key: nextKey(), id: row.account_recipe_detail_id, seq: row.ingredient_seq, ingredient_id: row.ingredient_id,
  qty: row.review_flag ? '' : qtyText(row.qty_per_person), newName: null, newUnit: 'g',
  hint: row.review_flag ? `원래 표기 '${row.qty_num}${row.qty_unit}'를 ${row.base_unit}로 바꾸지 못했습니다. ${row.base_unit} 기준으로 다시 입력해주세요.` : undefined,
}))
/** 거래처에서 직접 만든 메뉴(AM-…)는 본사 레시피가 없다 */
const isAccountOnlyMenu = (menuId: string) => menuId.startsWith('AM-')

/**
 * 이 업장 레시피 수정(2026-10-26 사용자 결정: 거래처 메뉴 관리 화면 대신 식단표에서 바로).
 * 식재료 바꾸기·1인 사용량(식재료 기준단위)·줄 추가·빼기. 이 거래처에만 적용되고 본사 레시피는 그대로다.
 * 부족량·발주 수량과 1인 원가가 이 레시피로 계산된다.
 */
export default function AccountRecipeEditModal({ accountId, accountName, menuId, menuName, onClose, onSaved, onChanged }: Props) {
  const [original, setOriginal] = useState<AccountRecipeRow[]>([])
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([getAccountRecipe(accountId, menuId), getAccountIngredients(accountId)])
      .then(([recipe, accountIngredients]) => {
        if (!alive) return
        setOriginal(recipe)
        setIngredients(accountIngredients.map(toOption))
        setRows(toRows(recipe))
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : '레시피를 불러오지 못했습니다.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [accountId, menuId])

  const optionById = useMemo(() => new Map(ingredients.map(option => [option.ingredient_id, option])), [ingredients])
  const recipeId = original[0]?.recipe_id
  // 거래처 메뉴로 아직 저장되지 않은 메뉴(본사 메뉴를 식단에 넣고 저장 전)는 고칠 레시피가 없다
  const notAccountMenu = !loading && !error && original.length === 0

  const updateRow = (key: string, patch: Partial<Row>) => setRows(current => current.map(row => (row.key === key ? { ...row, ...patch, hint: patch.qty !== undefined ? undefined : row.hint } : row)))
  const filled = rows.filter(row => row.ingredient_id || row.newName?.trim())

  const validate = () => {
    if (filled.length === 0) return '식재료를 1개 이상 남겨주세요. 재고·발주 계산에 쓰입니다.'
    if (filled.some(row => !(Number(row.qty) > 0))) return '식재료마다 1인 사용량을 입력해주세요.'
    const keys = filled.map(row => row.ingredient_id || `new:${nameKey(row.newName ?? '')}`)
    if (new Set(keys).size !== keys.length) return '같은 식재료가 두 번 들어 있습니다.'
    return ''
  }

  const save = async () => {
    const problem = validate()
    if (problem) { setError(problem); return }
    if (recipeId == null) return
    setBusy(true); setError('')
    try {
      // 이름만 입력한 새 식재료 → 거래처 식재료로 만든다(같은 이름이 있으면 그것을 쓴다)
      let options = ingredients
      const resolved = new Map<string, IngredientOption>()
      for (const row of filled.filter(item => !item.ingredient_id)) {
        const key = nameKey(row.newName!)
        let option = resolved.get(key) ?? options.find(item => nameKey(item.ingredient_name) === key)
        if (!option) {
          option = toOption(await registerAccountIngredient(accountId, { ingredient_name: row.newName!.trim(), base_unit: row.newUnit }))
          options = [...options, option]
        }
        resolved.set(key, option)
      }
      if (resolved.size) setIngredients(options)
      const byId = new Map(options.map(option => [option.ingredient_id, option]))

      const keptIds = new Set(filled.map(row => row.id).filter((id): id is number => id != null))
      const removed = original.filter(row => !keptIds.has(row.account_recipe_detail_id))
      for (const row of removed) await deleteAccountRecipeRow(row.account_recipe_detail_id)

      const originalById = new Map(original.map(row => [row.account_recipe_detail_id, row]))
      let nextSeq = Math.max(0, ...original.map(row => row.ingredient_seq)) + 1
      let changed = 0
      for (const row of filled) {
        const option = row.ingredient_id ? byId.get(row.ingredient_id) : resolved.get(nameKey(row.newName ?? ''))
        if (!option) throw new Error('식재료를 다시 골라주세요.')
        const before = row.id != null ? originalById.get(row.id) : undefined
        const qty = Number(row.qty)
        if (before && before.ingredient_id === option.ingredient_id && !before.review_flag && Math.abs(before.qty_per_person - qty) < 0.0005) continue
        await saveAccountRecipeRow({
          account_id: accountId, recipe_id: before?.recipe_id ?? recipeId, menu_id: menuId, ingredient_id: option.ingredient_id,
          ingredient_seq: before?.ingredient_seq ?? nextSeq++, ingredient_name_raw: option.ingredient_name,
          qty_num: qty, qty_unit: option.base_unit || before?.base_unit || 'g',
        })
        changed++
      }
      if (!changed && !removed.length) { onClose(); return }
      onSaved?.(`'${menuName}' 레시피를 ${accountName || '이 업장'}에 저장했습니다${changed ? ` · 바꾼 줄 ${changed}` : ''}${removed.length ? ` · 뺀 줄 ${removed.length}` : ''}. 부족량·원가에 바로 반영됩니다.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '레시피를 저장하지 못했습니다.')
      // 일부만 저장됐을 수 있으니 서버 기준으로 다시 읽는다
      getAccountRecipe(accountId, menuId).then(setOriginal).catch(() => { /* 화면 값 유지 */ })
    } finally {
      setBusy(false)
    }
  }

  // body에 붙인다: 식단표 화면 안쪽 규칙(여백·버튼)에 덮이지 않게. 버튼은 PC·터치 공통 버튼 모양(t-btn·is-primary)을 그대로 쓴다
  /** 본사 레시피로 되돌리기: 저장하지 않은 수정은 버려진다. 끝나면 서버 레시피를 다시 읽어 창에 보여준다 */
  const resetToStandard = async () => {
    if (!window.confirm(`'${menuName}'의 이 업장 레시피를 본사 레시피로 되돌릴까요?
이 업장에서 바꾼 식재료·사용량이 모두 본사 기준으로 바뀝니다.`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await resetAccountRecipeToStandard(accountId, menuId)
      const recipe = await getAccountRecipe(accountId, menuId)
      setOriginal(recipe)
      setRows(toRows(recipe))
      setNotice(`본사 레시피로 되돌렸습니다 · 식재료 ${result.copied_ingredient_count}개. 부족량·원가에 바로 반영됩니다.`)
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '본사 레시피로 되돌리지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="are-backdrop" role="presentation" onClick={() => { if (!busy) onClose() }}>
      <section className="are" role="dialog" aria-modal="true" aria-labelledby="are-title" onClick={event => event.stopPropagation()}>
        <header className="are__head">
          <div>
            <h2 id="are-title">이 업장 레시피 수정</h2>
            <p>{menuName}{accountName ? ` · ${accountName}` : ''}</p>
          </div>
          <button type="button" className="are__close t-btn is-ghost is-icon" aria-label="닫기" disabled={busy} onClick={onClose}>×</button>
        </header>

        <div className="are__body">
          {loading && <p className="are__note" role="status">레시피를 불러오는 중…</p>}
          {notAccountMenu && <p className="are__note">이 메뉴는 아직 이 업장 메뉴로 저장되지 않았습니다. 식단표를 저장하면 본사 레시피가 이 업장으로 복사되고, 그다음 고칠 수 있습니다.</p>}
          {!loading && !notAccountMenu && <>
            <p className="are__note">이 업장에만 적용됩니다(본사 레시피는 그대로). 1인 사용량으로 부족량·발주 수량과 1인 원가를 계산합니다.</p>
            <div className="are__rows">
              <div className="are__row are__row--head" aria-hidden="true"><span>식재료</span><span>1인 사용량</span><span /></div>
              {rows.map((row, index) => {
                const option = row.ingredient_id ? optionById.get(row.ingredient_id) : undefined
                const typing = row.newName !== null && !row.ingredient_id
                const unit = option?.base_unit ?? (typing ? row.newUnit : '')
                const label = option?.ingredient_name ?? (row.newName || `${index + 1}번째 식재료`)
                return <div key={row.key} className="are__row-block">
                  <div className="are__row">
                    {typing ? <span className="are__new">
                      <span className="are__badge">새 식재료</span>
                      <input aria-label={`${index + 1}번째 새 식재료 이름`} value={row.newName ?? ''} maxLength={100} placeholder="식재료 이름" onChange={e => updateRow(row.key, { newName: e.target.value })} />
                      <select aria-label="기준단위" value={row.newUnit} onChange={e => updateRow(row.key, { newUnit: e.target.value })}>
                        <option value="g">g</option><option value="ml">ml</option><option value="EA">EA</option>
                      </select>
                    </span> : <IngredientSearchSelect options={ingredients} placeholder="식재료 검색 · 없으면 이름 입력" selectedName={option?.ingredient_name ?? ''} value={row.ingredient_id}
                      onChange={ingredientId => updateRow(row.key, { ingredient_id: ingredientId, newName: null })}
                      onCreate={typed => updateRow(row.key, { ingredient_id: '', newName: typed, newUnit: 'g' })} />}
                    <label className="are__qty">
                      <input aria-label={`${label} 1인 사용량`} type="number" min="0" step="0.1" inputMode="decimal" value={row.qty} placeholder="사용량" onChange={e => updateRow(row.key, { qty: e.target.value })} />
                      <span>{unit}</span>
                    </label>
                    <button type="button" className="are__remove t-btn is-ghost is-small" aria-label={`${label} 빼기`} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>빼기</button>
                  </div>
                  {row.hint && <small className="are__hint">{row.hint}</small>}
                </div>
              })}
              <button type="button" className="are__btn are__add t-btn is-soft is-small" onClick={() => setRows(current => [...current, { key: nextKey(), ingredient_id: '', qty: '', newName: ingredients.length ? null : '', newUnit: 'g' }])}>＋ 식재료 추가</button>
            </div>
          </>}
          {notice && <p className="are__notice" role="status">{notice}</p>}
          {error && <p className="are__error" role="alert">{error}</p>}
        </div>

        <footer className="are__actions">
          {!loading && !notAccountMenu && !isAccountOnlyMenu(menuId) ? <button type="button" className="are__btn are__reset t-btn is-ghost" disabled={busy} onClick={() => void resetToStandard()}>본사 레시피로 되돌리기</button> : null}
          <button type="button" className="are__btn t-btn" disabled={busy} onClick={onClose}>{notice ? '닫기' : '취소'}</button>
          <button type="button" className="are__btn t-btn is-primary" disabled={busy || loading || notAccountMenu || recipeId == null} onClick={() => void save()}>{busy ? '저장 중…' : '이 업장 레시피 저장'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
