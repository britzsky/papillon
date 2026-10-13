import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon from '../TouchIcon'
import { useTableMealsView } from '../../features/tableMeals/useTableMealsView'
import { parseMonthValue, type MealSlotRow, type TableMealsDetailDay } from '../../features/tableMeals/tableMealsView'
import { dayLabel, qty, statusLabel, useMealUsage, type Meal } from '../../features/mealUsage/useMealUsage'
import type { TableMealsItem } from '../../api/operations'
import TableMealsCreateTouch from './TableMealsCreateTouch'
import './TableMealsTouch.css'

const SOURCE_LABEL: Record<string, string> = { auto: '자동', pdf: 'PDF', manual: '수기' }
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

  const toolbar = <><button type="button" className="t-btn is-primary" onClick={onCreate}><span aria-hidden="true">＋</span>식단표 만들기</button><div className="t-chip tm-month" role="group" aria-label="조회 월">
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

  return <WeekView key={table.table_id} table={table} accountId={accountId} tables={view.tables} onSelectTable={view.setSelectedTable}
    days={view.detailDays} slotRows={view.slotRows} toolbar={toolbar} onAccountChange={view.setAccountId} />
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

function WeekView({ table, accountId, tables, onSelectTable, days, slotRows, toolbar, onAccountChange }: {
  table: TableMealsItem
  accountId: string
  tables: TableMealsItem[]
  onSelectTable: (table: TableMealsItem) => void
  days: TableMealsDetailDay[]
  slotRows: Array<Pick<MealSlotRow, 'id' | 'key' | 'label'>>
  toolbar: ReactNode
  onAccountChange: (accountId: string) => void
}) {
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex(day => day.date === today())))
  const usage = useMealUsage(accountId, table.table_id, noop)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const daysRef = useRef<HTMLDivElement | null>(null)
  const day = days[Math.min(dayIndex, days.length - 1)]
  const usageByDate = useMemo(() => new Map(usage.days.map(d => [d.date, d])), [usage.days])
  const dayUsage = usageByDate.get(day.date)
  const rows = slotRows.filter(row => (day.meals[row.key] || []).length > 0)
  const dayCalories = rows.reduce((sum, row) => sum + (day.meals[row.key] || []).reduce((s, m) => s + Number(m.calories_per_serving || 0), 0), 0)

  useEffect(() => {
    daysRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [dayIndex])

  const move = (delta: number) => setDayIndex(index => Math.min(days.length - 1, Math.max(0, index + delta)))
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
  }

  /** 식사 카드의 상태: 사용 확정 목록에서 같은 이름의 식사를 찾는다(이름이 다르면 표시 안 함) */
  const slotMeal = (label: string) => dayUsage?.meals.find(meal => meal.meal_slot === label)

  return <TouchLayout title="식단표" subtitle={table.table_name} toolbar={toolbar} aside={<UsagePanel day={day} dayUsage={dayUsage} usage={usage} />} onAccountChange={onAccountChange}>
    <WeekSwitch tables={tables} selected={table} onSelect={onSelectTable} />

    <div className="t-tabs tm-days" ref={daysRef} role="tablist" aria-label="요일">
      {days.map((d, index) => {
        const u = usageByDate.get(d.date)
        const done = u && u.total > 0 && u.completed === u.total
        const isToday = d.date === today()
        return <button key={d.key} type="button" role="tab" aria-selected={index === dayIndex}
          className={`t-tab tm-day${index === dayIndex ? ' is-active' : ''}`} onClick={() => setDayIndex(index)}>
          <TouchIcon name={done ? 'check' : 'calendar'} />
          <strong>{d.weekday || dayLabel(d.date).split(' ')[0]}요일</strong>
          <small>{d.date.slice(5).replace('-', '.')}{u ? ` · ${u.completed}/${u.total}식` : ''}</small>
          {isToday && <span className="t-badge is-yellow tm-day__today">오늘</span>}
        </button>
      })}
    </div>

    <div className="tm-daybody" onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={onTouchEnd}>
      <div className="tm-dayhead">
        <h2>{dayLabel(day.date)} 메뉴</h2>
        <span className="t-badge is-accent"><TouchIcon name="flame" size={14} />{Math.round(dayCalories).toLocaleString('ko-KR')} kcal</span>
        <div className="tm-dayhead__nav">
          <button type="button" className="t-btn is-icon" aria-label="전날" disabled={dayIndex === 0} onClick={() => move(-1)}><TouchIcon name="chevronLeft" /></button>
          <button type="button" className="t-btn is-icon" aria-label="다음날" disabled={dayIndex >= days.length - 1} onClick={() => move(1)}><TouchIcon name="chevronRight" /></button>
        </div>
      </div>

      {rows.length === 0 && <p className="t-msg">이 날은 등록된 식사가 없습니다.</p>}
      <div className="tm-slots">
        {rows.map(row => {
          const menus = day.meals[row.key] || []
          const calories = menus.reduce((sum, menu) => sum + Number(menu.calories_per_serving || 0), 0)
          const meal = slotMeal(row.label)
          return <article key={row.id} className={`t-card tm-slot${meal?.confirmable ? ' is-selected' : ''}`}>
            <header className="tm-slot__cover">
              <span className="tm-slot__icon"><TouchIcon name="meals" size={26} /></span>
              <div>
                <h3>{row.label}</h3>
                <small>{menus.length}가지{calories > 0 ? ` · ${Math.round(calories).toLocaleString('ko-KR')} kcal` : ''}</small>
              </div>
              {meal && <span className={`t-badge ${mealTone(meal)}`}>{statusLabel(meal)}</span>}
            </header>
            <ul>
              {menus.map(menu => <li key={`${menu.sort_order}-${menu.menu_id || menu.menu_name}`}>{menu.menu_name || '-'}</li>)}
            </ul>
            {meal && <footer>
              <span><TouchIcon name="users" size={16} />계획 {qty(meal.planned_servings)}명</span>
              {meal.status === 'COMPLETED' && <strong>실제 {qty(meal.actual_servings || 0)}명</strong>}
            </footer>}
          </article>
        })}
      </div>
      <p className="tm-swipe-hint">좌우로 밀면 다른 요일로 넘어갑니다.</p>
    </div>

    {usage.open && <UsageSheet usage={usage} accountId={accountId} />}
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
    if (!window.confirm(`${dayLabel(meal.meal_date)} ${meal.meal_slot} 사용 확정을 취소할까요?\n차감했던 재고가 복원되고, 다시 확정해야 합니다.`)) return
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
