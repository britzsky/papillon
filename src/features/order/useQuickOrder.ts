import { useEffect, useState } from 'react'
import { clearDeadlineAlertCache } from '../../api/deadlineAlerts'
import { getShortages, previewShortageOrder, type OrderPreview, type OrderSelection, type ShortageCriteria, type ShortageResult } from '../../api/shortageProcurement'
import { recoverMixedProcurement, startNewMixedProcurement, submitMixedProcurement, type BatchResult } from '../../api/mixedProcurement'

export const orderDay = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) }
export const money = (n: number) => Number(n).toLocaleString('ko-KR')
const signature = (p: OrderPreview) => JSON.stringify(p.items.map(row => [row.ingredient_id, row.offer.supplier_offer_id, row.order_qty, row.offer.purchase_price, row.item_amount]).sort())

/**
 * 추천 발주안(PC 발주하기 첫 탭·터치 발주하기 공용): 납품일·계산 기준으로 부족량을 구하고 기존 사용상품으로 발주안을 미리 고른 뒤,
 * 확정 직전에 가격·수량을 다시 확인하고 공급사별로 한 번에 발주한다(혼합 발주, 요청키로 중복 전송 방지).
 */
export function useQuickOrder(accountId: string) {
  const [date, setDate] = useState(orderDay(1))
  const [source, setSource] = useState<'PLAN' | 'INVENTORY'>('PLAN')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<ShortageResult | null>(null)
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [batch, setBatch] = useState<BatchResult | null>(null)
  const [allowPartial, setAllowPartial] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const criteria: ShortageCriteria = { account_id: accountId, source, date_from: date, date_to: date, delivery_date: date, table_id: '', sold_to: '', average_days: 30, coverage_days: 1 }
    if (!accountId) return
    void (async () => {
      setBusy(true); setPreview(null); setResult(null); setError(''); setAllowPartial(false)
      try {
        const data = await getShortages(criteria, controller.signal)
        if (!active) return
        setResult(data)
        const items: OrderSelection[] = data.ingredients.flatMap(row => {
          const offer = row.offers.find(item => item.supplier_offer_id === row.recommended_offer_id && item.orderable && item.orderability_status === 'AVAILABLE')
          return offer && !row.issues.length ? [{ ingredient_id: row.ingredient_id, supplier_offer_id: offer.supplier_offer_id, order_qty: offer.recommended_qty }] : []
        })
        if (items.length) { const next = await previewShortageOrder(data.criteria, items); if (active) setPreview(next) }
      } catch (e) { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : '발주안 준비 실패') }
      finally { if (active) setBusy(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [accountId, source, date, revision])
  /** 발주안에 못 넣은 식자재(주상품 없음·주문 불가·확인 사항) */
  const exceptions = result?.ingredients.filter(row => !preview?.items.some(item => item.ingredient_id === row.ingredient_id)) || []
  const canSubmit = Boolean(preview) && !busy && !attempted && !(exceptions.length && !allowPartial)

  const submit = async () => {
    if (!preview || busy || attempted || (exceptions.length && !allowPartial)) return
    setBusy(true); setError('')
    try {
      const current = await previewShortageOrder(preview.criteria, preview.items.map(row => ({ ingredient_id: row.ingredient_id, supplier_offer_id: row.offer.supplier_offer_id, order_qty: row.order_qty })))
      if (signature(current) !== signature(preview)) { setPreview(current); setError('가격 또는 수량이 바뀌었습니다. 변경된 발주안을 확인한 뒤 다시 확정해주세요.'); return }
      setAttempted(true)
      clearDeadlineAlertCache()
      setBatch(await submitMixedProcurement({ account_id: accountId, shortage_criteria: current.criteria, items: current.items.map(row => ({ source_ingredient_id: row.ingredient_id, supplier_offer_id: row.offer.supplier_offer_id, delivery_date: current.criteria.delivery_date, order_qty: row.order_qty, expected_price: row.offer.purchase_price })) }))
    } catch (e) { setError(e instanceof Error ? e.message : '발주 결과 확인 필요') }
    finally { setBusy(false) }
  }
  const recover = async () => { setBusy(true); setError(''); try { setBatch(await recoverMixedProcurement(accountId)); setAttempted(true) } catch (e) { setError(e instanceof Error ? e.message : '이전 요청 확인 실패') } finally { setBusy(false) } }
  const refresh = () => { try { startNewMixedProcurement(accountId); setAttempted(false); setBatch(null); setRevision(value => value + 1) } catch (e) { setError(e instanceof Error ? e.message : '이전 요청부터 확인해주세요.') } }
  /** 공급사 상품 준비가 끝나면 발주안을 다시 계산한다 */
  const reloadPreview = () => setRevision(value => value + 1)
  const changeDate = (value: string) => { setPreview(null); setDate(value) }
  const changeSource = (value: 'PLAN' | 'INVENTORY') => { setPreview(null); setSource(value) }

  return {
    date, changeDate, source, changeSource, result, preview, error, busy, attempted, batch, allowPartial, setAllowPartial,
    exceptions, canSubmit, submit, recover, refresh, reloadPreview,
  }
}
