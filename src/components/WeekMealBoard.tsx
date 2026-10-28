import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useWeekMeals, type WeekMealMenu } from '../features/workspace/useWeekMeals'
import { isHeadquarters } from '../features/workspace/workspaceAccount'
import './WeekMealBoard.css'

/** 끼니 색 꼬리표: 이름으로 아침·점심·저녁·간식을 나눈다(본사 끼니 종류는 이름이 자유라 코드로 못 정함) */
function slotTone(name: string) {
  if (name.includes('간식')) return 'is-snack'
  if (/조식|아침/.test(name)) return 'is-morning'
  if (/석식|저녁/.test(name)) return 'is-evening'
  return 'is-lunch'
}
/** 끼니 칼로리 합계. 메뉴 하나라도 칼로리가 없으면 안 보인다(일부 합계는 오해를 부름) */
function calories(menus: WeekMealMenu[]) {
  if (!menus.length || menus.some(menu => !menu.calories_per_serving)) return ''
  return `${Math.round(menus.reduce((sum, menu) => sum + Number(menu.calories_per_serving), 0)).toLocaleString('ko-KR')}kcal`
}

/**
 * 홈 '이번 주 식단표'(현장 계정, PC·터치 홈 공용, 2026-10-22 사용자 요청: 크게 → 2026-10-27: 보기 좋게).
 * 요일 카드(오늘 강조·지난 날 흐리게) 안에 끼니별 메뉴. 넓은 화면은 한 줄에 요일 전부, 좁은 화면은 옆으로 넘기며 처음엔 오늘 카드.
 * 주 이동은 화살표, 수정은 식단표 관리로.
 */
export default function WeekMealBoard({ accountId, editHref }: { accountId: string; editHref: string }) {
  const week = useWeekMeals(accountId)
  const scroller = useRef<HTMLDivElement | null>(null)
  const today = week.days.find(day => day.today)?.date ?? ''

  // 옆으로 넘기는 화면(휴대폰)에서 오늘 카드가 먼저 보이게
  useEffect(() => {
    const box = scroller.current
    const card = box?.querySelector<HTMLElement>('.rd-weekmeal__day.is-today')
    if (box && card && box.scrollWidth > box.clientWidth) box.scrollTo({ left: card.offsetLeft - box.offsetLeft - 8 })
  }, [today, week.loading])

  return <section className="rd-card rd-weekmeal" aria-label={week.title}>
    <div className="rd-weekmeal__head">
      <div className="rd-weekmeal__title">
        <h2 className="rd-h2">{week.title}</h2>
        <span>{week.range}</span>
      </div>
      <div className="rd-weekmeal__nav" role="group" aria-label="주 이동">
        <button type="button" className="rd-icon-btn" aria-label="이전 주" onClick={() => week.move(-1)}>‹</button>
        <button type="button" className="rd-weekmeal__this" disabled={week.offset === 0} onClick={week.reset}>이번 주</button>
        <button type="button" className="rd-icon-btn" aria-label="다음 주" onClick={() => week.move(1)}>›</button>
      </div>
      <Link className="rd-btn is-primary" to={editHref}>식단표 관리</Link>
    </div>
    {week.error ? <p role="alert" className="rd-text-warn">{week.error}</p> : null}
    {week.loading ? <p role="status" className="rd-muted">식단표를 불러오고 있어요.</p> : null}
    {week.empty ? <div className="rd-weekmeal__empty">
      {/* 2026-10-28: 현장 계정은 식단표를 만들지 않는다(본사가 올림) */}
      <p><strong>이 주에 저장된 식단표가 없어요.</strong><small>{isHeadquarters() ? '식단표를 만들면 여기에 요일별 메뉴가 보여요.' : '본사에서 식단표를 올리면 여기에 요일별 메뉴가 보여요.'}</small></p>
      {isHeadquarters() ? <Link className="rd-btn is-primary" to={editHref}>식단표 만들기</Link> : null}
    </div> : null}
    {!week.loading && !week.empty ? <div className="rd-weekmeal__days" ref={scroller} style={{ ['--rd-week-days' as string]: week.days.length }}>
      {week.days.map(day => {
        const past = Boolean(today) && day.date < today
        return <article key={day.date} className={`rd-weekmeal__day${day.today ? ' is-today' : ''}${past ? ' is-past' : ''}`} aria-label={`${day.weekday}요일 ${day.label}${day.today ? ' 오늘' : ''}`}>
          <header>
            <strong>{day.weekday}</strong>
            <span>{day.label}</span>
            {day.today ? <em>오늘</em> : null}
          </header>
          <div className="rd-weekmeal__slots">
            {week.slots.map(slot => {
              const menus = day.slots[slot.code] ?? []
              const kcal = calories(menus)
              return <section key={slot.code} className={`rd-weekmeal__slot ${slotTone(slot.name)}${menus.length ? '' : ' is-empty'}`}>
                <div className="rd-weekmeal__slot-head"><b>{slot.name}</b>{kcal ? <small>{kcal}</small> : null}</div>
                {menus.length ? <ul>{menus.map((menu, index) => <li key={`${menu.menu_id}-${index}`} className={`${index === 0 ? 'is-first' : ''}${menu.special ? ' is-special' : ''}`.trim() || undefined}>{menu.menu_name}</li>)}</ul>
                  : <p>식단 없음</p>}
              </section>
            })}
          </div>
        </article>
      })}
    </div> : null}
  </section>
}
