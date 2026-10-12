import { useEffect, useMemo, useState } from 'react'
import { getMenuManagerList, type IngredientOption, type MenuManagerItem } from '../../api/operations'
import {
  getAccountIngredients,
  getPromotePreview,
  importStandardMenu,
  promoteAccountMenu,
  registerAccountIngredient,
  registerAccountMenu,
  type AccountIngredient,
  type PromotePreview,
} from '../../api/accountMenuRegistration'
import IngredientSearchSelect from './IngredientSearchSelect'
import { mealCategoryOptions, mealPlanTypeOptions, menuGubunOptions, menuTypeOptions, toFoodType } from './menuManagerShared'
import { similarMenus } from './menuSimilarity'
import './PdfMenuRegisterModal.css'

type Props = {
  accountId: string
  accountName: string
  /** PDF에 적힌 메뉴 표기 */
  pdfText: string
  /** 예: '2026-10-20 화 오후간식' */
  context: string
  /** 식사 코드(1·3·4·6·7·8 간식) — 메뉴유형 기본값에 쓴다 */
  slotCode: number | null
  mealPlanType: number
  accountMenus: MenuManagerItem[]
  onClose: () => void
  /** 거래처 메뉴가 정해졌을 때(기존 연결·본사에서 가져오기·새 등록). 부모가 메뉴 목록을 다시 읽고 PDF 표기에 연결한다 */
  onLinked: (menuId: string, notice: string) => Promise<void> | void
}

type IngredientRow = { key: string; ingredient_id: string; qty: string }

const SNACK_SLOTS = [1, 3, 4, 6, 7, 8]

/** 메뉴명으로 메뉴유형·구분·음식 분류를 미리 고른다. 사용자가 확인·수정한다 */
function guessKinds(name: string, slotCode: number | null) {
  const text = name.replace(/\s+/g, '')
  if (/(주스|쥬스|식혜|음료|우유|쿨|에이드|차)$/.test(text)) return { menuType: '3', gubun: '16', category: '간식' }
  if (slotCode !== null && SNACK_SLOTS.includes(slotCode)) return { menuType: '2', gubun: '13', category: '간식' }
  const rules: Array<[RegExp, string, string]> = [
    [/(밥|죽|덮밥|비빔밥|볶음밥|카레라이스|라이스)$/, '0', '0'],
    [/(국|탕|찌개|전골|장)$/, '0', '1'],
    [/(우동|국수|면|수제비|쫄면|파스타|스파게티)$/, '0', '7'],
    [/(무침|생채|겉절이)$/, '1', '2'],
    [/(튀김|까스|강정|커틀릿)/, '1', '3'],
    [/구이$/, '1', '4'],
    [/(찜|수육)$/, '1', '5'],
    [/(전|부침|계란말이|스크램블)$/, '1', '6'],
    [/조림$/, '1', '8'],
    [/볶음$/, '1', '9'],
    [/나물$/, '1', '10'],
    [/샐러드$/, '1', '11'],
    [/(김치|깍두기|피클|장아찌|지)$/, '1', '14'],
  ]
  const hit = rules.find(([pattern]) => pattern.test(text))
  return hit ? { menuType: hit[1], gubun: hit[2], category: '한식' } : { menuType: '1', gubun: '17', category: '한식' }
}

const toOption = (item: AccountIngredient): IngredientOption => ({ ingredient_id: item.ingredient_id, ingredient_name: item.ingredient_name, category_name: item.category_name, base_unit: item.base_unit, menu_usage_count: 0 })

let rowSeq = 0
const newRow = (ingredientId = ''): IngredientRow => ({ key: `row-${++rowSeq}`, ingredient_id: ingredientId, qty: '' })

export default function PdfMenuRegisterModal({ accountId, accountName, pdfText, context, slotCode, mealPlanType, accountMenus, onClose, onLinked }: Props) {
  const guess = useMemo(() => guessKinds(pdfText, slotCode), [pdfText, slotCode])
  const [standardMenus, setStandardMenus] = useState<MenuManagerItem[]>([])
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState(pdfText.trim())
  const [calories, setCalories] = useState('')
  const [category, setCategory] = useState<string>(guess.category)
  const [menuType, setMenuType] = useState(guess.menuType)
  const [gubun, setGubun] = useState(guess.gubun)
  const [planType, setPlanType] = useState(String(mealPlanType))
  const [rows, setRows] = useState<IngredientRow[]>([newRow()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 새로 등록한 메뉴. 있으면 '본사 메뉴에도 반영할까요?' 단계 */
  const [registered, setRegistered] = useState<{ menu_id: string; menu_name: string } | null>(null)
  const [preview, setPreview] = useState<PromotePreview | null>(null)
  /** 목록에 없는 거래처 식재료 추가 입력 */
  const [draftIngredient, setDraftIngredient] = useState<{ name: string; unit: string; category: string } | null>(null)

  useEffect(() => {
    let active = true
    // 식재료는 거래처 식재료(메뉴·재고 기준). 본사 식자재 마스터는 쓰지 않는다
    Promise.all([getMenuManagerList(), getAccountIngredients(accountId)])
      .then(([menus, accountIngredients]) => {
        if (!active) return
        const options = accountIngredients.map(toOption)
        setStandardMenus(menus)
        setIngredients(options)
        // 메뉴명에 든 식재료(두 글자 이상)를 미리 넣어 둔다. 사용량은 사람이 입력한다
        const compact = pdfText.replace(/\s+/g, '')
        const found = options
          .filter(option => option.ingredient_name.length >= 2 && compact.includes(option.ingredient_name.replace(/\s+/g, '')))
          .sort((a, b) => b.ingredient_name.length - a.ingredient_name.length)
          .filter((option, index, list) => !list.slice(0, index).some(longer => longer.ingredient_name.includes(option.ingredient_name)))
          .slice(0, 4)
        if (found.length) setRows(found.map(option => newRow(option.ingredient_id)))
      })
      .catch(e => { if (active) setLoadError(e instanceof Error ? e.message : '메뉴·식재료 목록을 불러오지 못했습니다.') })
    return () => { active = false }
  }, [accountId, pdfText])

  const accountMenuIds = useMemo(() => new Set(accountMenus.map(menu => menu.menu_id)), [accountMenus])
  const similarAccount = useMemo(() => similarMenus(pdfText, accountMenus), [pdfText, accountMenus])
  const similarStandard = useMemo(
    () => similarMenus(pdfText, standardMenus.filter(menu => !accountMenuIds.has(menu.menu_id) && !/\s2$/.test(menu.menu_name))),
    [pdfText, standardMenus, accountMenuIds],
  )
  const optionById = useMemo(() => new Map(ingredients.map(option => [option.ingredient_id, option])), [ingredients])

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.') } finally { setBusy(false) }
  }

  const linkExisting = (menu: MenuManagerItem) => run(async () => {
    await onLinked(menu.menu_id, `'${pdfText}'을(를) 거래처 메뉴 '${menu.menu_name}'에 연결했습니다.`)
  })
  const importStandard = (menu: MenuManagerItem) => run(async () => {
    await importStandardMenu(accountId, menu.menu_id)
    await onLinked(menu.menu_id, `본사 메뉴 '${menu.menu_name}'을(를) 거래처 메뉴로 가져와 연결했습니다.`)
  })

  const validate = () => {
    if (!name.trim()) return '메뉴명을 입력해주세요.'
    if (!(Number(calories) > 0)) return '1인분 칼로리(kcal)를 입력해주세요.'
    const filled = rows.filter(row => row.ingredient_id)
    if (filled.length === 0) return '재고 관리를 위해 식재료를 1개 이상 선택해주세요.'
    if (filled.some(row => !(Number(row.qty) > 0))) return '선택한 식재료마다 1인분 사용량을 입력해주세요.'
    if (new Set(filled.map(row => row.ingredient_id)).size !== filled.length) return '같은 식재료가 두 번 들어 있습니다.'
    return ''
  }

  const register = () => {
    const problem = validate()
    if (problem) { setError(problem); return }
    void run(async () => {
      const result = await registerAccountMenu({
        account_id: accountId,
        menu_name: name.trim(),
        menu_name_raw: pdfText,
        calories_per_serving: Number(calories),
        food_type: toFoodType(category),
        menu_type: Number(menuType),
        menu_gubun: Number(gubun),
        meal_plan_type: Number(planType),
        ingredients: rows.filter(row => row.ingredient_id).map(row => {
          const option = optionById.get(row.ingredient_id)
          return { ingredient_id: row.ingredient_id, ingredient_name_raw: option?.ingredient_name, qty_num: Number(row.qty), qty_unit: option?.base_unit ?? '' }
        }),
      })
      setRegistered(result)
      // 본사 반영 질문에 본사 식자재로 옮기는 방법(같은 식자재·이름이 같은 식자재·새로 추가)을 함께 보여 준다
      setPreview(await getPromotePreview(accountId, result.menu_id).catch(() => null))
    })
  }

  const categories = useMemo(() => [...new Set(ingredients.map(option => option.category_name).filter(Boolean))].sort(), [ingredients])
  const addIngredient = () => {
    if (!draftIngredient) return
    if (!draftIngredient.name.trim()) { setError('추가할 식재료 이름을 입력해주세요.'); return }
    void run(async () => {
      const created = toOption(await registerAccountIngredient(accountId, { ingredient_name: draftIngredient.name.trim(), base_unit: draftIngredient.unit, category_name: draftIngredient.category.trim() || undefined }))
      setIngredients(current => [...current, created].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name)))
      // 비어 있는 첫 줄에 넣고, 없으면 줄을 추가한다
      setRows(current => current.some(row => !row.ingredient_id)
        ? current.map((row, index) => index === current.findIndex(item => !item.ingredient_id) ? { ...row, ingredient_id: created.ingredient_id } : row)
        : [...current, newRow(created.ingredient_id)])
      setDraftIngredient(null)
    })
  }

  const finish = (promote: boolean) => {
    if (!registered) return
    void run(async () => {
      let notice = `'${registered.menu_name}'을(를) ${accountName || '거래처'} 메뉴로 등록했습니다.`
      if (promote) {
        try {
          await promoteAccountMenu(accountId, registered.menu_id)
          notice += ' 본사 메뉴에도 반영했습니다.'
        } catch (e) {
          // 거래처 등록은 이미 끝났다. 본사 반영 실패 사유만 알린다
          notice += ` 본사 반영은 하지 못했습니다: ${e instanceof Error ? e.message : ''}`
        }
      }
      await onLinked(registered.menu_id, notice)
    })
  }

  return (
    <div className="table-meals-modal-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <section className="table-meals-modal pdf-menu-register" role="dialog" aria-modal="true" aria-labelledby="pdf-menu-register-title" onClick={event => event.stopPropagation()}>
        <div className="table-meals-modal__header">
          <div>
            <p className="table-meals-modal__eyebrow">{context}</p>
            <h2 id="pdf-menu-register-title">메뉴 등록</h2>
          </div>
          <span>PDF 표기 '{pdfText}'</span>
        </div>

        {registered ? (
          <div className="table-meals-modal__body pdf-menu-register__promote">
            <p><strong>'{registered.menu_name}'</strong>을(를) {accountName || '이 거래처'} 메뉴로 등록했습니다.</p>
            {preview?.blocked_reason ? (
              <p className="pdf-menu-register__hint">본사 메뉴로는 반영할 수 없습니다: {preview.blocked_reason}</p>
            ) : (
              <>
                <p>본사 메뉴에도 반영할까요? 반영하면 다른 거래처도 본사 메뉴에서 이 메뉴를 가져다 쓸 수 있습니다.</p>
                {preview && <PromoteIngredients preview={preview} />}
              </>
            )}
            {error && <p role="alert" className="pdf-menu-register__error">{error}</p>}
            <div className="table-meals-modal__actions">
              {preview?.blocked_reason ? (
                <button type="button" className="table-meals-modal__button is-primary" disabled={busy} onClick={() => finish(false)}>확인</button>
              ) : (
                <>
                  <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => finish(false)}>아니요, 이 거래처에만</button>
                  <button type="button" className="table-meals-modal__button is-primary" disabled={busy} onClick={() => finish(true)}>예, 본사 메뉴에도 등록</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="table-meals-modal__body pdf-menu-register__body">
            {loadError && <p role="alert" className="pdf-menu-register__error">{loadError}</p>}
            <section className="pdf-menu-register__section" aria-labelledby="pdf-similar-title">
              <h3 id="pdf-similar-title">비슷한 메뉴</h3>
              {similarAccount.length === 0 && similarStandard.length === 0 ? (
                <p className="pdf-menu-register__hint">이름이 비슷한 거래처·본사 메뉴가 없습니다. 아래에서 새로 등록해주세요.</p>
              ) : (
                <ul className="pdf-menu-register__similar">
                  {similarAccount.map(({ menu }) => (
                    <li key={`a-${menu.menu_id}`}>
                      <span className="pdf-menu-register__badge">거래처</span>
                      <span className="pdf-menu-register__name">{menu.menu_name}</span>
                      <small>{menu.calories_per_serving ? `${menu.calories_per_serving} kcal` : '열량 미등록'}</small>
                      <button type="button" disabled={busy} onClick={() => void linkExisting(menu)}>이 메뉴로 연결</button>
                    </li>
                  ))}
                  {similarStandard.map(({ menu }) => (
                    <li key={`s-${menu.menu_id}`}>
                      <span className="pdf-menu-register__badge is-standard">본사</span>
                      <span className="pdf-menu-register__name">{menu.menu_name}</span>
                      <small>{menu.calories_per_serving ? `${menu.calories_per_serving} kcal` : '열량 미등록'}</small>
                      <button type="button" disabled={busy} onClick={() => void importStandard(menu)}>거래처로 가져와 연결</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="pdf-menu-register__section" aria-labelledby="pdf-new-title">
              <h3 id="pdf-new-title">새 메뉴로 등록 <small>이 거래처 메뉴 관리에 저장됩니다</small></h3>
              <div className="pdf-menu-register__grid">
                <label className="table-meals-modal__field is-wide"><span>메뉴명</span>
                  <input id="pdf-register-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
                <label className="table-meals-modal__field"><span>1인분 칼로리 (kcal)</span>
                  <input id="pdf-register-calories" type="number" min="1" step="1" inputMode="numeric" value={calories} onChange={e => setCalories(e.target.value)} placeholder="예: 150" /></label>
                <label className="table-meals-modal__field"><span>음식 분류</span>
                  <select id="pdf-register-category" value={category} onChange={e => setCategory(e.target.value)}>
                    {mealCategoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select></label>
                <label className="table-meals-modal__field"><span>메뉴유형</span>
                  <select id="pdf-register-type" value={menuType} onChange={e => setMenuType(e.target.value)}>
                    {menuTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
                  </select></label>
                <label className="table-meals-modal__field"><span>메뉴구분</span>
                  <select id="pdf-register-gubun" value={gubun} onChange={e => setGubun(e.target.value)}>
                    {menuGubunOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
                  </select></label>
                <label className="table-meals-modal__field"><span>식단 유형</span>
                  <select id="pdf-register-plan" value={planType} onChange={e => setPlanType(e.target.value)}>
                    {mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
                  </select></label>
              </div>
              <p className="pdf-menu-register__hint">메뉴유형·구분은 메뉴명으로 미리 골라 두었습니다. 맞는지 확인해주세요.</p>

              <div className="pdf-menu-register__ingredients">
                <div className="pdf-menu-register__ingredients-head">
                  <strong>식재료 (1인분 기준, 필수)</strong>
                  <button type="button" onClick={() => setRows(current => [...current, newRow()])}>식재료 추가</button>
                </div>
                {rows.map((row, index) => {
                  const option = optionById.get(row.ingredient_id)
                  return (
                    <div key={row.key} className="pdf-menu-register__ingredient">
                      <IngredientSearchSelect options={ingredients} placeholder="식재료 검색" selectedName={option?.ingredient_name ?? ''} value={row.ingredient_id}
                        onChange={ingredientId => setRows(current => current.map(item => item.key === row.key ? { ...item, ingredient_id: ingredientId } : item))} />
                      <label className="pdf-menu-register__qty">
                        <input aria-label={`${option?.ingredient_name ?? `${index + 1}번째 식재료`} 1인분 사용량`} type="number" min="0" step="0.1" inputMode="decimal" value={row.qty}
                          onChange={e => setRows(current => current.map(item => item.key === row.key ? { ...item, qty: e.target.value } : item))} placeholder="사용량" />
                        <span>{option?.base_unit ?? '단위'}</span>
                      </label>
                      <button type="button" className="pdf-menu-register__remove" disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>삭제</button>
                    </div>
                  )
                })}
                {draftIngredient ? (
                  <div className="pdf-menu-register__new-ingredient" role="group" aria-label="거래처 식재료 추가">
                    <input id="pdf-new-ingredient-name" aria-label="추가할 식재료 이름" value={draftIngredient.name} maxLength={100} placeholder="식재료 이름 (예: 궁채)"
                      onChange={e => setDraftIngredient({ ...draftIngredient, name: e.target.value })} />
                    <select id="pdf-new-ingredient-unit" aria-label="기준단위" value={draftIngredient.unit} onChange={e => setDraftIngredient({ ...draftIngredient, unit: e.target.value })}>
                      <option value="g">g</option><option value="ml">ml</option><option value="EA">EA</option>
                    </select>
                    <input id="pdf-new-ingredient-category" aria-label="분류" list="pdf-ingredient-categories" value={draftIngredient.category} placeholder="분류 (선택)"
                      onChange={e => setDraftIngredient({ ...draftIngredient, category: e.target.value })} />
                    <datalist id="pdf-ingredient-categories">{categories.map(category => <option key={category} value={category} />)}</datalist>
                    <button type="button" disabled={busy} onClick={addIngredient}>추가</button>
                    <button type="button" disabled={busy} onClick={() => setDraftIngredient(null)}>취소</button>
                  </div>
                ) : (
                  <p className="pdf-menu-register__hint">목록에 없는 식재료는 <button type="button" className="pdf-menu-register__link" onClick={() => setDraftIngredient({ name: '', unit: 'g', category: '' })}>이 거래처 식재료로 추가</button>할 수 있습니다. 기준단위(g·ml·EA)로 재고와 발주를 계산합니다.</p>
                )}
              </div>
            </section>

            {error && <p role="alert" className="pdf-menu-register__error">{error}</p>}
            <div className="table-meals-modal__actions">
              <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={onClose}>취소</button>
              <button type="button" className="table-meals-modal__button is-primary" disabled={busy} onClick={register}>{busy ? '저장 중' : '거래처 메뉴로 등록'}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

/** 본사 반영 때 식재료 처리: 이름이 같은 본사 식자재에 연결하거나, 없으면 본사 식자재로 새로 추가한다 */
function PromoteIngredients({ preview }: { preview: PromotePreview }) {
  const matched = preview.ingredients.filter(item => item.action === 'MATCHED')
  const added = preview.ingredients.filter(item => item.action === 'NEW')
  if (!matched.length && !added.length) return <p className="pdf-menu-register__hint">식재료는 모두 본사 식자재에 있는 것이라 그대로 씁니다.</p>
  return (
    <ul className="pdf-menu-register__promote-list">
      {matched.map(item => <li key={item.ingredient_id}><span className="pdf-menu-register__badge is-standard">연결</span>{item.ingredient_name} → 본사 식자재 '{item.standard_name}' ({item.base_unit})</li>)}
      {added.map(item => <li key={item.ingredient_id}><span className="pdf-menu-register__badge">새로 추가</span>{item.ingredient_name} ({item.base_unit}) — 본사 식자재에 없어 함께 등록합니다</li>)}
    </ul>
  )
}
