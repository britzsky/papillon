import { workspaceAccountId } from '../features/workspace/workspaceAccount'
import { useEffect, useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEADLINE_WINDOW_HOURS, deadlineOrderPath, getDeadlineAlertsCached, minutesUntil, remainingLabel, type DeadlineAlert } from '../api/deadlineAlerts'
import { getMealPlanAlertsCached, type MealPlanAlert } from '../api/workspaceAlerts'

const POLL_MS = 10 * 60_000

function read(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

type Row = { key: string; level: 'urgent' | 'warn'; group: string; title: string; detail: string; path: string }

/**
 * 머리글 종 알림: ① 24시간 안에 마감되는 발주(식단 기준 부족 식재료, 상단 배너와 같은 조회 결과)
 * ② 다음 주 식단표 미작성(목요일부터). 현장 계정은 자기 거래처, 본사는 식단표를 전체 거래처로 본다.
 */
export default function HeaderAlerts() {
  const location = useLocation()
  const navigate = useNavigate()
  const panelId = useId()
  const site = read('user_type') === '3'
  const accountId = workspaceAccountId(location.search).trim()
  const [deadlines, setDeadlines] = useState<DeadlineAlert[]>([])
  const [meals, setMeals] = useState<MealPlanAlert[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    const load = () => {
      setNow(Date.now())
      // 알림 조회 실패는 업무 화면을 막지 않는다(이전 서버면 빈 목록)
      if (accountId) getDeadlineAlertsCached(accountId, DEADLINE_WINDOW_HOURS).then(r => { if (active) setDeadlines(r.alerts) }).catch(() => { if (active) setDeadlines([]) })
      else setDeadlines([])
      getMealPlanAlertsCached(site ? accountId : '').then(r => { if (active) setMeals(r) }).catch(() => { if (active) setMeals([]) })
    }
    load()
    const poll = window.setInterval(load, POLL_MS)
    return () => { active = false; window.clearInterval(poll) }
  }, [accountId, site])

  const rows: Row[] = [
    ...deadlines
      .map(alert => ({ alert, minutes: minutesUntil(alert.deadline, now) }))
      .filter(({ minutes }) => minutes > 0)
      .sort((a, b) => a.minutes - b.minutes)
      .map(({ alert, minutes }) => ({
        key: alert.alert_key,
        level: minutes <= 300 ? 'urgent' as const : 'warn' as const,
        group: '발주 필요',
        title: `${alert.supplier_name} · 부족 식재료 ${alert.items.length}품목`,
        detail: `${alert.deadline.slice(5).replace('T', ' ')} 마감(${remainingLabel(minutes)}) · ${alert.delivery_date.slice(5)} 납품 · ${alert.items.slice(0, 3).map(item => item.ingredient_name).join(', ')}${alert.items.length > 3 ? ' 외' : ''}`,
        path: deadlineOrderPath(accountId, alert),
      })),
    ...meals.map(alert => ({
      key: alert.key,
      level: alert.level,
      group: '식단표',
      title: site ? alert.title : `${alert.account_name} · ${alert.title}`,
      detail: alert.detail,
      path: `${alert.path}?${new URLSearchParams({ account_id: alert.account_id })}`,
    })),
  ]
  const urgent = rows.some(row => row.level === 'urgent')
  const label = rows.length ? `알림 ${rows.length}건` : '알림 없음'

  return <>
    <button type="button" className={`header-bar__icon-button header-alerts__bell${rows.length ? ' has-alerts' : ''}`} popoverTarget={panelId} aria-label={label} title={label}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" /><path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
      {rows.length ? <span className={`header-alerts__badge${urgent ? ' is-urgent' : ''}`} aria-hidden="true">{rows.length > 99 ? '99+' : rows.length}</span> : null}
    </button>
    <section id={panelId} popover="auto" className="header-bar__user-info header-alerts" aria-label="알림">
      <div className="header-bar__user-info-heading"><h2>알림</h2><small>발주 마감 24시간 이내 · 다음 주 식단표</small></div>
      {rows.length ? <ul>{rows.map(row => <li key={row.key} className={`is-${row.level}`}>
        <button type="button" popoverTarget={panelId} popoverTargetAction="hide" onClick={() => navigate(row.path)}>
          <span className="header-alerts__group">{row.group}</span>
          <strong>{row.title}</strong>
          <small>{row.detail}</small>
        </button>
      </li>)}</ul> : <p className="header-alerts__empty">지금 확인할 알림이 없습니다.</p>}
      {!site && !accountId ? <p className="header-alerts__note">발주 마감 알림은 거래처를 선택한 화면에서 함께 표시됩니다.</p> : null}
    </section>
  </>
}
