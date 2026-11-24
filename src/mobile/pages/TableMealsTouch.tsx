import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import { useTableMealsView } from '../../features/tableMeals/useTableMealsView'
import { parseMonthValue, type MealSlotRow, type TableMealsDetailDay } from '../../features/tableMeals/tableMealsView'
import { dayLabel, qty, statusLabel, useMealUsage, type Meal } from '../../features/mealUsage/useMealUsage'
import type { TableMealsItem } from '../../api/operations'
import TableMealsCreateTouch from './TableMealsCreateTouch'
import AccountRecipeEditModal from '../../pages/operations/AccountRecipeEditModal'
import MealDocumentButtons from '../../features/tableMeals/MealDocumentButtons'
import { isHeadquarters } from '../../features/workspace/workspaceAccount'
import './TableMealsTouch.css'
import TableMealsManager from '../../pages/operations/TableMealsManager'

/** 태블릿(700px 이상) 여부 — 화면을 열 때 한 번만(deviceMode와 같은 원칙) */
const IS_TABLET = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 700px)').matches)
import { isMainSlot } from '../../api/mealSlots'
import { getBudgetSummary, type BudgetSummary } from '../../api/mealPlanTemplates'
import MenuOrigins from '../../pages/operations/MenuOrigins'
import { confirmDialog } from '../../utils/dialog'

const SOURCE_LABEL: Record<string, string> = { auto: '자동', pdf: '파일', manual: '수기', template: '템플릿' }
const noop = () => {}
const today = () => new Date().toLocaleDateString('sv-SE')
const weekLabel = (table: TableMealsItem) => Number.isFinite(table.table_week) ? `${table.table_week}주차` : table.table_name
const mealTone = (meal: Meal) => meal.status === 'COMPLETED' ? 'is-ok' : Number(meal.needs_reconfirm) ? 'is-warn' : meal.confirmable ? 'is-yellow' : ''
type Usage = ReturnType<typeof useMealUsage>

/**
 * 식단표(태블릿·휴대폰). POS 배치(레퍼런스 CHILI POS): 가운데 주차 → 요일 칸 → 식사 카드, 오른쪽 '사용 확정' 패널.
 * 요일은 칸을 누르거나 본문을 좌우로 밀어 바꾼다. 로직은 features(PC 식단표와 공용).
 */
/** 식단표 화면 + 만들기 화면 전환. 만들기를 닫으면 조회 화면을 새로 열어 방금 저장한 식단표가 보이게 한다 */
export default function TableMealsTouch() {
  // 2026-11-23 사용자 결정: 태블릿 식단표 = 브라우저 디자인(PC 본문을 태블릿 틀에). 휴대폰은 아래 터치 화면 그대로
  return IS_TABLET ? <TableMealsManager shell="tablet" /> : <PhoneTableMeals />
}

function PhoneTableMeals() {
  const [creating, setCreating] = useState(false)
  const [revision, setRevision] = useState(0)
  if (creating) return <TableMealsCreateTouch onClose={() => { setCreating(false); setRevision(v => v + 1) }} />
  return <TableMealsView key={revision} onCreate={() => setCreating(true)} />
}

function TableMealsView({ onCreate }: { onCreate: () => void }) {
  const view = useTableMealsView()
  const { year, month } = parseMonthValue(view.month)
  const table = view.selectedTable
  const accountId = table?.account_id || view.accountId

  // 2026-10-28: 식단표는 본사가 만들어 올리므로 '식단표 만들기'는 본사만
  const toolbar = <>{isHeadquarters() ? <button type="button" className="t-btn is-primary" onClick={onCreate}><span aria-hidden="true">＋</span>식단표 만들기</button> : null}<div className="t-chip tm-month" role="group" aria-label="조회 월">
    <button type="button" className="t-btn is-ghost is-icon" aria-label="이전 달" onClick={() => view.shiftMonth(-1)}><TouchIcon name="chevronLeft" /></button>
    <strong><TouchIcon name="calendar" size={20} />{year}년 {month}월</strong>
    <button type="button" className="t-btn is-ghost is-icon" aria-label="다음 달" onClick={() => view.shiftMonth(1)}><TouchIcon name="chevronRight" /></button>
  </div></>

  const ready = Boolean(table && !view.isDetailLoading && !view.detailError && view.detailDays.length > 0)

  if (!ready || !table) {
    return <TouchLayout title="식단표" toolbar={toolbar} onAccountChange={view.setAccountId}>
      <WeekSwitch tables={view.tables} selected={table} onSelect={view.setSelectedTable} />
      {view.accountError && <p className="t-msg is-error">{view.accountError}</p>}
      {!view.accountId && <p className="t-msg">위에서 거래처를 고르면 식단표가 나옵니다.</p>}
      {view.accountId && view.isTablesLoading && <p className="t-msg" role="status">식단표를 불러오는 중…</p>}
      {view.tablesError && <p className="t-msg is-error">{view.tablesError}</p>}
      {view.accountId && !view.isTablesLoading && !view.tablesError && view.tables.length === 0 && <p className="t-msg">{month}월에 저장된 식단표가 없습니다.</p>}
      {table && view.isDetailLoading && <p className="t-msg" role="status">식단을 불러오는 중…</p>}
      {table && view.detailError && <p className="t-msg is-error">{view.detailError}</p>}
      {table && !view.isDetailLoading && !view.detailError && view.detailDays.length === 0 && <p className="t-msg">이 식단표에 등록된 메뉴가 없습니다.</p>}
    </TouchLayout>
  }

  const createButton = isHeadquarters() ? <button type="button" className="t-btn is-primary" onClick={onCreate}><span aria-hidden="true">＋</span>식단표 만들기</button> : null
  return <WeekView key={table.table_id} table={table} accountId={accountId} tables={view.tables} onSelectTable={view.setSelectedTable}
    days={view.detailDays} slotRows={view.slotRows} toolbar={createButton} onAccountChange={view.setAccountId}
    monthLabel={`${year}년 ${month}월`} onShiftMonth={view.shiftMonth} />
}

/** 주차 고르기(이 달에 저장된 식단표) */
function WeekSwitch({ tables, selected, onSelect }: { tables: TableMealsItem[]; selected: TableMealsItem | null; onSelect: (table: TableMealsItem) => void }) {
  if (tables.length === 0) return null
  return <div className="t-segment tm-weeks" role="tablist" aria-label="주차">
    {tables.map(table => <button key={table.table_id} type="button" role="tab" aria-selected={selected?.table_id === table.table_id}
      className={selected?.table_id === table.table_id ? 'is-active' : ''} onClick={() => onSelect(table)}>
      {weekLabel(table)}
      {table.source && <small>{SOURCE_LABEL[table.source] || table.source}</small>}
    </button>)}
  </div>
}

function WeekView({ table, accountId, tables, onSelectTable, days, slotRows, toolbar, onAccountChange, monthLabel, onShiftMonth }: {
  table: TableMealsItem
  accountId: string
  tables: TableMealsItem[]
  onSelectTable: (table: TableMealsItem) => void
  days: TableMealsDetailDay[]
  slotRows: Array<Pick<MealSlotRow, 'id' | 'key' | 'label'>>
  toolbar: ReactNode
  onAccountChange: (accountId: string) => void
  monthLabel: string
  onShiftMonth: (delta: number) => void
}) {
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex(day => day.date === today())))
  const usage = useMealUsage(accountId, table.table_id, noop)
  /** 이 업장 레시피 수정 창(메뉴를 누르면 연다) */
  const [recipeMenu, setRecipeMenu] = useState<{ menu_id: string; menu_name: string } | null>(null)
  const [recipeNotice, setRecipeNotice] = useState('')
  const day = days[Math.min(dayIndex, days.length - 1)]
  const usageByDate = useMemo(() => new Map(usage.days.map(d => [d.date, d])), [usage.days])
  const dayUsage = usageByDate.get(day.date)

  // 2026-11-23 사용자 시안(휴대폰): 이번 주 식단가 카드(주차 ‹ › · 식단가 총액 · 남은 금액) → 주간식단표 카드(요일 고르기 → 그날 식사별 메뉴,
  // 예정 식수 · 다운로드) → 주간 칼로리 한 줄(원산지). 예정 식수 = 식사별 계획 식수 · 사용 확정 창, 메뉴를 누르면 이 업장 레시피 수정(예전 그대로).
  const [sheet, setSheet] = useState<'' | 'usage' | 'download' | 'origin' | 'weeks'>('')
  const [budget, setBudget] = useState<{ key: string; data?: BudgetSummary; error?: string } | null>(null)
  const budgetKey = `${accountId}:${table.table_id}`
  useEffect(() => {
    if (!accountId) return
    let alive = true
    getBudgetSummary(accountId, table.table_id)
      .then(data => { if (alive) setBudget({ key: budgetKey, data }) })
      .catch(e => { if (alive) setBudget({ key: budgetKey, error: e instanceof Error ? e.message : '식단가를 불러오지 못했습니다.' }) })
    return () => { alive = false }
  }, [accountId, table.table_id, budgetKey])
  const summary = budget?.key === budgetKey ? budget.data : undefined
  const tableIndex = tables.findIndex(item => item.table_id === table.table_id)
  const stepTable = (delta: number) => { const next = tables[tableIndex + delta]; if (next) onSelectTable(next); else onShiftMonth(delta) }
  const won = (v: number) => `${Math.round(v).toLocaleString('ko-KR')}원`
  const mainRows = slotRows.filter(row => { const full = row as MealSlotRow; return full.code != null ? isMainSlot(full.code, full.kind) : !row.label.includes('간식') })
  const kcalOf = (menus: { calories_per_serving?: number }[]) => menus.reduce((sum, m) => sum + (Number(m.calories_per_serving) > 0 ? Number(m.calories_per_serving) : 0), 0)
  const label = Number.isFinite(table.table_week) ? `${table.table_month ?? ''}월 ${table.table_week}주차` : table.table_name
  const range = days.length ? `${days[0].date.replace(/-/g, '.')} ~ ${days[days.length - 1].date.slice(5).replace('-', '.')}` : ''
  const menuIds = [...new Set(days.flatMap(d => slotRows.flatMap(row => (d.meals[row.key] || []).map(m => m.menu_id)).filter(Boolean)))] as string[]

  return <TouchLayout title="식단표 관리" subtitle={table.table_name} toolbar={toolbar} onAccountChange={onAccountChange}>
    <section className="t-card mm-budget" aria-label="이번 주 식단가">
      <h2>이번 주 식단가</h2>
      <div className="mm-week">
        <button type="button" className="mm-week__arrow" aria-label="이전 식단표" onClick={() => stepTable(-1)}><TouchIcon name="chevronLeft" size={14} /></button>
        <button type="button" className="mm-week__label" aria-label="주 고르기" onClick={() => setSheet('weeks')}><strong>{label}</strong><small>{range}</small></button>
        <button type="button" className="mm-week__arrow" aria-label="다음 식단표" onClick={() => stepTable(1)}><TouchIcon name="chevronRight" size={14} /></button>
      </div>
      {summary ? <>
        <dl className="mm-budget__nums">
          <div><dt>식단가 총액</dt><dd>{won(summary.budget_total)}</dd></div>
          <div><dt>{summary.balance < 0 ? '초과 금액' : '남은 금액'}</dt><dd className={summary.balance < 0 ? 'is-over' : 'is-ok'}>{won(Math.abs(summary.balance))}</dd></div>
        </dl>
        <p className="mm-budget__msg">{summary.message}</p>
      </> : <p className="mm-budget__msg">{budget?.error || '식단가를 계산하고 있어요.'}</p>}
    </section>

    <section className="t-card mm-plan" aria-label="주간식단표">
      <header><h2>주간식단표</h2><span className="mm-pill">{table.account_name || '내 거래처'}</span></header>
      <div className="mm-days" role="tablist" aria-label="요일">
        {days.map((d, index) => <button key={d.key} type="button" role="tab" aria-selected={index === dayIndex} className={`mm-day${index === dayIndex ? ' is-active' : ''}${d.date === today() ? ' is-today' : ''}`} onClick={() => setDayIndex(index)}>
          <small>{d.weekday || dayLabel(d.date).split(' ')[0]}</small><b>{Number(d.date.slice(8, 10))}</b>
        </button>)}
      </div>
      <ul className="mm-slots">
        {slotRows.map(row => {
          const menus = day.meals[row.key] || []
          const main = mainRows.some(m => m.id === row.id)
          const meal = dayUsage?.meals.find(m => m.meal_slot === row.label)
          return <li key={row.id} className={main ? 'is-main' : 'is-snack'}>
            <span className="mm-slots__label">{row.label}</span>
            <span className="mm-slots__menus">{menus.length ? menus.map((menu, i) => <span key={`${menu.sort_order}-${menu.menu_id || menu.menu_name}`}>
              {i > 0 ? ' · ' : ''}{menu.menu_id
                ? <button type="button" className={`mm-menu${menu.special_yn === 'Y' ? ' is-special' : ''}`} title="눌러서 이 업장 레시피 수정" onClick={() => setRecipeMenu({ menu_id: menu.menu_id, menu_name: menu.menu_name || menu.menu_id })}>{menu.special_yn === 'Y' ? '★ ' : ''}{menu.menu_name || '-'}</button>
                : menu.menu_name || '-'}
            </span>) : '—'}
              {meal ? <span className={`t-badge ${mealTone(meal)} mm-slots__state`}>{statusLabel(meal)}</span> : null}</span>
          </li>
        })}
      </ul>
      {recipeNotice && <p className="t-msg" role="status">{recipeNotice}</p>}
      <div className="mm-plan__actions">
        <button type="button" className="mm-btn is-orange" onClick={() => setSheet('usage')}>예정 식수</button>
        <button type="button" className="mm-btn is-green" onClick={() => setSheet('download')}>다운로드</button>
      </div>
    </section>

    <section className="t-card mm-kcal" aria-label="주간 칼로리">
      <header><h2>주간 칼로리</h2><button type="button" className="mm-link" onClick={() => setSheet('origin')}>원산지</button></header>
      <p>{mainRows.map(row => `${row.label} ${Math.round(kcalOf(day.meals[row.key] || [])).toLocaleString('ko-KR')} kcal`).join(' · ') || '등록된 열량이 없어요.'}</p>
      <small>{dayLabel(day.date)} · 1인분 기준</small>
    </section>

    {sheet === 'usage' && <div className="t-sheet-backdrop" role="presentation" onClick={() => setSheet('')}>
      <section className="t-sheet mm-sheet" role="dialog" aria-modal="true" aria-label="예정 식수 · 사용 확정" onClick={e => e.stopPropagation()}>
        <UsagePanel day={day} dayUsage={dayUsage} usage={usage} />
        <footer className="t-sheet__actions"><button type="button" className="t-btn is-large" onClick={() => setSheet('')}>닫기</button></footer>
      </section>
    </div>}
    {sheet === 'download' && <div className="t-sheet-backdrop" role="presentation" onClick={() => setSheet('')}>
      <section className="t-sheet mm-sheet" role="dialog" aria-modal="true" aria-labelledby="mm-dl-title" onClick={e => e.stopPropagation()}>
        <header className="t-sheet__head"><h2 id="mm-dl-title">다운로드</h2><p>조리계획표 · 급식운영일지(엑셀), 보존식 라벨(PDF)</p></header>
        <div className="t-sheet__body"><MealDocumentButtons accountId={accountId} tableId={table.table_id} buttonClassName="t-btn is-block" className="tm-docs mm-docs" /></div>
        <footer className="t-sheet__actions"><button type="button" className="t-btn is-large" onClick={() => setSheet('')}>닫기</button></footer>
      </section>
    </div>}
    {sheet === 'origin' && <div className="t-sheet-backdrop" role="presentation" onClick={() => setSheet('')}>
      <section className="t-sheet mm-sheet" role="dialog" aria-modal="true" aria-labelledby="mm-origin-title" onClick={e => e.stopPropagation()}>
        <header className="t-sheet__head"><h2 id="mm-origin-title">원산지</h2></header>
        <div className="t-sheet__body"><MenuOrigins key={table.table_id} tableId={table.table_id} accountId={accountId} menuIds={menuIds} /></div>
        <footer className="t-sheet__actions"><button type="button" className="t-btn is-large" onClick={() => setSheet('')}>닫기</button></footer>
      </section>
    </div>}
    {sheet === 'weeks' && <div className="t-sheet-backdrop" role="presentation" onClick={() => setSheet('')}>
      <section className="t-sheet mm-sheet" role="dialog" aria-modal="true" aria-labelledby="mm-weeks-title" onClick={e => e.stopPropagation()}>
        <header className="t-sheet__head"><h2 id="mm-weeks-title">주 고르기</h2></header>
        <div className="t-sheet__body">
          <div className="mm-week mm-week--month">
            <button type="button" className="mm-week__arrow" aria-label="이전 달" onClick={() => onShiftMonth(-1)}><TouchIcon name="chevronLeft" size={14} /></button>
            <strong>{monthLabel}</strong>
            <button type="button" className="mm-week__arrow" aria-label="다음 달" onClick={() => onShiftMonth(1)}><TouchIcon name="chevronRight" size={14} /></button>
          </div>
          <WeekSwitch tables={tables} selected={table} onSelect={next => { onSelectTable(next); setSheet('') }} />
        </div>
        <footer className="t-sheet__actions"><button type="button" className="t-btn is-large" onClick={() => setSheet('')}>닫기</button></footer>
      </section>
    </div>}
    {usage.open && <UsageSheet usage={usage} accountId={accountId} />}
    {recipeMenu && accountId ? <AccountRecipeEditModal accountId={accountId} menuId={recipeMenu.menu_id} menuName={recipeMenu.menu_name}
      onClose={() => setRecipeMenu(null)} onSaved={setRecipeNotice} /> : null}
  </TouchLayout>
}


/** 오른쪽 패널(레퍼런스의 주문 패널): 제목 → 이 날/이번 주 → 식사 카드 목록 → 합계 상자 → 큰 확정 버튼 */
function UsagePanel({ day, dayUsage, usage }: { day: TableMealsDetailDay; dayUsage: Usage['days'][number] | undefined; usage: Usage }) {
  const [scope, setScope] = useState<'day' | 'week'>('day')
  const list = scope === 'day' ? dayUsage?.meals || [] : usage.meals
  const waiting = scope === 'day' ? dayUsage?.confirmable || [] : usage.confirmable
  const done = list.filter(meal => meal.status === 'COMPLETED').length
  const planned = list.reduce((sum, meal) => sum + Number(meal.planned_servings || 0), 0)
  const scopeLabel = scope === 'day' ? dayLabel(day.date) : '주간'

  const cancelMeal = async (meal: Meal) => {
    if (!(await confirmDialog(`${dayLabel(meal.meal_date)} ${meal.meal_slot} 사용 확정을 취소할까요?\n차감했던 재고가 복원되고, 다시 확정해야 합니다.`))) return
    await usage.cancelMeal(meal)
  }

  return <div className="tm-panel">
    <div className="tm-panel__head">
      <div>
        <h2>사용 확정</h2>
        <p>식사를 낸 뒤 실제 식수로 확정하면 재고가 빠집니다.</p>
      </div>
    </div>

    <div className="tm-panel__body">
      <div className="t-segment" role="tablist" aria-label="확정 범위">
        <button type="button" role="tab" aria-selected={scope === 'day'} className={scope === 'day' ? 'is-active' : ''} onClick={() => setScope('day')}>{dayLabel(day.date)}</button>
        <button type="button" role="tab" aria-selected={scope === 'week'} className={scope === 'week' ? 'is-active' : ''} onClick={() => setScope('week')}>이번 주 전체</button>
      </div>

      {usage.error && <p className="t-msg is-error" role="alert">{usage.error}</p>}
      {usage.allowUnserved && <p className="t-msg is-warn">테스트 모드: 제공 전 식사도 확정(재고 차감)할 수 있습니다.</p>}
      {usage.reconfirm > 0 && <p className="t-msg is-warn">식단 수정으로 확정이 풀린 식사 {usage.reconfirm}식 · 다시 확정해야 재고가 맞습니다.</p>}

      {list.length === 0 && !usage.error && <p className="tm-panel__empty">확정할 식사가 없습니다.</p>}
      <ul className="tm-meals">
        {list.map(meal => <li key={meal.meal_service_id} className={meal.confirmable ? 'is-waiting' : ''}>
          <span className="t-dot">{meal.meal_slot.slice(0, 1)}</span>
          <div>
            <strong>{scope === 'week' ? `${dayLabel(meal.meal_date)} · ` : ''}{meal.meal_slot}</strong>
            <small>계획 {qty(meal.planned_servings)}명{meal.status === 'COMPLETED' ? ` · 실제 ${qty(meal.actual_servings || 0)}명` : ''}</small>
          </div>
          {meal.status === 'COMPLETED'
            ? <button type="button" className="t-btn is-small is-ghost" disabled={usage.busy} onClick={() => void cancelMeal(meal)}>취소</button>
            : <span className={`t-badge ${mealTone(meal)}`}>{statusLabel(meal)}</span>}
        </li>)}
      </ul>
    </div>

    <div className="tm-panel__actions">
      <div className="t-summary">
        <div><span>계획 식수</span><span>{qty(planned)}명</span></div>
        <div><span>확정 완료</span><span>{done}/{list.length}식</span></div>
        <div className="is-total"><span>확정 대기</span><span>{waiting.length}식</span></div>
      </div>
      <button type="button" className="t-btn is-primary is-large is-block" disabled={usage.busy || waiting.length === 0}
        onClick={() => usage.openDialog(waiting, scopeLabel)}>
        {waiting.length > 0 ? `${scopeLabel} 사용 확정` : list.length > 0 && done === list.length ? '모두 확정됨' : '확정할 식사 없음'}
      </button>
    </div>
  </div>
}

function UsageSheet({ usage, accountId }: { usage: Usage; accountId: string }) {
  const { targets, servings, preview, step, busy, modalError, shortageCount, scopeLabel } = usage
  const editable = !busy && step !== 'final'
  const stepIndex = step === 'input' ? 1 : step === 'preview' ? 2 : 3
  const bump = (meal: Meal, delta: number) => {
    const next = Math.max(1, (Number(servings[meal.meal_service_id]) || 0) + delta)
    usage.changeServings(meal.meal_service_id, String(next))
  }

  return <div className="t-sheet-backdrop" role="presentation" onClick={usage.closeDialog}>
    <section className="t-sheet" role="dialog" aria-modal="true" aria-labelledby="tm-sheet-title" onClick={e => e.stopPropagation()}>
      <header className="t-sheet__head">
        <h2 id="tm-sheet-title">{scopeLabel} 사용 확정</h2>
        <p>{stepIndex}단계 · {step === 'input' ? '실제로 낸 식수를 확인하세요' : step === 'preview' ? '재고에서 빠질 식재료를 확인하세요' : '마지막으로 확인하세요'}</p>
        <div className="t-steps" aria-hidden="true">{[1, 2, 3].map(n => <span key={n} className={n <= stepIndex ? 'is-done' : ''} />)}</div>
      </header>
      <div className="t-sheet__body">
        {modalError && <p className="t-msg is-error" role="alert">{modalError}</p>}

        <ul className="tm-servings">
          {targets.map(meal => <li key={meal.meal_service_id}>
            <span className="t-dot">{meal.meal_slot.slice(0, 1)}</span>
            <div className="tm-servings__label">
              <strong>{dayLabel(meal.meal_date)} · {meal.meal_slot}</strong>
              <small>계획 {qty(meal.planned_servings)}명{Number(meal.needs_reconfirm) ? ' · 재확정' : ''}</small>
            </div>
            <div className="tm-stepper">
              <button type="button" className="tm-stepper__ten" aria-label="10명 줄이기" disabled={!editable} onClick={() => bump(meal, -10)}>−10</button>
              <button type="button" className="t-round" aria-label="1명 줄이기" disabled={!editable} onClick={() => bump(meal, -1)}>−</button>
              <input aria-label={`${meal.meal_date} ${meal.meal_slot} 실제 식수`} type="text" inputMode="numeric" pattern="[0-9]*" disabled={!editable}
                value={servings[meal.meal_service_id] || ''}
                onChange={e => usage.changeServings(meal.meal_service_id, e.target.value.replace(/[^0-9]/g, ''))} />
              <button type="button" className="t-round" aria-label="1명 늘리기" disabled={!editable} onClick={() => bump(meal, 1)}>+</button>
              <button type="button" className="tm-stepper__ten" aria-label="10명 늘리기" disabled={!editable} onClick={() => bump(meal, 10)}>+10</button>
            </div>
          </li>)}
        </ul>
        {usage.upcoming > 0 && scopeLabel === '주간' && <p className="tm-note">아직 내지 않은 식사 {usage.upcoming}식은 빠집니다.</p>}

        {preview && <>
          {shortageCount > 0 && <div className="tm-notice is-danger">
            <strong><TouchIcon name="alert" size={18} />재고가 부족한 식재료 {shortageCount}종 · 확정할 수 없습니다</strong>
            <span>받은 식재료라면 입고를 먼저 확정하고, 급하게 직접 산 식재료는 직접 구매로 입력한 뒤 다시 확인하세요.</span>
            <Link className="t-btn is-small" to={`/inventory/account?${new URLSearchParams({ account_id: accountId, direct_purchase: '1' })}`}>직접 구매 입력</Link>
          </div>}
          {preview.unreceived_orders.length > 0 && <div className="tm-notice is-warn">
            <strong><TouchIcon name="truck" size={18} />입고 확정이 안 된 발주 {preview.unreceived_orders.length}건</strong>
            <span>실제로 받은 식재료라면 입고를 먼저 확정해야 재고에 반영됩니다.</span>
            <ul>{preview.unreceived_orders.map(order => <li key={order.purchase_order_id}>
              <Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: order.purchase_order_id })}`}>
                {order.delivery_date} · {order.supplier_name} · {order.status === 'PARTIAL_RECEIVED' ? '부분 입고' : '미입고'}
              </Link>
            </li>)}</ul>
          </div>}
          {preview.problems.filter(p => !p.ingredient_id).map((p, i) => <p key={i} className="t-msg is-error">{p.meal}: {p.message}</p>)}
          <h3 className="tm-subtitle">빠질 식재료 {preview.ingredients.length}종</h3>
          <ul className="tm-ingredients">
            {preview.ingredients.map(row => <li key={row.ingredient_id} className={row.shortage_qty > 0 ? 'is-short' : ''}>
              <strong>{row.ingredient_name}</strong>
              <span className="tm-ingredients__use">−{qty(row.required_qty)} {row.base_unit}</span>
              <span className="tm-ingredients__stock">재고 {qty(row.stock_before)} → <b>{qty(row.stock_after)}</b> {row.base_unit}</span>
              {row.shortage_qty > 0 && <span className="tm-ingredients__short">부족 {qty(row.shortage_qty)} {row.base_unit}</span>}
            </li>)}
          </ul>
        </>}

        {step === 'final' && preview && <div className="tm-notice is-confirm">
          <strong>정말 이 식단을 사용하셨습니까?</strong>
          <span>{targets.length}식 · 식재료 {preview.ingredients.length}종이 재고에서 빠집니다. 잘못 확정했다면 식사별 '취소'로 되돌릴 수 있습니다.</span>
        </div>}
      </div>
      <footer className="t-sheet__actions">
        <button type="button" className="t-btn is-large" disabled={busy} onClick={() => step === 'final' ? usage.setStep('preview') : usage.closeDialog()}>{step === 'final' ? '돌아가기' : '닫기'}</button>
        {step === 'input' && <button type="button" className="t-btn is-primary is-large" disabled={busy || targets.length === 0} onClick={() => void usage.runPreview()}>{busy ? '확인 중…' : '다음 · 차감 내역 보기'}</button>}
        {step === 'preview' && <button type="button" className="t-btn is-primary is-large" disabled={busy || !preview?.can_confirm} onClick={() => usage.setStep('final')}>다음 · 확정하기</button>}
        {step === 'final' && <button type="button" className="t-btn is-primary is-large" disabled={busy} onClick={() => void usage.confirmWeek()}>{busy ? '확정 중…' : '네, 사용 확정합니다'}</button>}
      </footer>
    </section>
  </div>
}
