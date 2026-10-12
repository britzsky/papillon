import { useEffect, useRef, useState } from 'react'
import { buildApiUrl } from '../config/api'

type Result = { suppliers: Array<{ supplier_code: string; supplier_name: string; status: string; message?: string; last_succeeded_at?: string }> }
/** inline: 안내 문단 안에 한 줄로 넣는 짧은 표시(공급사별 준비 상태만, 자세한 사유는 마우스를 올리면 보임) */
export default function CatalogPreparation({ accountId, date, onReady, inline = false }: { accountId: string; date: string; onReady?: () => void; inline?: boolean }) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const ready = useRef(onReady)
  useEffect(() => { ready.current = onReady }, [onReady])
  useEffect(() => {
    if (!accountId || !date) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const read = async (start: boolean) => {
      try {
        const response = await fetch(buildApiUrl('/v2/supplier-integration/preparation' + (start ? '' : '?' + new URLSearchParams({ account_id: accountId, delivery_date: date }))), {
          method: start ? 'POST' : 'GET', signal: controller.signal,
          ...(start ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: accountId, delivery_date: date }) } : {}),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || '상품 준비 상태 확인 실패')
        if (controller.signal.aborted) return
        setResult(data); setError('')
        if (data.suppliers.some((s: Result['suppliers'][number]) => s.status === 'PREPARING')) {
          if (++attempts < 60) timer = setTimeout(() => void read(false), 3000)
          else setError('상품 준비가 계속 진행 중입니다. 잠시 후 상태를 다시 확인해주세요.')
        } else if (data.suppliers.some((s: Result['suppliers'][number]) => s.status === 'READY')) ready.current?.()
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '상품 준비 실패') }
    }
    void read(true)
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [accountId, date, retry])
  if (inline) {
    const label = (status: string) => status === 'READY' ? '준비 완료' : status === 'PREPARING' ? '준비 중' : '확인 필요'
    return <span className="catalog-preparation-inline" role="status" aria-label="납품일 상품 준비">
      {!result && !error ? <b>확인 중</b> : null}
      {result?.suppliers.length === 0 ? <b className="is-warn">공급사 사업장 미지정</b> : null}
      {result?.suppliers.map((s, i) => <span key={s.supplier_code} title={[s.message, s.last_succeeded_at ? `마지막 성공 ${s.last_succeeded_at}` : ''].filter(Boolean).join(' · ')}>
        {i ? ', ' : ''}{s.supplier_name} <b className={s.status === 'READY' ? 'is-ok' : 'is-warn'}>{label(s.status)}</b></span>)}
      {error ? <b className="is-warn"> {error}</b> : null}
      {(error || result?.suppliers.some(s => s.status !== 'READY')) && <button type="button" className="catalog-preparation-inline__retry" onClick={() => setRetry(n => n + 1)}>다시 확인</button>}
    </span>
  }
  return <section aria-label="납품일 상품 준비" role="status">
    {!result && !error && <p>납품일별 상품·가격을 준비하고 있습니다.</p>}
    {result?.suppliers.length === 0 && <p>공급사 사업장을 먼저 지정해주세요.</p>}
    {result?.suppliers.map(s => <p key={s.supplier_code}>{s.supplier_name}: {s.status === 'READY' ? '준비 완료' : s.status === 'PREPARING' ? '준비 중' : '확인 필요'} · {s.message}{s.last_succeeded_at ? ` · 마지막 성공 ${s.last_succeeded_at}` : ''}</p>)}
    {error && <p role="alert">{error}</p>}
    {(error || result?.suppliers.some(s => s.status !== 'READY')) && <button type="button" onClick={() => setRetry(n => n + 1)}>준비 상태 다시 확인</button>}
  </section>
}
