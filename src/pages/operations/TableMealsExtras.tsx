import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getBudgetSummary, priceTierOf, won, type AccountTemplates, type BudgetSummary, type MealPlanTemplate } from '../../api/mealPlanTemplates'
import { getTableMealsDetailList, getTableMealsList, type AccountMealConfiguration, type AccountOption, type MenuManagerItem, type TableMealsDetailItem, type TableMealsItem } from '../../api/operations'
import { getTableMealsQueryPeriod, type MealSlotRow } from '../../features/tableMeals/tableMealsView'
import { AUTO_WEEKDAY_LABELS, getAutoMenuCost, type ExtractedMenuItem, type ParsedDay } from '../../features/tableMeals/useTableMealsWorkspace'
import { mealPlanTypeOptions } from './menuManagerShared'
import './TableMealsExtras.css'

const planTypeName = (type: number) => mealPlanTypeOptions.find(option => Number(option.value) === type)?.text ?? `유형 ${type}`

/** 금액대 템플릿 불러오기: 거래처 1일 식단가와 같은 금액대(1,000원 단위 올림)의 템플릿만 보여준다 */
export function TemplatePickerDialog({ state, weekLabel, onPick, onClose }: {
  state: { loading: boolean; data?: AccountTemplates; error?: string }
  weekLabel: string
  onPick: (template: MealPlanTemplate) => void
  onClose: () => void
}) {
  const data = state.data
  return createPortal(<div className="tmx-backdrop" role="presentation" onClick={onClose}>
    <section className="tmx-dialog" role="dialog" aria-modal="true" aria-labelledby="tmx-template-title" onClick={event => event.stopPropagation()}>
      <header className="tmx-dialog__head">
        <h2 id="tmx-template-title">템플릿 식단표 불러오기</h2>
        <button type="button" className="tmx-close" aria-label="닫기" onClick={onClose}>×</button>
      </header>
      {state.loading ? <p role="status">템플릿을 찾고 있습니다.</p> : null}
      {data ? <p className="tmx-tier">
        거래처 1일 식단가 <strong>{won(data.daily_budget)}</strong>{data.budget_breakdown ? <small> ({data.budget_breakdown})</small> : null}
        {data.price_tier ? <> → <strong>{won(data.price_tier)} 금액대</strong> 템플릿</> : null}
      </p> : null}
      {data?.message ? <p role="alert" className="tmx-warn">{data.message}</p> : null}
      {state.error ? <p role="alert" className="tmx-warn">{state.error}</p> : null}
      {data && data.price_tier && data.templates.length === 0 ? <p className="tmx-muted">이 금액대·식단유형의 템플릿이 아직 없습니다. 본사에 템플릿 등록을 요청하거나 식단표 파일을 불러오세요.</p> : null}
      {data?.templates.length ? <ul className="tmx-template-list">
        {data.templates.map(template => <li key={template.meal_plan_template_id}>
          <div>
            <strong>{template.template_name}</strong>
            <small>{planTypeName(template.meal_plan_type)} · {template.template_seq}번 · {template.day_count}일 · 메뉴 {template.item_count}개{template.note ? ` · ${template.note}` : ''}</small>
          </div>
          <button type="button" className="tmx-btn is-primary" onClick={() => onPick(template)}>{weekLabel}에 불러오기</button>
        </li>)}
      </ul> : null}
      <p className="tmx-muted tmx-foot">불러온 뒤 메뉴를 바꾸고 예정 식수를 확인해 저장합니다. 식단가는 끼니마다 달라도 되고, 이번 주 합계로 맞추면 됩니다.</p>
    </section>
  </div>, document.body)
}

type SelectLike = (props: { value: string; onChange: (event: { target: { value: string } }) => void; children: ReactNode; 'aria-label'?: string; disabled?: boolean }) => ReactNode

/**
 * 본사: 다른 거래처 식단표 가져오기(2026-10-27). 거래처·월 → 저장된 식단표 → 메뉴 미리보기 → 선택한 주차 편집기로.
 * 터치 화면은 Select에 TouchSelect를 넘긴다.
 */
export function CopyPlanDialog({ accountOptions, currentAccountId, initialMonth, weekLabel, onApply, onClose, Select }: {
  accountOptions: AccountOption[]
  currentAccountId: string
  initialMonth: string
  weekLabel: string
  onApply: (plan: TableMealsItem, items: TableMealsDetailItem[]) => Promise<string | null>
  onClose: () => void
  Select?: SelectLike
}) {
  const [search, setSearch] = useState('')
  const [accountId, setAccountId] = useState('')
  const [month, setMonth] = useState(initialMonth)
  const [plans, setPlans] = useState<{ loading: boolean; rows: TableMealsItem[]; error?: string }>({ loading: false, rows: [] })
  const [picked, setPicked] = useState<TableMealsItem | null>(null)
  const [detail, setDetail] = useState<{ loading: boolean; rows: TableMealsDetailItem[]; error?: string }>({ loading: false, rows: [] })
  const [applying, setApplying] = useState(false)
  const keyword = search.trim().toLowerCase()
  const sources = accountOptions.filter(option => option.value !== currentAccountId && (!keyword || option.text.toLowerCase().includes(keyword)))

  // 바꾼 뒤 늦게 온 응답은 버린다
  const request = useRef(0)
  const loadPlans = (nextAccount: string, nextMonth: string) => {
    setAccountId(nextAccount); setMonth(nextMonth); setPicked(null); setDetail({ loading: false, rows: [] })
    const ticket = ++request.current
    if (!nextAccount || !/^\d{4}-\d{2}$/.test(nextMonth)) { setPlans({ loading: false, rows: [] }); return }
    const [year, monthNumber] = nextMonth.split('-').map(Number)
    setPlans({ loading: true, rows: [] })
    getTableMealsList(nextAccount, year, monthNumber)
      .then(rows => { if (ticket === request.current) setPlans({ loading: false, rows: rows.filter(row => row.account_id === nextAccount || !row.account_id) }) })
      .catch(error => { if (ticket === request.current) setPlans({ loading: false, rows: [], error: error instanceof Error ? error.message : '식단표 목록을 불러오지 못했습니다.' }) })
  }
  const pickPlan = (plan: TableMealsItem) => {
    setPicked(plan)
    const ticket = ++request.current
    setDetail({ loading: true, rows: [] })
    getTableMealsDetailList(plan.account_id || accountId, plan.table_id, getTableMealsQueryPeriod(plan, month))
      .then(rows => { if (ticket === request.current) setDetail({ loading: false, rows }) })
      .catch(error => { if (ticket === request.current) setDetail({ loading: false, rows: [], error: error instanceof Error ? error.message : '식단표 메뉴를 불러오지 못했습니다.' }) })
  }

  // 미리보기: 날짜 → 식사 → 메뉴
  const preview = new Map<string, Map<string, TableMealsDetailItem[]>>()
  for (const row of [...detail.rows].sort((a, b) => a.meal_date.localeCompare(b.meal_date) || Number(a.meal_slot_code ?? 0) - Number(b.meal_slot_code ?? 0) || a.sort_order - b.sort_order)) {
    const date = row.meal_date.slice(0, 10)
    const slots = preview.get(date) ?? new Map<string, TableMealsDetailItem[]>()
    const slot = row.meal_slot || String(row.meal_slot_code ?? '')
    slots.set(slot, [...(slots.get(slot) ?? []), row])
    preview.set(date, slots)
  }
  const apply = async () => {
    if (!picked) return
    const plan = { ...picked, account_id: picked.account_id || accountId }
    setApplying(true)
    const message = await onApply(plan, detail.rows)
    setApplying(false)
    if (message) setDetail(current => ({ ...current, error: message }))
  }
  const accountSelect = <>
    <option value="">거래처 선택</option>
    {sources.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
  </>

  return createPortal(<div className="tmx-backdrop" role="presentation" onClick={onClose}>
    <section className="tmx-dialog tmx-copy" role="dialog" aria-modal="true" aria-labelledby="tmx-copy-title" onClick={event => event.stopPropagation()}>
      <header className="tmx-dialog__head">
        <h2 id="tmx-copy-title">다른 거래처 식단표 가져오기</h2>
        <button type="button" className="tmx-close" aria-label="닫기" onClick={onClose}>×</button>
      </header>
      <div className={`tmx-copy__filters${Select ? ' is-touch' : ''}`}>
        {/* 터치는 TouchSelect 창 안에 찾기가 있다 */}
        {Select ? null : <label><span>거래처 찾기</span><input type="search" value={search} placeholder="거래처 이름" onChange={event => setSearch(event.target.value)} /></label>}
        <label><span>가져올 거래처</span>{Select
          ? <Select aria-label="가져올 거래처" value={accountId} onChange={event => loadPlans(event.target.value, month)}>{accountSelect}</Select>
          : <select aria-label="가져올 거래처" value={accountId} onChange={event => loadPlans(event.target.value, month)}>{accountSelect}</select>}</label>
        <label><span>월</span><input type="month" value={month} onChange={event => loadPlans(accountId, event.target.value)} /></label>
      </div>
      {plans.loading ? <p role="status" className="tmx-muted">식단표를 찾고 있습니다.</p> : null}
      {plans.error ? <p role="alert" className="tmx-warn">{plans.error}</p> : null}
      {accountId && !plans.loading && !plans.error && plans.rows.length === 0 ? <p className="tmx-muted">이 달에 저장된 식단표가 없습니다.</p> : null}
      {plans.rows.length ? <ul className="tmx-template-list">
        {plans.rows.map(plan => <li key={plan.table_id} className={picked?.table_id === plan.table_id ? 'is-picked' : undefined}>
          <div>
            <strong>{plan.table_name}</strong>
            <small>{planTypeName(plan.meal_plan_type)}{plan.created_at ? ` · 저장 ${plan.created_at.slice(0, 10)}` : ''}</small>
          </div>
          <button type="button" className="tmx-btn" onClick={() => pickPlan(plan)}>{picked?.table_id === plan.table_id ? '보는 중' : '메뉴 보기'}</button>
        </li>)}
      </ul> : null}
      {picked ? <div className="tmx-copy__preview" aria-label="가져올 메뉴">
        {detail.loading ? <p role="status" className="tmx-muted">메뉴를 불러오고 있습니다.</p> : null}
        {[...preview].map(([date, slots]) => <div key={date} className="tmx-copy__day">
          <strong>{AUTO_WEEKDAY_LABELS[(new Date(`${date}T00:00:00`).getDay() + 6) % 7]} {date.slice(5).replace('-', '/')}</strong>
          {[...slots].map(([slot, rows]) => <p key={slot}><b>{slot}</b>{rows.map((row, index) => <span key={`${row.menu_id}-${index}`} className={row.special_yn === 'Y' ? 'is-special' : undefined}>{row.menu_name}</span>)}</p>)}
        </div>)}
      </div> : null}
      {/* 식단표 머리만 있고 메뉴 줄이 없는 경우(예: 메뉴 표를 다시 만든 뒤) 아무 일도 안 일어난 것처럼 보이지 않게 */}
      {picked && !detail.loading && !detail.error && detail.rows.length === 0 ? <p role="alert" className="tmx-warn">'{picked.table_name}'에는 저장된 메뉴가 없어 가져올 수 없습니다. 다른 식단표를 고르거나, 그 거래처에서 식단을 다시 저장해 주세요.</p> : null}
      {detail.error ? <p role="alert" className="tmx-warn">{detail.error}</p> : null}
      <div className="tmx-actions">
        <button type="button" className="tmx-btn" onClick={onClose}>닫기</button>
        <button type="button" className="tmx-btn is-primary" disabled={!picked || detail.loading || !detail.rows.length || applying} onClick={() => void apply()}>
          {applying ? '가져오는 중…' : `${weekLabel}에 가져오기`}
        </button>
      </div>
      <p className="tmx-muted tmx-foot">같은 요일로 들어가고, 이 거래처 식사 구성에 없는 식사와 거래처 전용 메뉴는 빠집니다. 원가·필요량은 이 거래처 레시피로 다시 계산되니 메뉴를 확인하고 예정 식수를 넣어 저장하세요.</p>
    </section>
  </div>, document.body)
}

type CellLookup = (day: ParsedDay, slot: MealSlotRow) => ExtractedMenuItem[]

/**
 * 편집 중인 주의 식단가 정산(2026-10-22): 끼니별로 넘어도 막지 않고 주 합계로 보여준다.
 * 특식 메뉴 때문에 넘은 금액(초과분 중 특식 메뉴 원가까지)은 주 합계에서 빼고 '특식 초과'로 따로(서버 budgetSummary와 같은 규칙).
 */
export function WeekBudgetBar({ days, slots, items, configuration }: {
  days: ParsedDay[]
  slots: MealSlotRow[]
  items: CellLookup
  configuration: AccountMealConfiguration | null
}) {
  let budget = 0, cost = 0, specialOver = 0, unpriced = 0, overMeals = 0
  for (const day of days) {
    for (const slot of slots) {
      const list = items(day, slot)
      if (!list.length) continue
      const slotBudget = configuration?.profiles.find(profile => profile.meal_slot_code === slot.code)?.budget_per_person ?? null
      const included = configuration?.profiles.find(profile => profile.meal_slot_code === slot.code)?.budget_source === 'INCLUDED_IN_DIET_PRICE'
      let slotCost = 0, specialCost = 0
      for (const item of list) {
        const value = item.matchedMenu ? getAutoMenuCost(item.matchedMenu as MenuManagerItem) : 0
        if (value <= 0) unpriced++
        slotCost += value
        if (item.special) specialCost += value
      }
      const limit = slotBudget ?? 0
      const over = included ? 0 : Math.max(slotCost - limit, 0)
      const specialPart = Math.min(over, specialCost)
      if (over - specialPart > 0) overMeals++
      specialOver += specialPart; slotCost -= specialPart
      budget += limit
      cost += slotCost
    }
  }
  const balance = budget - cost
  if (budget === 0 && cost === 0) return null
  const pct = budget ? Math.min(100, Math.round(cost / budget * 100)) : 0
  return <div className={`tmx-budget${balance < 0 ? ' is-over' : ''}`} role="status" aria-label="이번 주 식단가 정산">
    <div className="tmx-budget__nums">
      <span>이번 주 식단가 합계 <strong>{won(budget)}</strong></span>
      <span>원가 합계 <strong>{won(cost)}</strong></span>
      <span className={balance < 0 ? 'tmx-text-over' : 'tmx-text-ok'}>{balance < 0 ? `${won(-balance)} 초과 · 다른 식사에서 조절 요망` : `${won(balance)} 남음`}</span>
      {specialOver > 0 ? <span className="tmx-special">특식 초과 {won(specialOver)} 별도</span> : null}
      {overMeals > 0 ? <span className="tmx-muted">식단가를 넘은 끼니 {overMeals}개(저장은 됩니다)</span> : null}
      {unpriced > 0 ? <span className="tmx-muted">단가 미등록 메뉴 {unpriced}개는 원가에 빠짐</span> : null}
    </div>
    <span className="tmx-budget__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    <small className="tmx-muted">1인 기준 · 끼니별 식단가는 목표값이고 주 합계로 맞추면 됩니다.</small>
  </div>
}

/** 저장된 식단표의 주간 식단가 정산(서버 계산) */
export function SavedBudgetCard({ accountId, tableId, revision }: { accountId: string; tableId: string; revision: number }) {
  const [result, setResult] = useState<{ key: string; summary?: BudgetSummary; error?: string } | null>(null)
  const key = `${accountId}:${tableId}:${revision}`
  useEffect(() => {
    if (!accountId || !tableId) return
    let alive = true
    getBudgetSummary(accountId, tableId)
      .then(summary => { if (alive) setResult({ key, summary }) })
      .catch(error => { if (alive) setResult({ key, error: error instanceof Error ? error.message : '식단가 정산을 불러오지 못했습니다.' }) })
    return () => { alive = false }
  }, [accountId, tableId, key])
  const current = result?.key === key ? result : null
  if (!current) return <div className="rd-card rd-meals__box"><h2 className="rd-h2">이번 주 식단가</h2><p className="rd-muted rd-fs-sm">계산하고 있어요.</p></div>
  if (current.error || !current.summary) return <div className="rd-card rd-meals__box"><h2 className="rd-h2">이번 주 식단가</h2><p className="rd-text-warn rd-fs-sm">{current.error}</p></div>
  const s = current.summary
  const specials = s.meals.filter(meal => meal.special_yn === 'Y')
  return <div className={`rd-card rd-meals__box tmx-saved${s.over_budget ? ' is-over' : ''}`}>
    <h2 className="rd-h2">이번 주 식단가</h2>
    <dl className="tmx-saved__nums">
      <div><dt>식단가 합계</dt><dd>{won(s.budget_total)}</dd></div>
      <div><dt>원가 합계</dt><dd>{won(s.cost_total)}</dd></div>
      <div><dt>{s.balance < 0 ? '초과' : '남음'}</dt><dd className={s.balance < 0 ? 'tmx-text-over' : 'tmx-text-ok'}>{won(Math.abs(s.balance))}</dd></div>
    </dl>
    <p className="rd-fs-sm">{s.message}</p>
    {specials.length ? <p className="rd-muted rd-fs-xs">특식: {specials.map(meal => `${meal.meal_date.slice(5)} ${meal.meal_slot_name}${meal.special_note ? `(${meal.special_note})` : ''}`).join(', ')}</p> : null}
    {s.meals.some(meal => meal.over_budget && meal.special_yn !== 'Y') ? <details className="rd-fs-xs"><summary>식단가를 넘은 끼니</summary>
      <ul>{s.meals.filter(meal => meal.over_budget && meal.special_yn !== 'Y').map(meal => <li key={meal.meal_service_id}>{meal.meal_date.slice(5)} {meal.meal_slot_name} +{won(meal.difference)}</li>)}</ul>
    </details> : null}
  </div>
}

/** 본사: 편집 중인 식단을 금액대 템플릿으로 저장 */
export function SaveTemplateDialog({ defaultTier, mealPlanType, onSave, onClose }: {
  defaultTier: number
  mealPlanType: number
  onSave: (form: { price_tier: number; meal_plan_type: number; template_seq: number; template_name: string }) => Promise<unknown>
  onClose: () => void
}) {
  const [tier, setTier] = useState(String(defaultTier || ''))
  const [type, setType] = useState(mealPlanType)
  const [seq, setSeq] = useState(1)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    const value = priceTierOf(Number(tier))
    if (!value) { setMessage('금액대(1일 식단가)를 입력해주세요.'); return }
    if (!name.trim()) { setMessage('템플릿 이름을 입력해주세요.'); return }
    setSaving(true); setMessage('')
    try { await onSave({ price_tier: value, meal_plan_type: type, template_seq: seq, template_name: name.trim() }); onClose() }
    catch (error) { setMessage(error instanceof Error ? error.message : '템플릿을 저장하지 못했습니다.') }
    finally { setSaving(false) }
  }
  return createPortal(<div className="tmx-backdrop" role="presentation" onClick={onClose}>
    <section className="tmx-dialog is-small" role="dialog" aria-modal="true" aria-labelledby="tmx-save-template-title" onClick={event => event.stopPropagation()}>
      <header className="tmx-dialog__head"><h2 id="tmx-save-template-title">이 식단을 템플릿 식단표로 저장</h2><button type="button" className="tmx-close" aria-label="닫기" onClick={onClose}>×</button></header>
      <div className="tmx-form">
        <label>1일 식단가(금액대)<input type="number" min="1000" step="1000" value={tier} onChange={event => setTier(event.target.value)} />
          <small>{Number(tier) > 0 ? `${won(priceTierOf(Number(tier)))} 금액대로 저장 (${won(priceTierOf(Number(tier)) - 999)} ~ ${won(priceTierOf(Number(tier)))})` : '조·중·석 합계 1인 식단가'}</small></label>
        <label>식단유형<select value={type} onChange={event => setType(Number(event.target.value))}>{mealPlanTypeOptions.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}</select></label>
        <label>순번<select value={seq} onChange={event => setSeq(Number(event.target.value))}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}번</option>)}</select><small>같은 금액대·유형은 3개까지</small></label>
        <label>이름<input value={name} maxLength={100} placeholder="예: 13,000원 일반식 A" onChange={event => setName(event.target.value)} /></label>
      </div>
      {message ? <p role="alert" className="tmx-warn">{message}</p> : null}
      <div className="tmx-actions"><button type="button" className="tmx-btn" onClick={onClose}>닫기</button><button type="button" className="tmx-btn is-primary" disabled={saving} onClick={() => void submit()}>{saving ? '저장 중…' : '템플릿 저장'}</button></div>
    </section>
  </div>, document.body)
}
