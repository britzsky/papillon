import { useEffect, useMemo, useState } from 'react'
import { getMenuManagerList, type IngredientOption, type MenuManagerItem } from '../../api/operations'
import {
  AI_DRAFT_BATCH,
  getAccountIngredients,
  importStandardMenu,
  registerAccountIngredient,
  registerAccountMenu,
  requestAiRecipeDrafts,
  type AccountIngredient,
  type AccountMenuRegisterInput,
  type AiMenuDraft,
} from '../../api/accountMenuRegistration'
import { normalizeMenuText, type UnmatchedPdfMenu } from '../../features/tableMeals/useTableMealsWorkspace'
import IngredientSearchSelect from './IngredientSearchSelect'
import { guessKinds } from './menuKindGuess'
import { mealCategoryOptions, mealPlanTypeOptions, menuGubunOptions, menuTypeOptions, toFoodType } from './menuManagerShared'
import { menuSimilarity, similarMenus } from './menuSimilarity'
import './PdfMenuRegisterModal.css'
import './PdfUnmatchedBulkModal.css'

type Props = {
  accountId: string
  accountName: string
  mealPlanType: number
  unmatched: UnmatchedPdfMenu[]
  accountMenus: MenuManagerItem[]
  onClose: () => void
  /** 정해진 연결(표기 → 거래처 메뉴). 부모가 메뉴 목록을 다시 읽고 PDF 같은 표기 칸에 연결한다 */
  onLinked: (links: Array<{ text: string; menuId: string }>, notice: string) => Promise<void> | void
  /** 메뉴가 아닌 표기를 이번 식단에서 뺀다 */
  onExclude: (texts: string[]) => void
}

/** 표기 하나의 처리: 본사 메뉴 가져오기 · 거래처 메뉴에 연결 · AI 초안으로 새로 등록 · 이번만 제외 · 나중에(그대로 둠) */
type Choice = { kind: 'standard' | 'account'; menuId: string } | { kind: 'ai' | 'exclude' | 'later' }
type Group = 'same' | 'similar' | 'none'

type DraftRow = { key: string; aiName: string; ingredientId: string; newName: string; newUnit: string; newCategory: string; qty: string; aiUnit: string; qtyChecked: boolean }
type Draft = { text: string; include: boolean; name: string; calories: string; category: string; menuType: string; gubun: string; planType: string; rows: DraftRow[]; error: string; slotCode: number | null }

const GROUP_TITLE: Record<Group, string> = {
  same: '본사 메뉴와 이름이 같음',
  similar: '이름이 비슷한 메뉴가 있음 — 직접 골라주세요',
  none: '거래처·본사 어디에도 없음',
}
const GROUP_HINT: Record<Group, string> = {
  same: '본사 레시피(식재료·사용량)와 칼로리를 그대로 가져옵니다.',
  similar: '이름이 비슷해도 재료가 다를 수 있어(돼지고기김치찌개·참치김치찌개) 자동으로 고르지 않습니다.',
  none: 'AI가 1인분 칼로리와 식재료·사용량 초안을 만들고, 확인한 뒤 등록합니다.',
}

let rowSeq = 0
const toOption = (item: AccountIngredient): IngredientOption => ({ ingredient_id: item.ingredient_id, ingredient_name: item.ingredient_name, category_name: item.category_name, base_unit: item.base_unit, menu_usage_count: 0 })
const choiceValue = (choice: Choice) => ('menuId' in choice ? `${choice.kind}:${choice.menuId}` : choice.kind)
const parseChoice = (value: string): Choice => {
  const [kind, menuId] = value.split(/:(.*)/s)
  return kind === 'standard' || kind === 'account' ? { kind, menuId } : { kind: kind as 'ai' | 'exclude' | 'later' }
}
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

function toDraft(source: AiMenuDraft, slotCode: number | null, mealPlanType: number): Draft {
  const guess = guessKinds(source.menu_name || source.text, slotCode)
  return {
    text: source.text,
    include: !source.error && source.ingredients.length > 0,
    name: source.menu_name || source.text,
    calories: source.calories_per_serving ? String(source.calories_per_serving) : '',
    category: guess.category,
    menuType: guess.menuType,
    gubun: guess.gubun,
    planType: String(mealPlanType),
    error: source.error ?? (source.ingredients.length === 0 ? 'AI가 식재료를 찾지 못했습니다. 메뉴가 아니면 빼고, 메뉴면 식재료를 직접 넣어주세요.' : ''),
    slotCode,
    rows: source.ingredients.map(item => ({
      key: `d-${++rowSeq}`,
      aiName: item.ai_name,
      ingredientId: item.ingredient_id ?? '',
      newName: item.ingredient_id ? '' : item.ai_name,
      newUnit: ['g', 'ml', 'EA'].includes(item.unit) ? item.unit : 'g',
      newCategory: item.category,
      qty: item.qty,
      aiUnit: item.unit,
      qtyChecked: false,
    })),
  }
}

/**
 * 식단표 PDF에서 거래처 메뉴에 연결되지 않은 표기를 한 화면에서 정리한다.
 * ① 본사 메뉴와 이름이 같으면 기본으로 '본사에서 가져오기' ② 비슷한 메뉴만 있으면 사람이 고름 ③ 어디에도 없으면 AI 레시피 초안 → 확인 → 거래처 메뉴로 등록.
 * 등록은 기존 거래처 메뉴 등록 규칙(칼로리·식재료 1개 이상 필수)을 그대로 따른다. AI 결과를 확인 없이 저장하지 않는다.
 */
export default function PdfUnmatchedBulkModal({ accountId, accountName, mealPlanType, unmatched, accountMenus, onClose, onLinked, onExclude }: Props) {
  const [standardMenus, setStandardMenus] = useState<MenuManagerItem[] | null>(null)
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [loadError, setLoadError] = useState('')
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [step, setStep] = useState<'choose' | 'review' | 'done'>('choose')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [failures, setFailures] = useState<string[]>([])
  const [summary, setSummary] = useState<string[]>([])
  /** 이번 창에서 연결이 정해진 표기 — 닫을 때까지 모아서 부모에 한 번 알린다 */
  const [links, setLinks] = useState<Array<{ text: string; menuId: string }>>([])
  const [newIngredientCount, setNewIngredientCount] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([getMenuManagerList(), getAccountIngredients(accountId)])
      .then(([menus, accountIngredients]) => {
        if (!active) return
        setStandardMenus(menus.filter(menu => !/\s2$/.test(menu.menu_name)))
        setIngredients(accountIngredients.map(toOption))
      })
      .catch(e => { if (active) setLoadError(errorText(e, '메뉴·식재료 목록을 불러오지 못했습니다.')) })
    return () => { active = false }
  }, [accountId])

  const accountMenuIds = useMemo(() => new Set(accountMenus.map(menu => menu.menu_id)), [accountMenus])

  /** 표기마다 분류(같은 이름 본사 메뉴 / 비슷한 후보 / 없음)와 후보 */
  const rows = useMemo(() => {
    if (!standardMenus) return []
    const importable = standardMenus.filter(menu => !accountMenuIds.has(menu.menu_id))
    return unmatched.map(item => {
      const same = importable.find(menu => normalizeMenuText(menu.menu_name) === item.key)
      const similarAccount = similarMenus(item.text, accountMenus, 3)
      const similarStandard = similarMenus(item.text, importable, 3).filter(entry => entry.menu.menu_id !== same?.menu_id)
      const group: Group = same ? 'same' : similarAccount.length || similarStandard.length ? 'similar' : 'none'
      return { item, group, same, similarAccount, similarStandard }
    })
  }, [unmatched, standardMenus, accountMenus, accountMenuIds])

  // 처음 기본값: 같은 이름 본사 메뉴는 가져오기, 비슷한 후보만 있으면 '나중에'(사람이 고름), 없으면 AI 초안
  useEffect(() => {
    setChoices(current => {
      const next = { ...current }
      rows.forEach(row => {
        if (next[row.item.key]) return
        next[row.item.key] = row.same ? { kind: 'standard', menuId: row.same.menu_id } : row.group === 'similar' ? { kind: 'later' } : { kind: 'ai' }
      })
      return next
    })
  }, [rows])

  const optionById = useMemo(() => new Map(ingredients.map(option => [option.ingredient_id, option])), [ingredients])
  const counts = useMemo(() => {
    const result = { standard: 0, account: 0, ai: 0, exclude: 0, later: 0 }
    rows.forEach(row => { result[(choices[row.item.key] ?? { kind: 'later' }).kind] += 1 })
    return result
  }, [rows, choices])

  const setGroupChoice = (group: Group, make: (row: (typeof rows)[number]) => Choice | null) =>
    setChoices(current => {
      const next = { ...current }
      rows.filter(row => row.group === group).forEach(row => { const choice = make(row); if (choice) next[row.item.key] = choice })
      return next
    })

  const finish = async (collected: Array<{ text: string; menuId: string }>, lines: string[]) => {
    setLinks(collected)
    setSummary(lines)
    setStep('done')
  }

  /** 1단계 적용: 본사 가져오기·거래처 연결·제외를 처리하고, AI 대상이 있으면 초안을 받아 2단계로 */
  const apply = () => {
    void (async () => {
      setBusy(true); setFailures([])
      const collected = [...links]
      const failed: string[] = []
      const lines: string[] = []
      try {
        const pick = (kind: Choice['kind']) => rows.filter(row => choices[row.item.key]?.kind === kind)
        let imported = 0
        for (const [index, row] of pick('standard').entries()) {
          const choice = choices[row.item.key] as { menuId: string }
          setProgress(`본사 메뉴 가져오는 중 ${index + 1}/${pick('standard').length}`)
          try {
            await importStandardMenu(accountId, choice.menuId)
            collected.push({ text: row.item.text, menuId: choice.menuId }); imported += 1
          } catch (e) {
            failed.push(`${row.item.text}: ${errorText(e, '본사 메뉴를 가져오지 못했습니다.')}`)
          }
        }
        const linked = pick('account')
        linked.forEach(row => collected.push({ text: row.item.text, menuId: (choices[row.item.key] as { menuId: string }).menuId }))
        const excluded = pick('exclude').map(row => row.item.text)
        if (excluded.length) onExclude(excluded)
        if (imported) lines.push(`본사 메뉴 ${imported}개를 거래처 메뉴로 가져와 연결했습니다.`)
        if (linked.length) lines.push(`거래처 메뉴 ${linked.length}개에 연결했습니다.`)
        if (excluded.length) lines.push(`메뉴가 아닌 표기 ${excluded.length}개를 이번 식단에서 뺐습니다.`)

        const aiRows = pick('ai')
        if (aiRows.length === 0) { setFailures(failed); await finish(collected, lines); return }
        const nextDrafts: Draft[] = []
        for (let start = 0; start < aiRows.length; start += AI_DRAFT_BATCH) {
          const chunk = aiRows.slice(start, start + AI_DRAFT_BATCH)
          setProgress(`AI 레시피 초안 만드는 중 ${Math.min(start + chunk.length, aiRows.length)}/${aiRows.length}`)
          try {
            const result = await requestAiRecipeDrafts(accountId, chunk.map(row => row.item.text))
            result.drafts.forEach(draft => nextDrafts.push(toDraft(draft, chunk.find(row => row.item.text === draft.text)?.item.slotCode ?? null, mealPlanType)))
          } catch (e) {
            // 한도·키 문제는 다음 묶음도 실패하므로 멈춘다. 이미 받은 초안은 그대로 확인 단계로 넘긴다
            failed.push(`AI 초안 ${aiRows.length - start}개를 만들지 못했습니다: ${errorText(e, '')}`)
            break
          }
        }
        setLinks(collected); setSummary(lines); setFailures(failed)
        if (nextDrafts.length) { setDrafts(nextDrafts); setStep('review') } else await finish(collected, lines)
      } finally {
        setBusy(false); setProgress('')
      }
    })()
  }

  const updateDraft = (index: number, patch: Partial<Draft>) => setDrafts(current => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)))
  const updateRow = (index: number, key: string, patch: Partial<DraftRow>) =>
    setDrafts(current => current.map((draft, i) => (i === index ? { ...draft, rows: draft.rows.map(row => (row.key === key ? { ...row, ...patch } : row)) } : draft)))

  const unitMismatch = (row: DraftRow) => {
    const option = row.ingredientId ? optionById.get(row.ingredientId) : undefined
    return Boolean(option && row.aiUnit && option.base_unit.toLowerCase() !== row.aiUnit.toLowerCase())
  }

  const validate = (draft: Draft) => {
    if (!draft.name.trim()) return '메뉴명을 입력해주세요.'
    if (!(Number(draft.calories) > 0)) return '1인분 칼로리(kcal)를 입력해주세요.'
    const filled = draft.rows.filter(row => row.ingredientId || row.newName.trim())
    if (filled.length === 0) return '재고 관리를 위해 식재료를 1개 이상 넣어주세요.'
    if (filled.some(row => !(Number(row.qty) > 0))) return '식재료마다 1인분 사용량을 입력해주세요.'
    const ids = filled.map(row => row.ingredientId || `new:${normalizeMenuText(row.newName)}`)
    if (new Set(ids).size !== ids.length) return '같은 식재료가 두 번 들어 있습니다.'
    // AI 단위와 거래처 식재료 기준단위가 다른 줄은 사용량을 고치기 전에는 등록하지 않는다(예: 계란 60g → 60개로 저장되면 발주량이 틀어짐)
    const unchecked = filled.find(row => unitMismatch(row) && !row.qtyChecked)
    if (unchecked) return `${optionById.get(unchecked.ingredientId)?.ingredient_name ?? unchecked.aiName}의 사용량을 기준단위(${optionById.get(unchecked.ingredientId)?.base_unit})로 고쳐주세요.`
    return ''
  }

  /** 2단계: 고른 초안을 등록. 새 식재료는 이름별로 한 번만 만든다 */
  const registerDrafts = () => {
    const targets = drafts.map((draft, index) => ({ draft, index })).filter(({ draft }) => draft.include)
    const problems = targets.map(({ draft, index }) => ({ index, problem: validate(draft) })).filter(item => item.problem)
    if (problems.length) {
      setDrafts(current => current.map((draft, i) => ({ ...draft, error: problems.find(item => item.index === i)?.problem ?? draft.error })))
      setFailures([`확인이 필요한 메뉴가 ${problems.length}개 있습니다. 빨간 안내를 고치거나 체크를 해제해주세요.`])
      return
    }
    void (async () => {
      setBusy(true); setFailures([])
      const collected = [...links]
      const createdByName = new Map<string, IngredientOption>()
      let options = ingredients
      let registered = 0
      let createdCount = 0
      const remaining: Draft[] = []
      try {
        for (const [position, { draft }] of targets.entries()) {
          setProgress(`거래처 메뉴 등록 중 ${position + 1}/${targets.length}`)
          try {
            const ingredientLines: AccountMenuRegisterInput['ingredients'] = []
            for (const row of draft.rows.filter(item => item.ingredientId || item.newName.trim())) {
              let option = row.ingredientId ? optionById.get(row.ingredientId) ?? options.find(item => item.ingredient_id === row.ingredientId) : undefined
              if (!option) {
                const nameKey = normalizeMenuText(row.newName)
                option = createdByName.get(nameKey) ?? options.find(item => normalizeMenuText(item.ingredient_name) === nameKey)
                if (!option) {
                  option = toOption(await registerAccountIngredient(accountId, { ingredient_name: row.newName.trim(), base_unit: row.newUnit, category_name: row.newCategory.trim() || undefined }))
                  options = [...options, option]
                  createdCount += 1
                }
                createdByName.set(nameKey, option)
              }
              ingredientLines.push({ ingredient_id: option.ingredient_id, ingredient_name_raw: option.ingredient_name, qty_num: Number(row.qty), qty_unit: option.base_unit })
            }
            const result = await registerAccountMenu({
              account_id: accountId,
              menu_name: draft.name.trim(),
              menu_name_raw: draft.text,
              calories_per_serving: Number(draft.calories),
              food_type: toFoodType(draft.category),
              menu_type: Number(draft.menuType),
              menu_gubun: Number(draft.gubun),
              meal_plan_type: Number(draft.planType),
              ingredients: ingredientLines,
            })
            collected.push({ text: draft.text, menuId: result.menu_id }); registered += 1
          } catch (e) {
            remaining.push({ ...draft, error: errorText(e, '등록하지 못했습니다.') })
          }
        }
      } finally {
        setIngredients(options)
        setBusy(false); setProgress('')
      }
      setLinks(collected)
      setNewIngredientCount(count => count + createdCount)
      const lines = [...summary]
      if (registered) lines.push(`새 메뉴 ${registered}개를 ${accountName || '거래처'} 메뉴로 등록하고 연결했습니다.`)
      setSummary(lines)
      if (remaining.length) {
        // 실패한 것과 체크하지 않은 것은 확인 단계에 남긴다
        setDrafts([...remaining, ...drafts.filter(draft => !draft.include)])
        setFailures([`${remaining.length}개는 등록하지 못했습니다. 안내를 확인해주세요.`])
      } else {
        await finish(collected, lines)
      }
    })()
  }

  const close = () => {
    if (busy) return
    if (links.length === 0 && step !== 'done') { onClose(); return }
    void Promise.resolve(onLinked(links, summary.join(' ') || '미등록 메뉴를 정리했습니다.')).finally(onClose)
  }

  const groups: Group[] = ['same', 'similar', 'none']
  const draftCount = drafts.filter(draft => draft.include).length

  return (
    <div className="table-meals-modal-backdrop" role="presentation" onClick={close}>
      <section className="table-meals-modal pdf-menu-register pdf-bulk" role="dialog" aria-modal="true" aria-labelledby="pdf-bulk-title" onClick={event => event.stopPropagation()}>
        <div className="table-meals-modal__header">
          <div>
            <p className="table-meals-modal__eyebrow">{accountName}</p>
            <h2 id="pdf-bulk-title">미등록 메뉴 한꺼번에 정리</h2>
          </div>
          <span>{step === 'choose' ? `${unmatched.length}종` : step === 'review' ? `AI 초안 ${drafts.length}개 확인` : '완료'}</span>
        </div>

        {step === 'choose' && (
          <div className="table-meals-modal__body pdf-menu-register__body">
            {loadError && <p role="alert" className="pdf-menu-register__error">{loadError}</p>}
            {!standardMenus && !loadError && <p className="pdf-menu-register__hint">본사 메뉴와 비교하는 중입니다.</p>}
            {groups.map(group => {
              const groupRows = rows.filter(row => row.group === group)
              if (groupRows.length === 0) return null
              return (
                <section key={group} className="pdf-menu-register__section pdf-bulk__group" aria-labelledby={`pdf-bulk-${group}`}>
                  <div className="pdf-bulk__group-head">
                    <h3 id={`pdf-bulk-${group}`}>{GROUP_TITLE[group]} <small>{groupRows.length}종</small></h3>
                    <div className="pdf-bulk__group-actions">
                      {group === 'same' && <button type="button" onClick={() => setGroupChoice('same', row => (row.same ? { kind: 'standard', menuId: row.same.menu_id } : null))}>모두 본사에서 가져오기</button>}
                      {group !== 'same' && <button type="button" onClick={() => setGroupChoice(group, () => ({ kind: 'ai' }))}>모두 AI로 새로 만들기</button>}
                      <button type="button" onClick={() => setGroupChoice(group, () => ({ kind: 'later' }))}>모두 나중에</button>
                    </div>
                  </div>
                  <p className="pdf-menu-register__hint">{GROUP_HINT[group]}</p>
                  <ul className="pdf-bulk__list">
                    {groupRows.map(row => {
                      const choice = choices[row.item.key] ?? { kind: 'later' }
                      return (
                        <li key={row.item.key} className={`is-${choice.kind}`}>
                          <span className="pdf-menu-register__name">{row.item.text}</span>
                          <small>{row.item.context}{row.item.count > 1 ? ` 외 ${row.item.count - 1}칸` : ''}</small>
                          <select aria-label={`'${row.item.text}' 처리`} value={choiceValue(choice)} onChange={event => setChoices(current => ({ ...current, [row.item.key]: parseChoice(event.target.value) }))}>
                            {row.same && <option value={`standard:${row.same.menu_id}`}>본사 '{row.same.menu_name}' 가져오기</option>}
                            {row.similarAccount.map(({ menu }) => <option key={`a-${menu.menu_id}`} value={`account:${menu.menu_id}`}>거래처 '{menu.menu_name}'에 연결</option>)}
                            {row.similarStandard.map(({ menu }) => <option key={`s-${menu.menu_id}`} value={`standard:${menu.menu_id}`}>본사 '{menu.menu_name}' 가져오기</option>)}
                            <option value="ai">AI 초안으로 새로 등록</option>
                            <option value="exclude">메뉴 아님 — 이번만 제외</option>
                            <option value="later">나중에(그대로 둠)</option>
                          </select>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
            {failures.map(text => <p key={text} role="alert" className="pdf-menu-register__error">{text}</p>)}
            <div className="table-meals-modal__actions pdf-bulk__footer">
              <p className="pdf-menu-register__hint">
                본사 가져오기 {counts.standard} · 거래처 연결 {counts.account} · AI 초안 {counts.ai} · 제외 {counts.exclude} · 나중에 {counts.later}
                {counts.ai > 0 && <><br />AI 초안은 메뉴 1개에 약 5~10원(예상)이 들고, 사용량은 AI 사용 이력에 남습니다.</>}
              </p>
              {progress && <span className="pdf-bulk__progress" role="status">{progress}</span>}
              <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={close}>닫기</button>
              <button type="button" className="table-meals-modal__button is-primary" disabled={busy || !standardMenus || counts.later === rows.length}
                onClick={apply}>{busy ? '처리 중' : counts.ai > 0 ? '적용하고 AI 초안 만들기' : '적용'}</button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="table-meals-modal__body pdf-menu-register__body">
            {summary.length > 0 && <p className="pdf-bulk__notice">{summary.join(' ')}</p>}
            <p className="pdf-menu-register__hint">AI가 만든 초안입니다. 칼로리·식재료·1인분 사용량을 확인하고 고친 뒤 등록하세요. 식재료 이름이 거래처 식재료와 같으면 연결해 두었고, 없으면 '새 식재료'로 함께 추가합니다.</p>
            <ol className="pdf-bulk__drafts">
              {drafts.map((draft, index) => (
                <li key={draft.text} className={`pdf-bulk__draft${draft.include ? '' : ' is-off'}`}>
                  <div className="pdf-bulk__draft-head">
                    <label className="pdf-bulk__check"><input type="checkbox" checked={draft.include} onChange={event => updateDraft(index, { include: event.target.checked, error: '' })} /> 등록</label>
                    <input aria-label="메뉴명" value={draft.name} maxLength={100} onChange={event => updateDraft(index, { name: event.target.value })} />
                    <label className="pdf-bulk__kcal"><input aria-label="1인분 칼로리" type="number" min="1" step="1" inputMode="numeric" value={draft.calories} onChange={event => updateDraft(index, { calories: event.target.value })} /> kcal</label>
                    <small>PDF 표기 '{draft.text}'</small>
                  </div>
                  <div className="pdf-bulk__kinds">
                    <select aria-label="음식 분류" value={draft.category} onChange={event => updateDraft(index, { category: event.target.value })}>{mealCategoryOptions.map(option => <option key={option} value={option}>{option}</option>)}</select>
                    <select aria-label="메뉴유형" value={draft.menuType} onChange={event => updateDraft(index, { menuType: event.target.value })}>{menuTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</select>
                    <select aria-label="메뉴구분" value={draft.gubun} onChange={event => updateDraft(index, { gubun: event.target.value })}>{menuGubunOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</select>
                    <select aria-label="식단 유형" value={draft.planType} onChange={event => updateDraft(index, { planType: event.target.value })}>{mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</select>
                  </div>
                  <div className="pdf-bulk__rows">
                    {draft.rows.map(row => {
                      const option = row.ingredientId ? optionById.get(row.ingredientId) : undefined
                      const unit = option?.base_unit ?? row.newUnit
                      const mismatch = unitMismatch(row) && !row.qtyChecked
                      const similar = option ? [] : ingredients
                        .map(item => ({ item, score: menuSimilarity(row.newName || row.aiName, item.ingredient_name) }))
                        .filter(entry => entry.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 2)
                      return (
                        <div key={row.key} className="pdf-bulk__row">
                          <IngredientSearchSelect options={ingredients} placeholder="거래처 식재료에서 고르기" selectedName={option?.ingredient_name ?? ''} value={row.ingredientId}
                            onChange={ingredientId => updateRow(index, row.key, { ingredientId })} />
                          {option ? (
                            <button type="button" className="pdf-menu-register__link" onClick={() => updateRow(index, row.key, { ingredientId: '', newName: row.newName || row.aiName })}>새 식재료로</button>
                          ) : (
                            <span className="pdf-bulk__new">
                              <span className="pdf-menu-register__badge">새 식재료</span>
                              <input aria-label="새 식재료 이름" value={row.newName} maxLength={100} onChange={event => updateRow(index, row.key, { newName: event.target.value })} />
                              <select aria-label="기준단위" value={row.newUnit} onChange={event => updateRow(index, row.key, { newUnit: event.target.value })}><option value="g">g</option><option value="ml">ml</option><option value="EA">EA</option></select>
                            </span>
                          )}
                          <label className="pdf-menu-register__qty">
                            <input aria-label={`${option?.ingredient_name ?? row.newName} 1인분 사용량`} type="number" min="0" step="0.1" inputMode="decimal" value={row.qty} onChange={event => updateRow(index, row.key, { qty: event.target.value, qtyChecked: true })} />
                            <span>{unit}</span>
                          </label>
                          <button type="button" className="pdf-menu-register__remove" onClick={() => updateDraft(index, { rows: draft.rows.filter(item => item.key !== row.key) })}>삭제</button>
                          {mismatch && <small className="pdf-bulk__warn">AI는 {row.qty}{row.aiUnit}로 제안했습니다. 기준단위({option?.base_unit})로 사용량을 고쳐주세요(고치기 전에는 등록하지 않습니다).</small>}
                          {similar.length > 0 && <small className="pdf-bulk__similar">비슷한 거래처 식재료: {similar.map(({ item }) => <button type="button" key={item.ingredient_id} className="pdf-menu-register__link" onClick={() => updateRow(index, row.key, { ingredientId: item.ingredient_id })}>{item.ingredient_name}({item.base_unit})</button>)}</small>}
                        </div>
                      )
                    })}
                    <button type="button" className="pdf-bulk__add" onClick={() => updateDraft(index, { rows: [...draft.rows, { key: `d-${++rowSeq}`, aiName: '', ingredientId: '', newName: '', newUnit: 'g', newCategory: '', qty: '', aiUnit: '', qtyChecked: true }] })}>식재료 추가</button>
                  </div>
                  {draft.error && <p role="alert" className="pdf-menu-register__error">{draft.error}</p>}
                </li>
              ))}
            </ol>
            {failures.map(text => <p key={text} role="alert" className="pdf-menu-register__error">{text}</p>)}
            <div className="table-meals-modal__actions pdf-bulk__footer">
              <p className="pdf-menu-register__hint">등록하면 이 거래처에만 저장됩니다(본사 반영은 거래처 메뉴 관리에서 메뉴별로).</p>
              {progress && <span className="pdf-bulk__progress" role="status">{progress}</span>}
              <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={close}>나중에 하고 닫기</button>
              <button type="button" className="table-meals-modal__button is-primary" disabled={busy || draftCount === 0} onClick={registerDrafts}>{busy ? '등록 중' : `선택한 ${draftCount}개 등록`}</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="table-meals-modal__body pdf-menu-register__promote">
            {summary.length ? summary.map(line => <p key={line}>{line}</p>) : <p>바뀐 연결이 없습니다.</p>}
            {failures.map(text => <p key={text} role="alert" className="pdf-menu-register__error">{text}</p>)}
            {newIngredientCount > 0 && (
              <p className="pdf-bulk__notice">새 거래처 식재료 {newIngredientCount}개는 아직 공급사 상품과 연결되지 않아 재고·발주 계산에서 '상품 연결 필요'로 나옵니다. <a href={`/inventory/account-ingredients?account_id=${encodeURIComponent(accountId)}`} target="_blank" rel="noreferrer">거래처 재고 관리에서 연결하기</a></p>
            )}
            <div className="table-meals-modal__actions">
              <button type="button" className="table-meals-modal__button is-primary" onClick={close}>확인</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
