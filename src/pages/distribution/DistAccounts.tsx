import { useCallback, useEffect, useState } from 'react'
import TopMenuLayout from '../../components/TopMenuLayout'
import { text, won } from '../../api/distAdmin'
import { getAccountProfile, getAccountProfiles, saveAccountProfile, type Row } from '../../api/distOrders'
import { Fields, Notice, type FieldDef } from './DistFields'
import { runAction } from './distActions'
import './DistAdmin.css'

const FIELDS: FieldDef[] = [
  { key: 'payment_terms', label: '결제 조건', required: true, options: { MONTHLY: '후불(월말 청구) 허용', PREPAID: '선결제(무통장)만' } },
  { key: 'credit_limit', label: '후불 한도(원)', type: 'number', hint: '아직 안 받은 후불 금액 + 새 주문이 넘으면 후불 불가. 비우면 한도 없음' },
  { key: 'credit_hold_yn', label: '후불 일시 정지', required: true, options: { N: '정상', Y: '정지(연체 등)' } },
  { key: 'order_enabled_yn', label: '더채움몰 주문', required: true, options: { Y: '허용', N: '막음' } },
  { key: 'billing_close_day', label: '청구 마감일', type: 'number', hint: '매월 n일(31 = 말일)' },
  { key: 'payment_due_days', label: '결제 기한(일)', type: 'number', hint: '청구서 발행 후' },
  { key: 'tax_invoice_email', label: '세금계산서 이메일', type: 'email', maxLength: 100 },
  { key: 'tax_invoice_manager', label: '세금계산서 담당자', maxLength: 50 },
  { key: 'default_recipient_name', label: '기본 받는 분', maxLength: 50, hint: '주문 화면에 미리 채움' },
  { key: 'default_phone', label: '기본 연락처', type: 'tel', maxLength: 30 },
  { key: 'default_zipcode', label: '기본 우편번호', maxLength: 10 },
  { key: 'default_address1', label: '기본 배송지 주소', wide: true, maxLength: 255 },
  { key: 'default_address2', label: '기본 상세주소', wide: true, maxLength: 255 },
]

/**
 * 협력사 관리 › 거래처 결제 설정(본사 전용, 2026-11-02 3단계). 설정이 없는 거래처는 후불 허용(2단계 결정 '후불도 일단 허용').
 * 여기서 거래처별로 선결제만·한도·정지·주문 막기와 주문 화면 기본 배송지를 정한다.
 */
export default function DistAccounts() {
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState<Row | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const notice = useCallback((value: string, isError: boolean) => { setMessage(value); setFailed(isError) }, [])

  useEffect(() => {
    let alive = true
    getAccountProfiles(search, true).then(result => { if (alive) setRows(result.accounts) })
      .catch(error => { if (alive) notice(error instanceof Error ? error.message : '불러오지 못했습니다.', true) })
    return () => { alive = false }
  }, [search, revision, notice])
  useEffect(() => {
    if (!selected) return
    let alive = true
    getAccountProfile(selected).then(result => {
      if (!alive) return
      const profile = result.profile
      setForm({
        ...profile, account_id: selected, payment_terms: text(profile.payment_terms) || 'MONTHLY', credit_hold_yn: text(profile.credit_hold_yn) || 'N',
        order_enabled_yn: text(profile.order_enabled_yn) || 'Y', billing_close_day: text(profile.billing_close_day) || '31', payment_due_days: text(profile.payment_due_days) || '30',
      })
    }).catch(error => { if (alive) notice(error instanceof Error ? error.message : '불러오지 못했습니다.', true) })
    return () => { alive = false }
  }, [selected, notice])

  const submit = async () => {
    if (form && await runAction(setBusy, notice, () => saveAccountProfile(form))) setRevision(value => value + 1)
  }

  return <div className="dist-page"><TopMenuLayout title="거래처 결제 설정">
    <div className="rd rd-page dist-admin">
      <header className="rd-page__head"><div>
        <h1 className="rd-sr-only">거래처 결제 설정</h1>
        <p className="rd-muted">더채움몰 거래처 구매의 후불 허용·한도·정지와 주문 화면 기본 배송지입니다. <b>설정이 없는 거래처는 후불이 허용</b>됩니다.</p>
      </div></header>
      <Notice message={message} failed={failed} />
      <div className="dist-split">
        <section className="rd-card dist-card dist-list" aria-labelledby="dist-acc-title">
          <form className="dist-filters" onSubmit={event => { event.preventDefault(); setSearch(keyword.trim()) }}>
            <input className="rd-input" type="search" aria-label="거래처 검색" placeholder="거래처명·코드(비우면 설정·주문 있는 곳만)" value={keyword} onChange={event => setKeyword(event.target.value)} />
            <button type="submit" className="rd-btn">검색</button>
          </form>
          <h2 className="rd-h2" id="dist-acc-title">거래처 {rows.length}곳</h2>
          <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="거래처 목록">
            <table className="rd-table dist-table">
              <thead><tr><th>거래처</th><th>결제 조건</th><th className="is-num">후불 미수</th><th className="is-num">한도</th><th className="is-num">주문</th></tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={5} className="dist-empty">{search ? '찾는 거래처가 없습니다.' : '아직 설정하거나 주문한 거래처가 없습니다. 위에서 거래처를 검색하세요.'}</td></tr> : null}
                {rows.map(row => {
                  const id = text(row.account_id)
                  const set = Number(row.has_profile) === 1
                  return <tr key={id} className={selected === id ? 'is-selected' : ''}>
                    <td><button type="button" className="dist-row-link" onClick={() => setSelected(id)} aria-current={selected === id ? 'true' : undefined}>
                      <span><b>{text(row.account_name)}</b><small className="rd-muted dist-code">{id}</small></span></button></td>
                    <td>{!set ? <span className="rd-chip is-done">기본(후불 허용)</span> : row.payment_terms === 'PREPAID' ? <span className="rd-chip is-warn">선결제만</span> : <span className="rd-chip is-ok">후불</span>}
                      {row.credit_hold_yn === 'Y' ? <span className="rd-chip is-urgent">정지</span> : null}{row.order_enabled_yn === 'N' ? <span className="rd-chip is-urgent">주문 막음</span> : null}</td>
                    <td className="is-num">{won(row.outstanding_credit)}</td>
                    <td className="is-num">{row.credit_limit === null || row.credit_limit === undefined ? '없음' : won(row.credit_limit)}</td>
                    <td className="is-num">{text(row.order_count)}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rd-card dist-card dist-detail" aria-label="결제 설정">
          {!form ? <p className="dist-empty">왼쪽에서 거래처를 고르세요.</p> : <form onSubmit={event => { event.preventDefault(); void submit() }}>
            <div className="dist-card__head"><h2 className="rd-h2">{text(form.account_name)}</h2><small className="rd-muted dist-code">{text(form.account_id)}</small></div>
            <Fields defs={FIELDS} value={form} disabled={busy} onChange={patch => setForm(current => ({ ...current, ...patch }))} />
            <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy}>저장</button></div>
          </form>}
        </section>
      </div>
    </div>
  </TopMenuLayout></div>
}
