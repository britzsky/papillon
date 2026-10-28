import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IngredientOption } from '../../api/operations'
import { getAccountIngredients, importStandardMenu, registerAccountIngredient, resetAccountRecipeToStandard, type AccountIngredient } from '../../api/accountMenuRegistration'
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
type Row = { key: string; id?: number; seq?: number; ingredient_id: string; qty: string; newName: string | null; newUnit: string; hint?: string; name?: string; unit?: string }

const toOption = (item: AccountIngredient): IngredientOption => ({ ingredient_id: item.ingredient_id, ingredient_name: item.ingredient_name, category_name: item.category_name, base_unit: item.base_unit, menu_usage_count: 0 })
const nameKey = (value: string) => value.replace(/\s+/g, '').toLowerCase()
const qtyText = (value: number) => (Number.isFinite(value) && value > 0 ? String(Math.round(value * 1000) / 1000) : '')
let rowSeq = 0
const nextKey = () => `are-${++rowSeq}`
const toRows = (recipe: AccountRecipeRow[]): Row[] => recipe.map(row => ({
  key: nextKey(), id: row.account_recipe_detail_id, seq: row.ingredient_seq, ingredient_id: row.ingredient_id,
  qty: row.review_flag ? '' : qtyText(row.qty_per_person), newName: null, newUnit: 'g',
  // 거래처 식재료 목록에서 못 찾아도 레시피 줄의 이름·단위는 보여준다
  name: row.ingredient_name_std || row.ingredient_name_raw, unit: row.base_unit,
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
  // 창을 연 뒤 부모가 다시 그려져도 레시피를 다시 읽지 않도록 최신 onChanged만 기억
  const onChangedRef = useRef(onChanged)
  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])

  useEffect(() => {
    let alive = true
    // 식단표를 불러와 저장하기 전의 본사 메뉴면 여기서 바로 이 업장 메뉴로 가져온다(본사 레시피 복사).
    // 식단표를 먼저 저장하고 다시 고칠 필요 없음 — 저장할 때는 이미 있는 이 업장 레시피를 그대로 쓴다(2026-10-28)
    const loadRecipe = async () => {
      const recipe = await getAccountRecipe(accountId, menuId)
      if (recipe.length > 0 || isAccountOnlyMenu(menuId)) return recipe
      await importStandardMenu(accountId, menuId)
      if (alive) { setNotice('본사 레시피를 이 업장 메뉴로 가져왔습니다. 고친 뒤 저장하면 이 식단표에 바로 반영됩니다.'); onChangedRef.current?.() }
      return getAccountRecipe(accountId, menuId)
    }
    // 식재료 목록은 가져오기(본사 식재료를 거래처 식재료로 복사)가 끝난 뒤 읽어야 레시피 줄의 식재료가 목록에 있다
    loadRecipe()
      .then(async recipe => [recipe, await getAccountIngredients(accountId)] as const)
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
  // 본사 메뉴를 가져왔는데도 레시피가 없으면(본사 메뉴에 식재료가 없음 등) 고칠 레시피가 없다
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
      onSaved?.(`'${menuName}' 레시피를 ${accountName || '이 업장'}에 저장했습니다${changed ? ` · 바꾼 줄 ${changed}` : ''}${removed.length ? ` · 뺀 줄 ${removed.length}` : ''}. 오늘 이후 사용 확정 전 식단의 필요량·부족량·원가에 바로 반영됩니다(지난·사용 확정한 식사는 그때 양 그대로).`)
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
      // 되돌리면서 본사 식재료가 거래처 식재료로 새로 복사될 수 있어 목록도 다시 읽는다
      const [recipe, accountIngredients] = await Promise.all([getAccountRecipe(accountId, menuId), getAccountIngredients(accountId)])
      setIngredients(accountIngredients.map(toOption))
      setOriginal(recipe)
      setRows(toRows(recipe))
      setNotice(`본사 레시피로 되돌렸습니다 · 식재료 ${result.copied_ingredient_count}개. 오늘 이후 사용 확정 전 식단의 필요량·부족량·원가에 바로 반영됩니다.`)
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
          {notAccountMenu && <p className="are__note">이 메뉴에는 식재료가 없어 고칠 레시피가 없습니다. 메뉴 관리에서 식재료를 먼저 등록해주세요.</p>}
          {!loading && !notAccountMenu && <>
            <p className="are__note">이 업장에만 적용됩니다(본사 레시피는 그대로). 1인 사용량으로 부족량·발주 수량과 1인 원가를 계산합니다. 저장하면 이미 저장된 식단표 중 오늘 이후·사용 확정 전 식사도 새 양으로 다시 계산하고, 지난·사용 확정한 식사는 그때 쓴 양 그대로 둡니다.</p>
            <div className="are__rows">
              <div className="are__row are__row--head" aria-hidden="true"><span>식재료</span><span>1인 사용량</span><span /></div>
              {rows.map((row, index) => {
                const option = row.ingredient_id ? optionById.get(row.ingredient_id) : undefined
                const typing = row.newName !== null && !row.ingredient_id
                const unit = option?.base_unit ?? (typing ? row.newUnit : row.unit ?? '')
                const label = option?.ingredient_name ?? (row.newName || row.name || `${index + 1}번째 식재료`)
                return <div key={row.key} className="are__row-block">
                  <div className="are__row">
                    {typing ? <span className="are__new">
                      <span className="are__badge">새 식재료</span>
                      <input aria-label={`${index + 1}번째 새 식재료 이름`} value={row.newName ?? ''} maxLength={100} placeholder="식재료 이름" onChange={e => updateRow(row.key, { newName: e.target.value })} />
                      <select aria-label="기준단위" value={row.newUnit} onChange={e => updateRow(row.key, { newUnit: e.target.value })}>
                        <option value="g">g</option><option value="ml">ml</option><option value="EA">EA</option>
                      </select>
                    </span> : <IngredientSearchSelect options={ingredients} placeholder="식재료 검색 · 없으면 이름 입력" selectedName={option?.ingredient_name ?? row.name ?? ''} value={row.ingredient_id}
                      onChange={ingredientId => updateRow(row.key, { ingredient_id: ingredientId, newName: null, name: undefined, unit: undefined })}
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
