import { Link } from 'react-router-dom'
import { useWeekMeals } from '../features/workspace/useWeekMeals'
import './WeekMealBoard.css'

/**
 * 홈 '이번 주 식단표'(현장 계정, 2026-10-22 사용자 요청: 크게). 요일 × 식사 표, 오늘 칸 강조.
 * 주 이동은 화살표, 수정은 식단표 관리로.
 */
export default function WeekMealBoard({ accountId, editHref }: { accountId: string; editHref: string }) {
  const week = useWeekMeals(accountId)
  return <section className="rd-card rd-weekmeal" aria-label={week.title}>
    <div className="rd-weekmeal__head">
      <h2 className="rd-h2">{week.title}</h2>
      <span className="rd-muted">{week.range}</span>
      <div className="rd-weekmeal__nav">
        <button type="button" className="rd-icon-btn" aria-label="이전 주" onClick={() => week.move(-1)}>‹</button>
        {week.offset !== 0 ? <button type="button" className="rd-btn is-ghost" onClick={week.reset}>이번 주</button> : null}
        <button type="button" className="rd-icon-btn" aria-label="다음 주" onClick={() => week.move(1)}>›</button>
      </div>
      <Link className="rd-btn is-primary" to={editHref}>식단표 관리</Link>
    </div>
    {week.error ? <p role="alert" className="rd-text-warn">{week.error}</p> : null}
    {week.loading ? <p role="status" className="rd-muted">식단표를 불러오고 있어요.</p> : null}
    {week.empty ? <div className="rd-weekmeal__empty">
      <p>이 주에 저장된 식단표가 없어요.</p>
      <Link className="rd-btn" to={editHref}>식단표 만들기</Link>
    </div> : null}
    {!week.loading && !week.empty ? <div className="rd-weekmeal__scroll">
      <table className="rd-weekmeal__table">
        <thead><tr><th scope="col" className="rd-weekmeal__slot">식사</th>
          {week.days.map(day => <th key={day.date} scope="col" className={day.today ? 'is-today' : ''}>
            <span className="rd-weekmeal__weekday">{day.weekday}</span><span className="rd-weekmeal__date">{day.label}</span>
            {day.today ? <span className="rd-chip is-info">오늘</span> : null}
          </th>)}</tr></thead>
        <tbody>{week.slots.map(slot => <tr key={slot.code}>
          <th scope="row" className="rd-weekmeal__slot">{slot.name}</th>
          {week.days.map(day => {
            const menus = day.slots[slot.code] ?? []
            return <td key={day.date} className={day.today ? 'is-today' : ''}>
              {menus.length ? <ul>{menus.map(menu => <li key={menu.menu_id}>{menu.menu_name}</li>)}</ul> : <span className="rd-zero">-</span>}
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div> : null}
  </section>
}
