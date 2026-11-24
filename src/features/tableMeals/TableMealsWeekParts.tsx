import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatDateValue, weekOfDate, type MealSlotRow, type TableMealsDetailDay } from './tableMealsView'
import MealDocumentButtons from './MealDocumentButtons'

/**
 * 식단표 관리(PC) 2026-11-23 시안용 부품: 주 고르기 달력, 본사 '동작' 메뉴, 다운로드 메뉴, 빠른메뉴, 주간 식사 칼로리.
 * 화면 상태는 useTableMealsWorkspace가 갖고, 여기 부품은 받은 값만 그린다.
 */

/** 바깥을 누르거나 Esc를 누르면 닫는다(팝오버 공용) */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close() }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])
  return ref
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const sameDay = (a: Date, b: Date) => formatDateValue(a) === formatDateValue(b)
const mondayOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7))

/** 점 아홉 개(달력 열기) */
function DotsIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    {[5, 12, 19].flatMap(y => [5, 12, 19].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill="currentColor" />))}
  </svg>
}

/**
 * 몇월 몇주차 + 앞뒤 주 이동 + 점 아홉 개 → 달력. 달력에서 날짜를 누르면 그 날이 속한 주(월~일, 월요일이 속한 달의 주차)로 간다.
 * savedWeeks: 식단표가 있는 주의 월요일('YYYY-MM-DD') — 달력에 초록 점으로 표시.
 */
export function WeekNavigator({ weekDates, label, rangeLabel, savedWeeks, onPick }: {
  weekDates: Date[]
  label: string
  rangeLabel: string
  savedWeeks: Set<string>
  onPick: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ref = useDismiss(open, close)
  const start = weekDates[0] ?? new Date()
  const [view, setView] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1))
  const shift = (days: number) => onPick(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days))
  const toggle = () => { if (!open) setView(new Date(start.getFullYear(), start.getMonth(), 1)); setOpen(value => !value) }

  // 달력 줄 = 주(월~일). 그 달 1일이 든 주부터 말일이 든 주까지
  const first = mondayOf(view)
  const last = new Date(view.getFullYear(), view.getMonth() + 1, 0)
  const rows: Date[][] = []
  for (let monday = first; monday <= last; monday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)) {
    rows.push(Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)))
  }
  const today = new Date()
  const selectedMonday = formatDateValue(start)
  const pick = (date: Date) => { onPick(date); close() }

  return <div className="tmw-weeknav" ref={ref}>
    <button type="button" className="tmw-weeknav__dots" aria-label="달력에서 주 고르기" aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><DotsIcon /></button>
    <div className="tmw-weeknav__row">
      <button type="button" className="tmw-weeknav__arrow" aria-label="이전 주" onClick={() => shift(-7)}>‹</button>
      <h2 className="tmw-weeknav__label">{label}</h2>
      <button type="button" className="tmw-weeknav__arrow" aria-label="다음 주" onClick={() => shift(7)}>›</button>
    </div>
    <span className="tmw-weeknav__range">{rangeLabel}</span>
    {open ? <div className="tmw-cal" role="dialog" aria-label="주 고르기 달력">
      <div className="tmw-cal__head">
        <button type="button" className="tmw-cal__nav" aria-label="이전 달" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>‹</button>
        <strong>{view.getFullYear()}년 {view.getMonth() + 1}월</strong>
        <button type="button" className="tmw-cal__nav" aria-label="다음 달" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="tmw-cal__grid" role="grid">
        <div className="tmw-cal__row tmw-cal__row--head" role="row"><span className="tmw-cal__week" />{WEEKDAYS.map((day, i) =>
          <span key={day} role="columnheader" className={`tmw-cal__wd${i === 5 ? ' is-sat' : i === 6 ? ' is-sun' : ''}`}>{day}</span>)}</div>
        {rows.map(row => {
          const monday = formatDateValue(row[0])
          const week = weekOfDate(monday)
          const weekNo = week ? Number(week.week) + 1 : 0
          const weekMonth = row[0].getMonth() + 1
          return <div key={monday} role="row" className={`tmw-cal__row${monday === selectedMonday ? ' is-selected' : ''}`}>
            <span className="tmw-cal__week" title={savedWeeks.has(monday) ? '식단표 있음' : undefined}>
              {weekMonth === view.getMonth() + 1 ? `${weekNo}주` : `${weekMonth}월 ${weekNo}주`}
              {savedWeeks.has(monday) ? <i className="tmw-cal__saved" aria-label="식단표 있음" /> : null}
            </span>
            {row.map((date, i) => <button key={date.getDate()} type="button" role="gridcell"
              className={`tmw-cal__day${date.getMonth() !== view.getMonth() ? ' is-out' : ''}${sameDay(date, today) ? ' is-today' : ''}${i === 5 ? ' is-sat' : i === 6 ? ' is-sun' : ''}`}
              aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 주로 이동`} onClick={() => pick(date)}>{date.getDate()}</button>)}
          </div>
        })}
      </div>
      <div className="tmw-cal__foot">
        <span><i className="tmw-cal__saved" /> 식단표 있는 주</span>
        <button type="button" className="tmw-cal__today" onClick={() => pick(new Date())}>이번 주</button>
      </div>
    </div> : null}
  </div>
}

export type ActionItem = { key: string; label: string; hint?: string; disabled?: boolean; onClick: () => void }

/** 본사 '동작' — 동그란 버튼을 누르면 아래로 항목이 차례로 펼쳐진다. extra: 맨 위에 붙는 설정(식단 유형 등) */
export function ActionMenu({ items, extra }: { items: ActionItem[]; extra?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ref = useDismiss(open, close)
  return <div className={`tmw-action${open ? ' is-open' : ''}`} ref={ref}>
    <button type="button" className="tmw-action__trigger" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      <span>동작</span>
    </button>
    {open ? <div className="tmw-action__panel" role="menu" aria-label="식단표 동작">
      {extra ? <div className="tmw-action__extra" style={{ ['--i' as string]: 0 }}>{extra}</div> : null}
      {items.map((item, index) => <button key={item.key} type="button" role="menuitem" className="tmw-action__item" disabled={item.disabled} title={item.hint}
        style={{ ['--i' as string]: index + 1 }} onClick={() => { close(); item.onClick() }}>{item.label}</button>)}
    </div> : null}
  </div>
}

/** 다운로드 — 서류(조리계획표·급식운영일지·보존식 라벨)와 인쇄 */
export function DownloadMenu({ accountId, tableId, onPrint }: { accountId: string; tableId: string; onPrint: () => void }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ref = useDismiss(open, close)
  const disabled = !accountId || !tableId
  return <div className="tmw-download" ref={ref}>
    <button type="button" className="tmw-download__trigger" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}
      title={disabled ? '이 주 식단표가 없습니다' : '서류 받기·인쇄'}>다운로드</button>
    {open ? <div className="tmw-download__panel">
      <MealDocumentButtons accountId={accountId} tableId={tableId} buttonClassName="tmw-download__item" className="tmw-download__docs" />
      <button type="button" className="tmw-download__item" onClick={() => { close(); onPrint() }}>인쇄</button>
    </div> : null}
  </div>
}

export type QuickItem = { key: string; label: string; icon: ReactNode; to?: string; onClick?: () => void; disabled?: boolean }

/** 빠른메뉴 — 홈 바로가기와 같은 물방울 모양(주황·파랑 번갈아) */
export function QuickMenuCard({ items }: { items: QuickItem[] }) {
  return <section className="tmw-card tmw-side-card tmw-quick" aria-label="빠른메뉴">
    <h2 className="tmw-side-card__title">빠른메뉴</h2>
    <div className="tmw-quick__grid">
      {items.map((item, index) => {
        const body = <><span className="tmw-quick__drop">{item.icon}</span><span className="tmw-quick__label">{item.label}</span></>
        const cls = `tmw-quick__item${index % 3 === 0 ? ' is-orange' : ''}`
        // 못 누를 때는 버튼 대신 흐린 글자(전역 비활성 버튼 규칙이 회색 상자를 씌워서)
        return item.to ? <Link key={item.key} to={item.to} className={cls}>{body}</Link>
          : item.disabled ? <span key={item.key} className={`${cls} is-locked`} aria-disabled="true" title="이 주 식단표가 없습니다">{body}</span>
          : <button key={item.key} type="button" className={cls} onClick={item.onClick}>{body}</button>
      })}
    </div>
  </section>
}

/** 칸(요일·식사)의 1인분 열량 합계. 등록 안 된 메뉴는 빼고 더한다 */
const kcalOf = (menus: { calories_per_serving?: number }[]) => menus.reduce((sum, menu) => sum + (Number(menu.calories_per_serving) > 0 ? Number(menu.calories_per_serving) : 0), 0)

/** 주간 식사 칼로리 — 요일 × 본식(조식·중식·석식 등). 열마다 가장 높은 값은 주황, 가장 낮은 값은 파랑. 아래에 주간 합계·하루 평균(간식 포함) */
type SlotLike = Pick<MealSlotRow, 'id' | 'key' | 'label'>
export function WeekCaloriesCard({ days, slots, mainSlots, onPrev, onNext, wide = false }: {
  days: TableMealsDetailDay[]
  slots: SlotLike[]
  mainSlots: SlotLike[]
  onPrev: () => void
  onNext: () => void
  /** 태블릿(시안): 판 아래 가로 카드 — 줄 = 식사, 칸 = 요일, 오른쪽에 주간 총·하루 평균 */
  wide?: boolean
}) {
  const table = days.map(day => ({ day, values: mainSlots.map(slot => kcalOf(day.meals[slot.key] ?? [])) }))
  const columnStats = mainSlots.map((_, col) => {
    const values = table.map(row => row.values[col]).filter(value => value > 0)
    return { max: values.length > 1 ? Math.max(...values) : -1, min: values.length > 1 ? Math.min(...values) : -1 }
  })
  const dayTotals = days.map(day => kcalOf(slots.flatMap(slot => day.meals[slot.key] ?? [])))
  const total = dayTotals.reduce((sum, value) => sum + value, 0)
  const servedDays = dayTotals.filter(value => value > 0).length
  const fmt = (value: number) => Math.round(value).toLocaleString('ko-KR')
  if (wide) return <section className="tmw-card tmw-kcal-wide" aria-label="주간 칼로리">
    <span className="tmw-kcal-wide__title">주간 칼로리</span>
    {days.length === 0 || mainSlots.length === 0 ? <p className="tmw-side-card__empty">이 주 식단표가 없어요.</p> : <div className="tmw-kcal-wide__body">
      <table className="tmw-kcal-wide__table">
        <thead><tr><th scope="col"><span className="rd-sr-only">식사</span></th>{days.map(day => <th key={day.key} scope="col">{day.weekday || day.date.slice(5)}</th>)}</tr></thead>
        <tbody>{mainSlots.map((slot, col) => <tr key={slot.id}><th scope="row">{slot.label}</th>{table.map(({ day, values }) => {
          const value = values[col]
          return <td key={day.key} className={value > 0 && value === columnStats[col].max ? 'is-high' : value > 0 && value === columnStats[col].min ? 'is-low' : undefined}>{value > 0 ? fmt(value) : '-'}</td>
        })}</tr>)}</tbody>
      </table>
      <div className="tmw-kcal-wide__tiles">
        <div><span>주간 총<br />칼로리</span><strong>{fmt(total)}<small>kcal</small></strong></div>
        <div><span>하루 평균<br />칼로리</span><strong>{fmt(servedDays ? total / servedDays : 0)}<small>kcal</small></strong></div>
      </div>
    </div>}
  </section>
  return <section className="tmw-card tmw-side-card tmw-kcal" aria-label="주간 식사 칼로리">
    <div className="tmw-kcal__head">
      <button type="button" className="tmw-kcal__arrow" aria-label="이전 주" onClick={onPrev}>‹</button>
      <h2 className="tmw-side-card__title">주간 식사 칼로리</h2>
      <button type="button" className="tmw-kcal__arrow" aria-label="다음 주" onClick={onNext}>›</button>
    </div>
    {days.length === 0 || mainSlots.length === 0 ? <p className="tmw-side-card__empty">이 주 식단표가 없어요.</p> : <>
      <table className="tmw-kcal__table">
        <thead><tr><th scope="col"><span className="rd-sr-only">요일</span></th>{mainSlots.map(slot => <th key={slot.id} scope="col">{slot.label}</th>)}</tr></thead>
        <tbody>{table.map(({ day, values }) => <tr key={day.key}>
          <th scope="row">{day.weekday || day.date.slice(5)}</th>
          {values.map((value, col) => <td key={mainSlots[col].id} className={value > 0 && value === columnStats[col].max ? 'is-high' : value > 0 && value === columnStats[col].min ? 'is-low' : undefined}>
            {value > 0 ? fmt(value) : '-'}</td>)}
        </tr>)}</tbody>
      </table>
      <div className="tmw-kcal__tiles">
        <div><span>주간 총<br />칼로리</span><strong>{fmt(total)}<small>kcal</small></strong></div>
        <div><span>하루 평균<br />칼로리</span><strong>{fmt(servedDays ? total / servedDays : 0)}<small>kcal</small></strong></div>
      </div>
      <p className="tmw-side-card__note">등록된 1인분 열량 합계 · 높음 <b className="is-high">주황</b> · 낮음 <b className="is-low">파랑</b></p>
    </>}
  </section>
}
