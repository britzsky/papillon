import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildApiUrl } from '../config/api'

type Meal = {
  meal_service_id: number; meal_date: string; meal_slot: string; status: string
  planned_servings: number; actual_servings?: number; served: boolean; confirmable: boolean; needs_reconfirm: number | boolean
}
type PreviewIngredient = { ingredient_id: string; ingredient_name: string; base_unit: string; required_qty: number; stock_before: number; stock_after: number; shortage_qty: number }
type Problem = { meal: string; message: string; ingredient_id?: string }
type UnreceivedOrder = { purchase_order_id: string; supplier_name: string; delivery_date: string; status: string }
type Preview = { ingredients: PreviewIngredient[]; problems: Problem[]; unreceived_orders: UnreceivedOrder[]; can_confirm: boolean }

const statusLabel = (meal: Meal) => meal.status === 'COMPLETED' ? '사용 확정'
  : meal.status === 'CANCELED' ? '취소'
  : Number(meal.needs_reconfirm) ? '재확정 필요'
  : meal.served ? '확정 대기' : '제공 전'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const dayLabel = (date: string) => { const [, m, d] = date.split('-'); return `${WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]} ${m}/${d}` }
const qty = (value: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const userId = () => localStorage.getItem('user_id') || ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { message?: string }).message || '요청을 처리하지 못했습니다.')
  return data as T
}

/**
 * 식단표(주) 사용 확정. 실제 식수 입력 → 차감 미리보기(서버가 실제 차감을 계산한 뒤 롤백) → 재확인 → 일괄 확정.
 * 재고가 부족하면 확정하지 않고 직접 구매 입력·입고 확정으로 안내한다.
 */
export default function MealUsageControls({ accountId, tableId, onChanged }: { accountId: string; tableId: string; onChanged: () => void }) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [allowUnserved, setAllowUnserved] = useState(false)
  const [targets, setTargets] = useState<Meal[]>([])
  const [scopeLabel, setScopeLabel] = useState('주간')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [showMeals, setShowMeals] = useState(false)
  const [open, setOpen] = useState(false)
  const [servings, setServings] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [step, setStep] = useState<'input' | 'preview' | 'final'>('input')
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    call<{ meals: Meal[]; allow_unserved?: boolean }>(`/v2/meal-plans/usage-week?${new URLSearchParams({ account_id: accountId, table_id: tableId })}`, { signal: controller.signal })
      .then(data => { setMeals(data.meals); setAllowUnserved(Boolean(data.allow_unserved)) })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    return () => controller.abort()
  }, [accountId, tableId, revision])

  const confirmable = useMemo(() => meals.filter(m => m.confirmable), [meals])
  const completed = meals.filter(m => m.status === 'COMPLETED').length
  const reconfirm = meals.filter(m => m.status !== 'COMPLETED' && m.status !== 'CANCELED' && Number(m.needs_reconfirm)).length
  const upcoming = meals.filter(m => !m.confirmable && !m.served && m.status !== 'COMPLETED' && m.status !== 'CANCELED').length
  const days = useMemo(() => {
    const byDate = new Map<string, Meal[]>()
    for (const meal of meals) byDate.set(meal.meal_date, [...(byDate.get(meal.meal_date) || []), meal])
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({
      date, confirmable: list.filter(m => m.confirmable), completed: list.filter(m => m.status === 'COMPLETED').length, total: list.length,
    }))
  }, [meals])

  const requestMeals = () => targets.map(m => ({ meal_service_id: m.meal_service_id, actual_servings: Number(servings[m.meal_service_id]) }))

  /** 주간 전체 또는 하루치 식사를 같은 절차(실제 식수 → 차감 내역 → 재확인 → 확정)로 확정한다. */
  const openDialog = (list: Meal[], label: string) => {
    setTargets(list); setScopeLabel(label)
    setServings(Object.fromEntries(list.map(m => [m.meal_service_id, String(m.actual_servings || m.planned_servings)])))
    setPreview(null); setStep('input'); setModalError(''); setOpen(true)
  }

  const runPreview = async () => {
    const invalid = targets.find(m => { const v = Number(servings[m.meal_service_id]); return !Number.isInteger(v) || v <= 0 || v > 1000000 })
    if (invalid) { setModalError(`${invalid.meal_date} ${invalid.meal_slot}: 실제 식수는 1~1000000 사이 정수로 입력하세요.`); return }
    setBusy(true); setModalError('')
    try {
      const result = await call<Preview>('/v2/meal-plans/usage-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, table_id: tableId, meals: requestMeals(), user_id: userId() }),
      })
      result.ingredients.sort((a, b) => Number(b.shortage_qty > 0) - Number(a.shortage_qty > 0) || a.ingredient_name.localeCompare(b.ingredient_name, 'ko'))
      setPreview(result); setStep('preview')
    } catch (e) { setModalError(e instanceof Error ? e.message : '차감 내역을 확인하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const confirmWeek = async () => {
    setBusy(true); setModalError('')
    try {
      await call('/v2/meal-plans/complete-week', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, table_id: tableId, meals: requestMeals(), user_id: userId() }),
      })
      setOpen(false); setRevision(r => r + 1); onChanged()
    } catch (e) {
      // 그사이 재고·식단이 바뀌었을 수 있으므로 미리보기부터 다시 하게 한다.
      setModalError(`${e instanceof Error ? e.message : '사용 확정에 실패했습니다.'} 차감 내역을 다시 확인해주세요.`)
      setStep('input'); setPreview(null)
    } finally { setBusy(false) }
  }

  const cancelMeal = async (meal: Meal) => {
    if (!window.confirm(`${meal.meal_date} ${meal.meal_slot}의 사용 확정을 취소할까요?\n차감했던 재고가 원래 상품·LOT로 복원되고, 이 식사는 다시 확정해야 합니다.`)) return
    setBusy(true); setError('')
    try {
      await call('/v2/meal-plans/services', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, meal_service_id: meal.meal_service_id, status: 'DRAFT', user_id: userId() }),
      })
      setRevision(r => r + 1); onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : '확정 취소에 실패했습니다.') }
    finally { setBusy(false) }
  }

  const shortageCount = preview?.ingredients.filter(i => i.shortage_qty > 0).length ?? 0

  return <section className="meal-usage-panel no-print" aria-label="주간 사용 확정">
    <div className="meal-usage-panel__summary">
      <div>
        <strong>주간 사용 확정</strong>
        <span>사용 확정 {completed}/{meals.length}식 · 확정 대기 {confirmable.length}식{upcoming ? ` · 제공 전 ${upcoming}식` : ''}</span>
        {reconfirm > 0 && <span className="meal-usage-panel__warn">식단 수정으로 확정이 풀린 식사 {reconfirm}식 · 다시 확정해야 재고가 맞습니다</span>}
      </div>
      <div className="meal-usage-panel__actions">
        <button type="button" className="table-meals-modal__button is-secondary" onClick={() => setShowMeals(v => !v)}>{showMeals ? '식사 닫기' : '식사별 보기'}</button>
        <button type="button" className="table-meals-modal__button is-primary" disabled={busy || confirmable.length === 0} onClick={() => openDialog(confirmable, '주간')}>주간 사용 확정</button>
      </div>
    </div>
    {days.length > 0 && <div className="meal-usage-panel__days" aria-label="요일별 사용 확정">
      {days.map(day => <button key={day.date} type="button" className="table-meals-modal__button is-secondary"
        disabled={busy || day.confirmable.length === 0} onClick={() => openDialog(day.confirmable, dayLabel(day.date))}
        title={`${day.date} 사용 확정 ${day.completed}/${day.total}식`}>
        {dayLabel(day.date)} {day.confirmable.length > 0 ? `확정 (${day.confirmable.length})` : day.completed === day.total ? '확정됨' : '확정 불가'}
      </button>)}
    </div>}
    {allowUnserved && <p className="meal-usage-panel__warn">테스트 모드: 아직 제공하지 않은 식사도 사용 확정(재고 차감)할 수 있습니다.</p>}
    <p className="meal-usage-panel__hint">식단을 실제로 제공한 뒤 실제 식수로 확정하면 재고가 차감됩니다. 확정 전에도 지난 식사 사용량은 부족량 계산에서 미리 빼고 계산합니다.</p>
    {error && <p className="meal-usage-panel__error" role="alert">{error}</p>}
    {showMeals && <table className="meal-usage-panel__table"><thead><tr><th>날짜·식사</th><th>상태</th><th>계획 식수</th><th>실제 식수</th><th></th></tr></thead><tbody>
      {meals.map(meal => <tr key={meal.meal_service_id}>
        <td>{meal.meal_date} · {meal.meal_slot}</td>
        <td className={Number(meal.needs_reconfirm) && meal.status !== 'COMPLETED' ? 'is-warn' : ''}>{statusLabel(meal)}</td>
        <td>{qty(meal.planned_servings)}</td>
        <td>{meal.status === 'COMPLETED' ? qty(meal.actual_servings || 0) : '-'}</td>
        <td>{meal.status === 'COMPLETED' && <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => void cancelMeal(meal)}>확정 취소</button>}</td>
      </tr>)}
    </tbody></table>}

    {open && <div className="table-meals-modal-backdrop meal-usage-dialog-backdrop" role="presentation" onClick={() => !busy && setOpen(false)}>
      <section className="table-meals-modal meal-usage-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-usage-dialog-title" onClick={e => e.stopPropagation()}>
        <div className="table-meals-modal__header">
          <div><p className="table-meals-modal__eyebrow">Weekly Usage</p><h2 id="meal-usage-dialog-title">{scopeLabel} 사용 확정</h2></div>
        </div>
        <div className="meal-usage-dialog__body">
          {modalError && <p className="meal-usage-panel__error" role="alert">{modalError}</p>}

          <h3>1. 실제 식수</h3>
          <table className="meal-usage-panel__table"><thead><tr><th>날짜·식사</th><th>계획 식수</th><th>실제 식수</th></tr></thead><tbody>
            {targets.map(meal => <tr key={meal.meal_service_id}>
              <td>{meal.meal_date} · {meal.meal_slot}{Number(meal.needs_reconfirm) ? ' (재확정)' : ''}</td>
              <td>{qty(meal.planned_servings)}</td>
              <td><input aria-label={`${meal.meal_date} ${meal.meal_slot} 실제 식수`} type="number" min="1" max="1000000" step="1" disabled={busy || step === 'final'}
                value={servings[meal.meal_service_id] || ''}
                onChange={e => { setServings(s => ({ ...s, [meal.meal_service_id]: e.target.value })); setPreview(null); setStep('input') }} /></td>
            </tr>)}
          </tbody></table>
          {upcoming > 0 && scopeLabel === '주간' && <p className="meal-usage-panel__hint">아직 제공하지 않은 식사 {upcoming}식는 제외됩니다. 제공한 뒤에 확정하세요.</p>}

          {preview && <>
            <h3>2. 재고 차감 내역</h3>
            {shortageCount > 0 && <div className="meal-usage-dialog__notice is-danger">
              <strong>재고가 부족한 식재료 {shortageCount}종이 있어 확정할 수 없습니다.</strong>
              <span>입고 확정을 빠뜨렸다면 먼저 입고를 확정하고, 웰스토리·아워홈 외에 급하게 직접 산 식재료는 직접 구매로 입력한 뒤 다시 확인하세요.</span>
              <Link className="table-meals-modal__button is-secondary" to={`/inventory/account?${new URLSearchParams({ account_id: accountId, direct_purchase: '1' })}`} target="_blank">직접 구매 입력</Link>
            </div>}
            {preview.unreceived_orders.length > 0 && <div className="meal-usage-dialog__notice is-warn">
              <strong>입고 확정이 안 된 발주 {preview.unreceived_orders.length}건</strong>
              <span>실제로 받은 식재료라면 입고를 먼저 확정해야 재고에 반영됩니다.</span>
              <ul>{preview.unreceived_orders.map(order => <li key={order.purchase_order_id}>
                <Link to={`/order_manager/orders?${new URLSearchParams({ account_id: accountId, purchase_order_id: order.purchase_order_id })}`} target="_blank">
                  {order.delivery_date} · {order.supplier_name} · {order.status === 'PARTIAL_RECEIVED' ? '부분 입고' : '미입고'}
                </Link></li>)}</ul>
            </div>}
            {preview.problems.filter(p => !p.ingredient_id).map((p, i) => <p key={i} className="meal-usage-panel__error">{p.meal}: {p.message}</p>)}
            <div className="meal-usage-dialog__scroll"><table className="meal-usage-panel__table"><thead><tr><th>식재료</th><th>사용량</th><th>현재 재고</th><th>차감 후</th><th>부족</th></tr></thead><tbody>
              {preview.ingredients.map(row => <tr key={row.ingredient_id} className={row.shortage_qty > 0 ? 'is-short' : ''}>
                <td>{row.ingredient_name}</td><td>{qty(row.required_qty)} {row.base_unit}</td><td>{qty(row.stock_before)} {row.base_unit}</td>
                <td>{qty(row.stock_after)} {row.base_unit}</td><td>{row.shortage_qty > 0 ? `${qty(row.shortage_qty)} ${row.base_unit}` : '-'}</td>
              </tr>)}
            </tbody></table></div>
          </>}

          {step === 'final' && preview && <div className="meal-usage-dialog__notice is-confirm">
            <strong>정말 이 식단을 사용하셨습니까?</strong>
            <span>{targets.length}식 · 식재료 {preview.ingredients.length}종이 재고에서 차감됩니다. 잘못 확정했다면 식사별 '확정 취소'로 재고를 복원할 수 있습니다.</span>
          </div>}
        </div>
        <div className="table-meals-modal__actions">
          <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => step === 'final' ? setStep('preview') : setOpen(false)}>{step === 'final' ? '돌아가기' : '닫기'}</button>
          {step === 'input' && <button type="button" className="table-meals-modal__button is-primary" disabled={busy || targets.length === 0} onClick={() => void runPreview()}>{busy ? '확인 중…' : '차감 내역 확인'}</button>}
          {step === 'preview' && <>
            <button type="button" className="table-meals-modal__button is-secondary" disabled={busy} onClick={() => void runPreview()}>다시 확인</button>
            <button type="button" className="table-meals-modal__button is-primary" disabled={busy || !preview?.can_confirm} onClick={() => setStep('final')}>사용 확정</button>
          </>}
          {step === 'final' && <button type="button" className="table-meals-modal__button is-primary" disabled={busy} onClick={() => void confirmWeek()}>{busy ? '확정 중…' : '네, 사용 확정합니다'}</button>}
        </div>
      </section>
    </div>}
  </section>
}
