import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import MobileLayout from '../MobileLayout'
import { useTableMealsView } from '../../features/tableMeals/useTableMealsView'
import { parseMonthValue, type TableMealsDetailDay, type MealSlotRow } from '../../features/tableMeals/tableMealsView'
import { dayLabel, qty, statusLabel, useMealUsage, type Meal } from '../../features/mealUsage/useMealUsage'
import type { TableMealsItem } from '../../api/operations'
import './MobileTableMeals.css'

const SOURCE_LABEL: Record<string, string> = { auto: '자동', pdf: 'PDF', manual: '수기' }
const noop = () => {}
const today = () => new Date().toLocaleDateString('sv-SE')

/**
 * 모바일·태블릿 식단표: 주 식단표 고르기 → 요일별 식사·메뉴 보기(좌우로 밀어 요일 이동) → 하루/주간 사용 확정.
 * 휴대폰은 목록과 상세를 한 화면씩, 태블릿(768px 이상)은 왼쪽 목록 + 오른쪽 상세로 보여준다.
 */
export default function MobileTableMeals() {
  const view = useTableMealsView()
  const { year, month } = parseMonthValue(view.month)
  const selected = view.selectedTable

  return <MobileLayout
    title={selected ? selected.table_name || '식단표' : '식단표'}
    subtitle={view.accountName || undefined}
    onBack={selected ? () => view.setSelectedTable(null) : undefined}
  >
    <div className={`m-meals${selected ? ' has-detail' : ''}`}>
      <section className="m-meals__list" aria-label="식단표 목록">
        <div className="m-card m-meals__filters">
          {view.canChangeAccount && <label className="m-meals__field">
            <span>거래처</span>
            <select className="m-select" value={view.accountId} onChange={e => view.setAccountId(e.target.value)}>
              <option value="">거래처를 고르세요</option>
              {view.accounts.map(option => <option key={option.value} value={option.value}>{option.text}</option>)}
            </select>
          </label>}
          <div className="m-meals__month" role="group" aria-label="조회 월">
            <button type="button" className="m-button" aria-label="이전 달" onClick={() => view.shiftMonth(-1)}>‹</button>
            <strong>{year}년 {month}월</strong>
            <button type="button" className="m-button" aria-label="다음 달" onClick={() => view.shiftMonth(1)}>›</button>
          </div>
        </div>
        {view.accountError && <p className="m-message is-error">{view.accountError}</p>}
        {!view.accountId && <p className="m-message">거래처를 고르면 식단표가 나옵니다.</p>}
        {view.accountId && view.isTablesLoading && <p className="m-message" role="status">식단표를 불러오는 중…</p>}
        {view.tablesError && <p className="m-message is-error">{view.tablesError}</p>}
        {view.accountId && !view.isTablesLoading && !view.tablesError && view.tables.length === 0 && <p className="m-message">이 달에 저장된 식단표가 없습니다.</p>}
        <ul className="m-meals__weeks">
          {view.tables.map(table => <li key={table.table_id}>
            <button type="button" className={`m-meals__week${selected?.table_id === table.table_id ? ' is-active' : ''}`} onClick={() => view.setSelectedTable(table)}>
              <strong>{table.table_name || `${table.table_week ?? ''}주차`}</strong>
              <span>
                {table.source && <span className="m-badge is-muted">{SOURCE_LABEL[table.source] || table.source}</span>}
                {table.created_at && <small>{table.created_at.slice(0, 10)} 저장</small>}
              </span>
              <span className="m-meals__chevron" aria-hidden="true">›</span>
            </button>
          </li>)}
        </ul>
      </section>

      <section className="m-meals__detail" aria-label="식단표 상세">
        {!selected && <p className="m-message m-meals__placeholder">왼쪽에서 식단표를 고르세요.</p>}
        {selected && view.isDetailLoading && <p className="m-message" role="status">식단을 불러오는 중…</p>}
        {selected && view.detailError && <p className="m-message is-error">{view.detailError}</p>}
        {selected && !view.isDetailLoading && !view.detailError && view.detailDays.length === 0 && <p className="m-message">이 식단표에 등록된 메뉴가 없습니다.</p>}
        {selected && view.detailDays.length > 0 && <WeekDetail
          key={selected.table_id}
          table={selected}
          accountId={selected.account_id || view.accountId}
          days={view.detailDays}
          slotRows={view.slotRows}
        />}
      </section>
    </div>
  </MobileLayout>
}

function WeekDetail({ table, accountId, days, slotRows }: {
  table: TableMealsItem
  accountId: string
  days: TableMealsDetailDay[]
  slotRows: Array<Pick<MealSlotRow, 'id' | 'key' | 'label'>>
}) {
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex(day => day.date === today())))
  const usage = useMealUsage(accountId, table.table_id, noop)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const chipsRef = useRef<HTMLDivElement | null>(null)
  const day = days[Math.min(dayIndex, days.length - 1)]

  useEffect(() => {
    chipsRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [dayIndex])

  const usageByDate = useMemo(() => new Map(usage.days.map(d => [d.date, d])), [usage.days])
  const dayUsage = usageByDate.get(day.date)
  const rows = slotRows.filter(row => (day.meals[row.key] || []).length > 0)

  const move = (delta: number) => setDayIndex(index => Math.min(days.length - 1, Math.max(0, index + delta)))
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
  }

  const cancelMeal = async (meal: Meal) => {
    if (!window.confirm(`${dayLabel(meal.meal_date)} ${meal.meal_slot} 사용 확정을 취소할까요?\n차감했던 재고가 복원되고, 다시 확정해야 합니다.`)) return
    await usage.cancelMeal(meal)
  }

  return <div className="m-week">
    <div className="m-week__days" ref={chipsRef} role="tablist" aria-label="요일">
      {days.map((d, index) => {
        const u = usageByDate.get(d.date)
        const done = u && u.total > 0 && u.completed === u.total
        return <button key={d.key} type="button" role="tab" aria-selected={index === dayIndex}
          className={`m-week__day${index === dayIndex ? ' is-active' : ''}${d.date === today() ? ' is-today' : ''}`}
          onClick={() => setDayIndex(index)}>
          <strong>{d.weekday || dayLabel(d.date).split(' ')[0]}</strong>
          <span>{d.date.slice(5).replace('-', '/')}</span>
          {done && <i className="m-week__done" aria-label="사용 확정됨">✓</i>}
        </button>
      })}
    </div>

    <div className="m-week__day-body" onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={onTouchEnd}>
      {rows.length === 0 && <p className="m-message">이 날은 등록된 식사가 없습니다.</p>}
      <div className="m-week__slots">
        {rows.map(row => {
          const menus = day.meals[row.key] || []
          const calories = menus.reduce((sum, menu) => sum + Number(menu.calories_per_serving || 0), 0)
          return <article key={row.id} className="m-card m-slot">
            <header className="m-slot__head">
              <h2>{row.label}</h2>
              {calories > 0 && <span className="m-slot__kcal">{Math.round(calories).toLocaleString('ko-KR')} kcal</span>}
            </header>
            <ul className="m-slot__menus">
              {menus.map(menu => <li key={`${menu.sort_order}-${menu.menu_id || menu.menu_name}`}>{menu.menu_name || '-'}</li>)}
            </ul>
          </article>
        })}
      </div>

      <section className="m-card m-usage" aria-label="사용 확정">
        <header className="m-usage__head">
          <h2>{dayLabel(day.date)} 사용 확정</h2>
          {dayUsage && <span className={`m-badge ${dayUsage.completed === dayUsage.total ? 'is-ok' : ''}`}>{dayUsage.completed}/{dayUsage.total}식</span>}
        </header>
        {usage.error && <p className="m-message is-error" role="alert">{usage.error}</p>}
        {usage.allowUnserved && <p className="m-usage__note is-warn">테스트 모드: 제공 전 식사도 확정(재고 차감)할 수 있습니다.</p>}
        {!dayUsage && !usage.error && <p className="m-usage__note">이 날은 확정할 식사가 없습니다.</p>}
        {dayUsage && <ul className="m-usage__meals">
          {dayUsage.meals.map(meal => {
            const label = statusLabel(meal)
            const tone = meal.status === 'COMPLETED' ? 'is-ok' : label === '재확정 필요' ? 'is-warn' : label === '제공 전' ? 'is-muted' : ''
            return <li key={meal.meal_service_id}>
              <div>
                <strong>{meal.meal_slot}</strong>
                <small>계획 {qty(meal.planned_servings)}명{meal.status === 'COMPLETED' ? ` · 실제 ${qty(meal.actual_servings || 0)}명` : ''}</small>
              </div>
              <span className={`m-badge ${tone}`}>{label}</span>
              {meal.status === 'COMPLETED' && <button type="button" className="m-button is-small" disabled={usage.busy} onClick={() => void cancelMeal(meal)}>취소</button>}
            </li>
          })}
        </ul>}
        {usage.reconfirm > 0 && <p className="m-usage__note is-warn">식단 수정으로 확정이 풀린 식사 {usage.reconfirm}식이 있습니다. 다시 확정해야 재고가 맞습니다.</p>}
        <div className="m-usage__actions">
          <button type="button" className="m-button is-primary is-block" disabled={usage.busy || !dayUsage || dayUsage.confirmable.length === 0}
            onClick={() => dayUsage && usage.openDialog(dayUsage.confirmable, dayLabel(day.date))}>
            {dayUsage && dayUsage.confirmable.length > 0 ? `이 날 사용 확정 (${dayUsage.confirmable.length}식)` : dayUsage && dayUsage.total > 0 && dayUsage.completed === dayUsage.total ? '모두 확정됨' : '확정할 식사 없음'}
          </button>
          <button type="button" className="m-button is-block" disabled={usage.busy || usage.confirmable.length === 0} onClick={() => usage.openDialog(usage.confirmable, '주간')}>
            주간 전체 확정 ({usage.confirmable.length}식)
          </button>
        </div>
        <p className="m-usage__note">식단을 실제로 제공한 뒤 실제 식수로 확정하면 재고가 차감됩니다.</p>
      </section>

      <div className="m-week__nav">
        <button type="button" className="m-button" disabled={dayIndex === 0} onClick={() => move(-1)}>‹ 전날</button>
        <button type="button" className="m-button" disabled={dayIndex >= days.length - 1} onClick={() => move(1)}>다음날 ›</button>
      </div>
    </div>

    {usage.open && <UsageSheet usage={usage} accountId={accountId} />}
  </div>
}

function UsageSheet({ usage, accountId }: { usage: ReturnType<typeof useMealUsage>; accountId: string }) {
  const { targets, servings, preview, step, busy, modalError, shortageCount, scopeLabel } = usage
  const editable = !busy && step !== 'final'
  const bump = (meal: Meal, delta: number) => {
    const next = Math.max(1, (Number(servings[meal.meal_service_id]) || 0) + delta)
    usage.changeServings(meal.meal_service_id, String(next))
  }

  return <div className="m-sheet-backdrop" role="presentation" onClick={usage.closeDialog}>
    <section className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-usage-sheet-title" onClick={e => e.stopPropagation()}>
      <header className="m-sheet__head">
        <h2 id="m-usage-sheet-title">{scopeLabel} 사용 확정</h2>
        <p>{step === 'input' ? '1. 실제 식수를 확인하세요' : step === 'preview' ? '2. 재고 차감 내역을 확인하세요' : '3. 마지막 확인'}</p>
      </header>
      <div className="m-sheet__body">
        {modalError && <p className="m-message is-error" role="alert">{modalError}</p>}

        <ul className="m-servings">
          {targets.map(meal => <li key={meal.meal_service_id}>
            <div className="m-servings__label">
              <strong>{dayLabel(meal.meal_date)} · {meal.meal_slot}</strong>
              <small>계획 {qty(meal.planned_servings)}명{Number(meal.needs_reconfirm) ? ' · 재확정' : ''}</small>
            </div>
            <div className="m-stepper">
              <button type="button" aria-label="1명 줄이기" disabled={!editable} onClick={() => bump(meal, -1)}>−</button>
              <input aria-label={`${meal.meal_date} ${meal.meal_slot} 실제 식수`} type="text" inputMode="numeric" pattern="[0-9]*" disabled={!editable}
                value={servings[meal.meal_service_id] || ''}
                onChange={e => usage.changeServings(meal.meal_service_id, e.target.value.replace(/[^0-9]/g, ''))} />
              <button type="button" aria-label="1명 늘리기" disabled={!editable} onClick={() => bump(meal, 1)}>+</button>
            </div>
          </li>)}
        </ul>
        {usage.upcoming > 0 && scopeLabel === '주간' && <p className="m-usage__note">아직 제공하지 않은 식사 {usage.upcoming}식은 제외됩니다.</p>}

        {preview && <>
          {shortageCount > 0 && <div className="m-notice is-danger">
            <strong>재고가 부족한 식재료 {shortageCount}종이 있어 확정할 수 없습니다.</strong>
            <span>받은 식재료라면 입고를 먼저 확정하고, 급하게 직접 산 식재료는 직접 구매로 입력한 뒤 다시 확인하세요.</span>
            <Link className="m-button is-small" to={`/inventory/account?${new URLSearchParams({ account_id: accountId, direct_purchase: '1' })}`}>직접 구매 입력 (PC 화면)</Link>
          </div>}
          {preview.unreceived_orders.length > 0 && <div className="m-notice is-warn">
            <strong>입고 확정이 안 된 발주 {preview.unreceived_orders.length}건</strong>
            <span>실제로 받은 식재료라면 입고를 먼저 확정해야 재고에 반영됩니다.</span>
            <ul>{preview.unreceived_orders.map(order => <li key={order.purchase_order_id}>
              <Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: order.purchase_order_id })}`}>
                {order.delivery_date} · {order.supplier_name} · {order.status === 'PARTIAL_RECEIVED' ? '부분 입고' : '미입고'}
              </Link>
            </li>)}</ul>
          </div>}
          {preview.problems.filter(p => !p.ingredient_id).map((p, i) => <p key={i} className="m-message is-error">{p.meal}: {p.message}</p>)}
          <h3 className="m-sheet__subtitle">차감될 식재료 {preview.ingredients.length}종</h3>
          <ul className="m-ingredients">
            {preview.ingredients.map(row => <li key={row.ingredient_id} className={row.shortage_qty > 0 ? 'is-short' : ''}>
              <strong>{row.ingredient_name}</strong>
              <span>사용 {qty(row.required_qty)} {row.base_unit}</span>
              <span>재고 {qty(row.stock_before)} → {qty(row.stock_after)} {row.base_unit}</span>
              {row.shortage_qty > 0 && <span className="m-ingredients__short">부족 {qty(row.shortage_qty)} {row.base_unit}</span>}
            </li>)}
          </ul>
        </>}

        {step === 'final' && preview && <div className="m-notice is-confirm">
          <strong>정말 이 식단을 사용하셨습니까?</strong>
          <span>{targets.length}식 · 식재료 {preview.ingredients.length}종이 재고에서 차감됩니다. 잘못 확정했다면 식사별 '취소'로 복원할 수 있습니다.</span>
        </div>}
      </div>
      <footer className="m-sheet__actions">
        <button type="button" className="m-button" disabled={busy} onClick={() => step === 'final' ? usage.setStep('preview') : usage.closeDialog()}>{step === 'final' ? '돌아가기' : '닫기'}</button>
        {step === 'input' && <button type="button" className="m-button is-primary" disabled={busy || targets.length === 0} onClick={() => void usage.runPreview()}>{busy ? '확인 중…' : '차감 내역 확인'}</button>}
        {step === 'preview' && <button type="button" className="m-button is-primary" disabled={busy || !preview?.can_confirm} onClick={() => usage.setStep('final')}>사용 확정</button>}
        {step === 'final' && <button type="button" className="m-button is-primary" disabled={busy} onClick={() => void usage.confirmWeek()}>{busy ? '확정 중…' : '네, 확정합니다'}</button>}
      </footer>
    </section>
  </div>
}
