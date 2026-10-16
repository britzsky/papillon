import { workspaceAccountId } from '../features/workspace/workspaceAccount'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEADLINE_WINDOW_HOURS, deadlineOrderPath, dueThreshold, getDeadlineAlertsCached, minutesUntil, NOTIFY_MINUTES, remainingLabel, type DeadlineAlert } from '../api/deadlineAlerts'
import './DeadlineAlertBanner.css'

const POLL_MS = 10 * 60_000
const TICK_MS = 30_000
const SHOW_WITHIN_MINUTES = 300

function todayKst() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}
function read(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 저장 불가(사생활 보호 모드 등)면 이번 화면에서만 유지 */ }
}
const orderLink = deadlineOrderPath

/**
 * 발주 마감 알림. 마감 5시간 전부터 화면 상단에 표시하고, 브라우저 알림을 켜면 5·4·3·2·1시간, 30분 전에 한 번씩 알린다.
 * 발주를 마치면 서버 부족량에서 빠져 사라지고, '오늘 안 함'을 누르면 그날은 표시·알림을 멈춘다.
 */
export default function DeadlineAlertBanner() {
  const location = useLocation()
  const navigate = useNavigate()
  const accountId = workspaceAccountId(location.search).trim()
  const snoozeKey = `deadline-alert:snooze:${accountId}:${todayKst()}`
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [snoozed, setSnoozed] = useState(() => read(snoozeKey) === '1')
  const [expanded, setExpanded] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  useEffect(() => { setSnoozed(read(snoozeKey) === '1') }, [snoozeKey])

  useEffect(() => {
    if (!accountId) return
    let active = true
    const load = () => {
      getDeadlineAlertsCached(accountId, DEADLINE_WINDOW_HOURS).then(result => { if (active) setAlerts(result.alerts) }).catch(() => { /* 알림 조회 실패는 업무 화면을 막지 않는다 */ })
    }
    load()
    const poll = window.setInterval(load, POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => { active = false; window.clearInterval(poll); window.clearInterval(tick) }
  }, [accountId])

  const visible = useMemo(() => alerts
    .map(alert => ({ alert, minutes: minutesUntil(alert.deadline, now) }))
    .filter(({ minutes }) => minutes > 0 && minutes <= SHOW_WITHIN_MINUTES)
    .sort((a, b) => a.minutes - b.minutes), [alerts, now])

  const notify = useCallback((alert: DeadlineAlert, minutes: number) => {
    if (permission !== 'granted') return
    const names = alert.items.map(item => item.ingredient_name).slice(0, 4).join(', ') + (alert.items.length > 4 ? ` 외 ${alert.items.length - 4}건` : '')
    const notification = new Notification(`${alert.supplier_name} 발주 마감 ${remainingLabel(minutes)}`, {
      body: `${alert.deadline.replace('T', ' ')} 마감 · ${alert.delivery_date} 납품 · ${names}`,
      tag: alert.alert_key,
    })
    notification.onclick = () => { window.focus(); navigate(orderLink(accountId, alert)); notification.close() }
  }, [permission, navigate, accountId])

  useEffect(() => {
    if (snoozed || permission !== 'granted') return
    for (const { alert, minutes } of visible) {
      const prefix = `deadline-alert:fired:${accountId}:${alert.alert_key}:`
      const fired = new Set<number>()
      for (const threshold of NOTIFY_MINUTES) if (read(prefix + threshold)) fired.add(threshold)
      const due = dueThreshold(minutes, fired)
      if (due === null) continue
      // 이미 지난 더 이른 시점도 함께 표시해 다음 틱에 다시 울리지 않게 한다
      for (const threshold of NOTIFY_MINUTES) if (threshold >= due) write(prefix + threshold, '1')
      notify(alert, minutes)
    }
  }, [visible, snoozed, permission, accountId, notify])

  if (!accountId || snoozed || !visible.length) return null
  const first = visible[0]
  const itemCount = visible.reduce((sum, { alert }) => sum + alert.items.length, 0)
  const urgent = first.minutes <= 60

  const clock = `${Math.floor(first.minutes / 60)}:${String(first.minutes % 60).padStart(2, '0')}`
  const delivery = new Date(`${first.alert.delivery_date}T00:00:00`)
  const deliveryLabel = `${delivery.getMonth() + 1}/${delivery.getDate()}(${'일월화수목금토'[delivery.getDay()]})`
  const names = visible.flatMap(({ alert }) => alert.items.map(item => item.ingredient_name))
  const nameText = names.slice(0, 4).join(', ') + (names.length > 4 ? ` 외 ${names.length - 4}개` : '')

  return <section className={`rd deadline-alert${urgent ? ' is-urgent' : ''}`} role="status" aria-live="polite" aria-label="발주 마감 알림">
    <div className="deadline-alert__summary">
      <div className="deadline-alert__clock"><small>마감까지</small><strong>{clock}</strong></div>
      <div className="deadline-alert__text">
        <strong>{first.alert.supplier_name} {first.alert.deadline.slice(11, 16)} 마감 · {deliveryLabel} 납품분{visible.length > 1 ? ` 외 마감 ${visible.length - 1}건` : ''}</strong>
        <span>식단에 필요한데 아직 안 시킨 식재료 {itemCount}개 — {nameText}</span>
      </div>
      <div className="deadline-alert__actions">
        <button type="button" className="rd-btn is-primary" onClick={() => navigate(orderLink(accountId, first.alert))}>{itemCount}개 바로 발주</button>
        <button type="button" className="rd-btn is-ghost" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '접기' : '품목 보기'}</button>
        {permission === 'default' ? <button type="button" className="rd-btn is-ghost" onClick={() => void Notification.requestPermission().then(setPermission)}>브라우저 알림 켜기</button> : null}
        <button type="button" className="rd-btn is-ghost" onClick={() => { write(snoozeKey, '1'); setSnoozed(true) }}>오늘 안 함</button>
      </div>
    </div>
    {expanded ? <ul className="deadline-alert__groups">
      {visible.map(({ alert, minutes }) => <li key={alert.alert_key}>
        <div><strong>{alert.supplier_name} · {alert.external_site_name || alert.external_site_code}</strong>
          <span>{alert.deadline.replace('T', ' ')} 마감 ({remainingLabel(minutes)}) · {alert.delivery_date} 납품 · {alert.rule}</span>
          <button type="button" className="rd-btn" onClick={() => navigate(orderLink(accountId, alert))}>이 납품일로 발주</button></div>
        <ul>{alert.items.map(item => <li key={item.ingredient_id}>
          {item.ingredient_name} <small>{item.product_name} · 부족 {Number(item.shortage_qty).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}{item.base_unit}
            {item.late ? ` · 필요일 ${item.needed_by}보다 늦은 납품` : ` · ${item.needed_by} 필요`}</small></li>)}</ul>
      </li>)}
    </ul> : null}
  </section>
}
