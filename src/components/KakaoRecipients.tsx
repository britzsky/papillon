import { useEffect, useState } from 'react'
import { deactivateKakaoRecipient, getKakaoRecipients, saveKakaoRecipient, testKakaoRecipient, type KakaoRecipient } from '../api/kakaoRecipients'

const EMPTY = { recipient_name: '', phone: '', notify_supplier_status: 'Y', notify_deadline: 'Y' } as const

/** 카톡(알림톡)으로 받을 사람. 공급사 출고·주문 상태와 발주 마감 3시간 전 알림을 보낸다. */
export default function KakaoRecipients({ accountId }: { accountId: string }) {
  const [rows, setRows] = useState<KakaoRecipient[]>([])
  const [active, setActive] = useState(false)
  const [form, setForm] = useState<Partial<KakaoRecipient>>({ ...EMPTY })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    getKakaoRecipients(accountId).then(data => { if (alive) { setRows(data.recipients); setActive(data.active) } })
      .catch(e => { if (alive) setMessage(e.message) })
    return () => { alive = false }
  }, [accountId])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (e) { setMessage(e instanceof Error ? e.message : '처리 실패') } finally { setBusy(false) }
  }
  const save = () => run(async () => { setRows(await saveKakaoRecipient(accountId, form)); setForm({ ...EMPTY }) })
  const toggle = (row: KakaoRecipient, key: 'notify_supplier_status' | 'notify_deadline') =>
    run(async () => setRows(await saveKakaoRecipient(accountId, { ...row, [key]: row[key] === 'Y' ? 'N' : 'Y' })))
  return <section aria-label="카톡 알림 받는 사람">
    <h4>카톡 알림 받는 사람</h4>
    <p>{active ? '공급사 출고·주문 상태와 발주 마감 3시간 전 알림을 카톡으로 보냅니다.' : '카톡 발송 설정 전입니다. 받을 사람은 미리 등록해 둘 수 있습니다.'}</p>
    {message && <p role="alert">{message}</p>}
    {rows.filter(row => row.active_yn === 'Y').map(row => <article key={row.kakao_recipient_id}>
      <span>{row.recipient_name} · {row.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')}</span>{' '}
      <label><input type="checkbox" disabled={busy} checked={row.notify_supplier_status === 'Y'} onChange={() => void toggle(row, 'notify_supplier_status')} /> 출고·주문 상태</label>{' '}
      <label><input type="checkbox" disabled={busy} checked={row.notify_deadline === 'Y'} onChange={() => void toggle(row, 'notify_deadline')} /> 마감 임박</label>{' '}
      {active && <button disabled={busy} onClick={() => void run(async () => { const r = await testKakaoRecipient(accountId, row.kakao_recipient_id); setMessage(r.accepted ? '시험 메시지를 보냈습니다.' : `시험 발송 실패: ${r.message}`) })}>시험 발송</button>}{' '}
      <button disabled={busy} onClick={() => void run(async () => setRows(await deactivateKakaoRecipient(accountId, row.kakao_recipient_id)))}>받지 않음</button>
    </article>)}
    <div>
      <input aria-label="이름" placeholder="이름 (예: 영양사 홍길동)" value={form.recipient_name ?? ''} onChange={e => setForm({ ...form, recipient_name: e.target.value })} />{' '}
      <input aria-label="휴대폰 번호" placeholder="010-0000-0000" inputMode="tel" value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} />{' '}
      <button disabled={busy || !form.recipient_name?.trim() || !form.phone?.trim()} onClick={() => void save()}>추가</button>
    </div>
  </section>
}
