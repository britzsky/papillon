import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildApiUrl } from '../config/api'
import KakaoRecipients from './KakaoRecipients'
type Notice = { event_key: string; event_type: string; fingerprint: string; title: string; action_path: string; status: string; actor_id?: string }
export default function WorkspaceNotifications({ accountId, defaultOpen = false }: { accountId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [rows, setRows] = useState<Notice[]>([])
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void fetch(buildApiUrl('/v2/workspace/notifications/refresh'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: accountId }), signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message || '업무 알림 조회 실패'); return data as Notice[] })
      .then(data => { if (!controller.signal.aborted) { setRows(data); setError('') } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
    const timer = setTimeout(() => setRevision(n => n + 1), 60_000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [accountId, open, revision])
  const state = async (row: Notice, status: string) => {
    setBusy(true)
    try {
      const response = await fetch(buildApiUrl('/v2/workspace/notifications/state'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: accountId, event_key: row.event_key, fingerprint: row.fingerprint, status }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.message || '처리 상태 저장 실패')
      setRevision(n => n + 1)
    } catch (e) { setError(e instanceof Error ? e.message : '저장 실패') }
    finally { setBusy(false) }
  }
  return <section aria-label="공동 업무 알림"><button onClick={() => setOpen(value => !value)}>{open ? '업무 알림 접기' : '업무 알림·처리 상태 보기'}</button>{open && <>
    <p>같은 업무는 하나로 모으며 접수·입고·부족량이 해결되면 자동으로 닫힙니다. 확인 중 상태는 동료와 공유됩니다.</p>
    <button disabled={busy} onClick={() => setRevision(n => n + 1)}>알림 새로고침</button>
    {error && <p role="alert">{error}</p>}
    {rows.map(row => <article key={row.event_key}><p>{row.title} · {row.status === 'IN_PROGRESS' ? `확인 중 (${row.actor_id || ''})` : '확인 필요'}</p>
      <Link to={row.action_path + '?' + new URLSearchParams({ account_id: accountId })}>해당 업무 열기</Link>{' '}
      <button disabled={busy} onClick={() => void state(row, row.status === 'IN_PROGRESS' ? 'OPEN' : 'IN_PROGRESS')}>{row.status === 'IN_PROGRESS' ? '담당 해제' : '내가 확인 중'}</button>
      {row.event_type === 'MEAL_CHANGE' && <button disabled={busy} onClick={() => void state(row, 'RESOLVED')}>변경 확인 완료</button>}
      {row.event_type === 'SUPPLIER_STATUS' && <button disabled={busy} onClick={() => void state(row, 'RESOLVED')}>확인 완료</button>}
    </article>)}{!rows.length && !error && <p>현재 확인할 알림이 없습니다.</p>}
    <KakaoRecipients accountId={accountId} />
  </>}</section>
}
