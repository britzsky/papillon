import { useState } from 'react'
import { formatQty } from '../utils/formatQty'
import './MealPlanImpact.css'

export type PlanImpact = {
  changes: Array<{ ingredient_id: string; ingredient_name: string; meal_date: string; base_unit: string; before_qty: number; after_qty: number; change_qty: number }>
  affected_orders: Array<{ purchase_order_id: string; ingredient_id?: string; requested_delivery_date: string; status: string; product_name: string; remaining_order_qty: number }>
  completed_meals: number
  notice: string
}

const ORDER_STATUS: Record<string, string> = { ORDERED: '접수', CONFIRMED: '접수 확인', PARTIAL_RECEIVED: '일부 입고', NOT_RECEIVED: '미입고', SENDING: '전송 확인 중', UNKNOWN: '접수 확인 필요', PARTIAL_FAILED: '일부 확인 필요' }

const md = (date: string) => date.slice(5).replace('-', '/')

type Group = {
  id: string; name: string; unit: string; before: number; after: number; change: number
  days: Array<{ date: string; change: number }>; orders: PlanImpact['affected_orders']
}

/** 저장 전 기존 식단 대비 필요량 변화. 서버는 날짜×식재료 행으로 주므로 식재료별 한 줄로 묶어 보여준다. */
export default function MealPlanImpact({ impact }: { impact?: PlanImpact }) {
  const [openDays, setOpenDays] = useState<string | null>(null)
  if (!impact) return null
  const groups = new Map<string, Group>()
  for (const row of impact.changes) {
    const group = groups.get(row.ingredient_id) ?? { id: row.ingredient_id, name: row.ingredient_name, unit: row.base_unit, before: 0, after: 0, change: 0, days: [], orders: [] }
    group.before += Number(row.before_qty) || 0
    group.after += Number(row.after_qty) || 0
    group.change += Number(row.change_qty) || 0
    group.days.push({ date: row.meal_date, change: Number(row.change_qty) || 0 })
    groups.set(row.ingredient_id, group)
  }
  const unmatched: PlanImpact['affected_orders'] = []
  for (const order of impact.affected_orders) {
    const group = order.ingredient_id ? groups.get(order.ingredient_id) : undefined
    if (group) group.orders.push(order); else unmatched.push(order)
  }
  // 날짜끼리 늘고 줄어 합계가 0인 식재료도 보여준다(날짜 이동). 늘어난 것 → 줄어든 것, 각각 변화량 큰 순
  const rows = [...groups.values()].sort((a, b) => Number(b.change > 0) - Number(a.change > 0) || Math.abs(b.change) - Math.abs(a.change))
  const firstSave = rows.length > 0 && rows.every(row => row.before === 0) && !impact.affected_orders.length && !impact.completed_meals
  const added = rows.filter(row => row.before === 0).length
  const removed = rows.filter(row => row.after === 0).length
  const increased = rows.filter(row => row.change > 0 && row.before > 0).length
  const decreased = rows.filter(row => row.change < 0 && row.after > 0).length
  const moved = rows.filter(row => row.change === 0).length

  return <section className="plan-impact" aria-label="식단 변경 영향">
    <h3>② 기존 식단 대비 변경</h3>
    {impact.completed_meals > 0 && <p className="plan-impact__alert" role="alert">이미 실제 사용을 확정한 식사가 {impact.completed_meals}개 있습니다. 다시 저장하면 기존 사용량을 복원하므로 식수·사용을 다시 확인해야 합니다.</p>}
    {!rows.length ? <p className="plan-impact__empty">기존 식단과 필요량이 같습니다.</p>
      : firstSave ? <p className="plan-impact__empty">처음 저장하는 식단입니다(식재료 {rows.length}종 새로 필요). 필요량과 부족량은 위 ① 표를 보세요.</p>
      : <>
        <p className="plan-impact__summary">
          {increased ? <span className="is-up">늘어남 {increased}종</span> : null}
          {added ? <span className="is-up">새로 추가 {added}종</span> : null}
          {decreased ? <span className="is-down">줄어듦 {decreased}종</span> : null}
          {removed ? <span className="is-down">빠짐 {removed}종</span> : null}
          {moved ? <span>날짜만 바뀜 {moved}종</span> : null}
          <small>합계는 식단 기간 전체 필요량입니다.</small>
        </p>
        <div className="plan-impact__scroll workspace-table-scroll"><table className="plan-impact__table">
          <thead><tr><th>식재료</th><th>증감</th><th>기존 → 변경</th><th>날짜별</th><th>기존 미입고 주문</th></tr></thead>
          <tbody>{rows.map(row => {
            const tone = row.change > 0 ? 'up' : row.change < 0 ? 'down' : 'same'
            const label = row.before === 0 ? '새로 추가' : row.after === 0 ? '빠짐' : row.change === 0 ? '날짜만 바뀜' : ''
            const days = [...row.days].sort((a, b) => a.date.localeCompare(b.date))
            const dayText = days.map(day => `${md(day.date)} ${formatQty(day.change, row.unit, true)}`)
            return <tr key={row.id} className={row.orders.length && row.change < 0 ? 'is-over-order' : ''}>
              <td><strong>{row.name}</strong>{label ? <small>{label}</small> : null}</td>
              <td><span className={`plan-impact__delta is-${tone}`}>{row.change === 0 ? '0' : formatQty(row.change, row.unit, true)}</span></td>
              <td className="plan-impact__totals">{formatQty(row.before, row.unit)} → <b>{formatQty(row.after, row.unit)}</b></td>
              <td className="plan-impact__days">{days.length <= 3 ? dayText.join(' · ')
                : <><button type="button" aria-expanded={openDays === row.id} onClick={() => setOpenDays(current => current === row.id ? null : row.id)}>{days.length}일 {openDays === row.id ? '접기' : '보기'}</button>
                  {openDays === row.id ? <span>{dayText.join(' · ')}</span> : null}</>}</td>
              <td className="plan-impact__orders">{row.orders.length ? row.orders.map((order, i) => <span key={order.purchase_order_id + i}>
                {md(order.requested_delivery_date)} 납품 · {order.product_name} 잔여 {Number(order.remaining_order_qty).toLocaleString('ko-KR', { maximumFractionDigits: 3 })} · {ORDER_STATUS[order.status] || order.status}
              </span>) : <span className="plan-impact__none">-</span>}
              {row.orders.length && row.change < 0 ? <em>필요량이 줄었습니다 · 감량·취소 확인</em> : null}</td>
            </tr>
          })}</tbody>
        </table></div>
      </>}
    {unmatched.length > 0 && <div className="plan-impact__unmatched"><h4>변경 재료의 기존 미입고 주문</h4>{unmatched.map((order, i) => <p key={order.purchase_order_id + i}>{order.requested_delivery_date} · {order.product_name} · 잔여 발주 {order.remaining_order_qty} · {ORDER_STATUS[order.status] || order.status}</p>)}</div>}
    {!firstSave && rows.length > 0 ? <p className="plan-impact__notice">{impact.notice}</p> : null}
  </section>
}
