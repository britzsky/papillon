import { useEffect, useMemo, useState } from 'react'
import { buildApiUrl } from '../../config/api'

export type Meal = {
  meal_service_id: number; meal_date: string; meal_slot: string; status: string
  planned_servings: number; actual_servings?: number; served: boolean; confirmable: boolean; needs_reconfirm: number | boolean
}
export type PreviewIngredient = { ingredient_id: string; ingredient_name: string; base_unit: string; required_qty: number; stock_before: number; stock_after: number; shortage_qty: number }
export type Problem = { meal: string; message: string; ingredient_id?: string }
export type UnreceivedOrder = { purchase_order_id: string; supplier_name: string; delivery_date: string; status: string }
export type Preview = { ingredients: PreviewIngredient[]; problems: Problem[]; unreceived_orders: UnreceivedOrder[]; can_confirm: boolean }
export type UsageStep = 'input' | 'preview' | 'final'

export const statusLabel = (meal: Meal) => meal.status === 'COMPLETED' ? '사용 확정'
  : meal.status === 'CANCELED' ? '취소'
  : Number(meal.needs_reconfirm) ? '재확정 필요'
  : meal.served ? '확정 대기' : '제공 전'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
export const dayLabel = (date: string) => { const [, m, d] = date.split('-'); return `${WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]} ${m}/${d}` }
export const qty = (value: number) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })
const userId = () => localStorage.getItem('user_id') || ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { message?: string }).message || '요청을 처리하지 못했습니다.')
  return data as T
}

/**
 * 식단표(주) 사용 확정 로직(PC·모바일 화면 공용).
 * 실제 식수 입력 → 차감 미리보기(서버가 실제 차감을 계산한 뒤 롤백) → 재확인 → 일괄 확정.
 * 확인 창(confirm)은 화면마다 모양이 달라 cancelMeal 호출 전에 화면에서 묻는다.
 */
export function useMealUsage(accountId: string, tableId: string, onChanged: () => void) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [allowUnserved, setAllowUnserved] = useState(false)
  const [targets, setTargets] = useState<Meal[]>([])
  const [scopeLabel, setScopeLabel] = useState('주간')
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [servings, setServings] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [step, setStep] = useState<UsageStep>('input')
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
      date, meals: list, confirmable: list.filter(m => m.confirmable), completed: list.filter(m => m.status === 'COMPLETED').length, total: list.length,
    }))
  }, [meals])

  const requestMeals = () => targets.map(m => ({ meal_service_id: m.meal_service_id, actual_servings: Number(servings[m.meal_service_id]) }))

  /** 주간 전체 또는 하루치 식사를 같은 절차(실제 식수 → 차감 내역 → 재확인 → 확정)로 확정한다. */
  const openDialog = (list: Meal[], label: string) => {
    setTargets(list); setScopeLabel(label)
    setServings(Object.fromEntries(list.map(m => [m.meal_service_id, String(m.actual_servings || m.planned_servings)])))
    setPreview(null); setStep('input'); setModalError(''); setOpen(true)
  }

  const changeServings = (mealServiceId: number, value: string) => {
    setServings(s => ({ ...s, [mealServiceId]: value })); setPreview(null); setStep('input')
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

  /** 확정 취소: 차감했던 재고가 원래 상품·LOT로 복원된다. 확인은 호출하는 화면에서 받는다. */
  const cancelMeal = async (meal: Meal) => {
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

  const closeDialog = () => { if (!busy) setOpen(false) }
  const shortageCount = preview?.ingredients.filter(i => i.shortage_qty > 0).length ?? 0

  return {
    meals, allowUnserved, confirmable, completed, reconfirm, upcoming, days, error,
    open, targets, scopeLabel, servings, preview, step, busy, modalError, shortageCount,
    openDialog, closeDialog, changeServings, runPreview, confirmWeek, cancelMeal, setStep,
  }
}
