import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import writeExcelFile, { type Row } from 'write-excel-file/universal'
import TopMenuLayout from '../../components/TopMenuLayout'
import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import {
  getLedgerLines, getLedgerSummary, getPriceCheck, recheckLedger,
  type GroupBy, type LedgerFilter, type LedgerLine, type LedgerLines, type LedgerSummary, type PriceBasis, type PriceCheck,
} from '../../api/purchaseLedger'
import './PurchaseLedger.css'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStart = () => { const d = new Date(); return isoDate(new Date(d.getFullYear(), d.getMonth(), 1)) }
const fmt = (value: number | null | undefined, digits = 0) =>
  value == null || Number.isNaN(value) ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits: digits })
const won = (value: number | null | undefined) => (value == null ? '-' : `${fmt(value)}원`)
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

const SOURCE_LABEL: Record<string, string> = { ORDER: '발주 입고', DIRECT: '직접 구매', HISTORY: '구매 이력' }
const TAX_LABEL: Record<string, string> = { TAXABLE: '과세', TAX_FREE: '면세' }
const CHECK_LABEL: Record<string, string> = { UNCHECKED: '청구 대조 전', MATCHED: '청구 일치', PRICE_DIFF: '금액 다름', QTY_DIFF: '수량 다름' }
const GROUP_LABEL: Record<GroupBy, string> = { supplier: '공급사별', account: '거래처별', month: '월별', day: '일별' }
const BASIS_LABEL: Record<PriceBasis, string> = { EXCLUDES_VAT: '부가세 별도', INCLUDES_VAT: '부가세 포함', MIXED: '섞여 있음', NO_DATA: '비교할 내역 없음' }

/** 금액 상태 한 칸: 발주 입고는 추정/청구 반영, 나머지는 공급사 금액 */
function amountState(line: LedgerLine) {
  if (line.source !== 'ORDER') return { label: '공급사 금액', tone: 'is-done' }
  const status = line.amount_check_status ?? 'UNCHECKED'
  const tone = status === 'MATCHED' ? 'is-done' : status === 'UNCHECKED' ? 'is-info' : 'is-warn'
  return { label: status === 'UNCHECKED' ? '발주 단가 추정' : CHECK_LABEL[status], tone }
}

/**
 * 매입 관리(ASP, 본사 전용, 2026-11-23). 입고 줄 전체(발주 입고·직접 구매·구매 이력)를 기간·거래처·공급사·과세 구분으로 모아 보고,
 * 발주 입고의 추정 금액이 공급사 청구와 맞는지 본다. 더존 내보내기는 양식이 정해지면 붙인다(테이블만 준비됨).
 */
export default function PurchaseLedger() {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  const [draft, setDraft] = useState<LedgerFilter>({ from_date: monthStart(), to_date: isoDate(new Date()) })
  const [filter, setFilter] = useState<LedgerFilter>(draft)
  const [groupBy, setGroupBy] = useState<GroupBy>('supplier')
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [lines, setLines] = useState<LedgerLines | null>(null)
  const [page, setPage] = useState(0)
  const [check, setCheck] = useState<PriceCheck | null>(null)
  const [view, setView] = useState<'lines' | 'check'>('lines')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const notify = useCallback((text: string, isError = false) => { setMessage(text); setFailed(isError) }, [])

  const scoped = { ...filter, account_id: accountId }

  // 공급사 고르기 목록: 기간 전체 공급사별 합계에서
  useEffect(() => {
    let alive = true
    getLedgerSummary({ from_date: filter.from_date, to_date: filter.to_date, account_id: accountId }, 'supplier')
      .then(s => { if (alive) setSuppliers(s.groups.map(g => ({ id: g.group_key, name: g.group_name ?? g.group_key }))) })
      .catch(() => { /* 목록은 아래 합계 오류로 알린다 */ })
    return () => { alive = false }
  }, [filter.from_date, filter.to_date, accountId, revision])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const q = { ...filter, account_id: accountId }
    Promise.all([getLedgerSummary(q, groupBy), getLedgerLines(q, page)])
      .then(([s, l]) => { if (alive) { setSummary(s); setLines(l) } })
      .catch(error => { if (alive) notify(errorText(error, '매입 내역을 불러오지 못했습니다.'), true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [filter, accountId, groupBy, page, revision, notify])

  useEffect(() => {
    if (view !== 'check') return
    let alive = true
    getPriceCheck({ ...filter, account_id: accountId })
      .then(result => { if (alive) setCheck(result) })
      .catch(error => { if (alive) notify(errorText(error, '단가 기준 확인을 불러오지 못했습니다.'), true) })
    return () => { alive = false }
  }, [view, filter, accountId, revision, notify])

  const apply = (next: LedgerFilter) => {
    if (!next.from_date || !next.to_date || next.from_date > next.to_date) { notify('조회 기간을 확인해 주세요.', true); return }
    setMessage(''); setPage(0); setFilter({ ...next })
  }
  const quick = (patch: Partial<LedgerFilter>) => { const next = { ...draft, ...patch }; setDraft(next); apply(next) }

  const recheck = async () => {
    setBusy('recheck')
    try {
      const r = await recheckLedger(scoped)
      notify(`청구 내역이 있는 발주 품목 ${fmt(r.order_item_count)}개를 다시 대조했습니다 · 일치 ${fmt(r.matched)} · 금액 다름 ${fmt(r.price_diff)} · 수량 다름 ${fmt(r.qty_diff)}`)
      setRevision(v => v + 1)
    } catch (error) { notify(errorText(error, '다시 대조하지 못했습니다.'), true) }
    finally { setBusy('') }
  }

  const download = async () => {
    setBusy('excel')
    try {
      const all: LedgerLine[] = []
      for (let p = 0; p < 40; p += 1) {
        const chunk = await getLedgerLines(scoped, p, 500)
        all.push(...chunk.rows)
        if (all.length >= chunk.total_count || chunk.rows.length === 0) break
      }
      const head = { fontWeight: 'bold' as const, backgroundColor: '#E3F1E8' }
      const titles = ['입고일', '구분', '거래처', '공급사', '사업장', '주문번호', '상품코드', '상품', '수량', '단위', '단가', '공급가액', '부가세', '합계', '과세', '금액 상태']
      const rows: Row[] = [titles.map(value => ({ value, ...head }))]
      for (const l of all) rows.push([
        { value: l.receipt_date, type: String }, { value: SOURCE_LABEL[l.source] }, { value: l.account_name ?? l.account_id }, { value: l.supplier_name },
        { value: l.site_name ?? l.site_code ?? '' }, { value: l.client_ord ? `${l.client_ord}${l.client_ord_item ? `-${l.client_ord_item}` : ''}` : '' },
        { value: l.supplier_item_code ?? '' }, { value: l.product_name ?? '' }, { value: l.received_qty, type: Number }, { value: l.order_unit },
        { value: l.unit_price, type: Number }, { value: l.supply_amount, type: Number }, { value: l.vat_amount, type: Number }, { value: l.total_amount, type: Number },
        { value: l.tax_type ? TAX_LABEL[l.tax_type] : '미확인' }, { value: amountState(l).label },
      ])
      const blob = await writeExcelFile(rows, { sheet: '매입', columns: titles.map((_, i) => ({ width: i === 7 ? 30 : i === 2 || i === 3 ? 16 : 12 })) }).toBlob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `매입_${filter.from_date}_${filter.to_date}.xlsx`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      notify(`${fmt(all.length)}줄을 엑셀로 내려받았습니다.`)
    } catch (error) { notify(errorText(error, '엑셀을 만들지 못했습니다.'), true) }
    finally { setBusy('') }
  }

  const t = summary?.totals
  const diffCount = (t?.price_diff_line_count ?? 0) + (t?.qty_diff_line_count ?? 0)
  const pages = lines ? Math.max(1, Math.ceil(lines.total_count / lines.size)) : 1

  return <div className="purchase-ledger-page"><TopMenuLayout title="매입 관리">
    <div className="rd rd-page rd-ledger">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-sr-only">매입 관리</h1>
          <p className="rd-muted">웰스토리·아워홈 등에서 산 내역(발주 입고·직접 구매·구매 이력)을 모아 봅니다. 발주 입고 금액은 <strong>발주 단가로 계산한 추정</strong>이고, <Link to="/operations/initial-setup">고객사 초기 세팅</Link>에서 구매 이력을 가져오면 공급사 청구 금액으로 바뀝니다.</p>
        </div>
      </header>

      <form className="rd-card ledger__filters"onSubmit={event => { event.preventDefault(); apply(draft) }}>
        <input className="rd-input" type="date" aria-label="조회 시작일" value={draft.from_date} onChange={e => setDraft(d => ({ ...d, from_date: e.target.value }))} />
        <span>~</span>
        <input className="rd-input" type="date" aria-label="조회 끝일" value={draft.to_date} onChange={e => setDraft(d => ({ ...d, to_date: e.target.value }))} />
        <select className="rd-input" aria-label="공급사" value={draft.supplier_id ?? ''} onChange={e => setDraft(d => ({ ...d, supplier_id: e.target.value }))}>
          <option value="">공급사 전체</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="rd-input" aria-label="구분" value={draft.source ?? ''} onChange={e => setDraft(d => ({ ...d, source: e.target.value as LedgerFilter['source'] }))}>
          <option value="">구분 전체</option><option value="ORDER">발주 입고</option><option value="DIRECT">직접 구매</option><option value="HISTORY">구매 이력</option>
        </select>
        <select className="rd-input" aria-label="과세 구분" value={draft.tax_type ?? ''} onChange={e => setDraft(d => ({ ...d, tax_type: e.target.value as LedgerFilter['tax_type'] }))}>
          <option value="">과세 전체</option><option value="TAXABLE">과세</option><option value="TAX_FREE">면세</option><option value="UNKNOWN">미확인</option>
        </select>
        <select className="rd-input" aria-label="금액 상태" value={draft.check_status ?? ''} onChange={e => setDraft(d => ({ ...d, check_status: e.target.value as LedgerFilter['check_status'] }))}>
          <option value="">금액 상태 전체</option><option value="ESTIMATE">발주 단가 추정</option><option value="MATCHED">청구 일치</option><option value="DIFF">청구와 다름</option>
        </select>
        <input className="rd-input ledger__search" type="search" aria-label="상품 검색" placeholder="상품명·상품코드" value={draft.keyword ?? ''} onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))} />
        <button type="submit" className="rd-btn is-primary">조회</button>
        <span className="rd-muted rd-fs-sm">{accountId ? '선택한 거래처만' : '전체 거래처'}</span>
      </form>

      {message ? <p className={`ledger__msg${failed ? ' is-error' : ''}`} role="status">{message}</p> : null}

      <div className="rd-page__tiles">
        <div className="rd-card rd-page__tile is-info"><span>매입 합계</span><strong>{won(t?.total_amount)}</strong><small>공급가 {won(t?.supply_amount)} · 부가세 {won(t?.vat_amount)} · {fmt(t?.line_count)}줄</small></div>
        <div className="rd-card rd-page__tile"><span>과세 / 면세</span><strong>{won(t?.taxable_supply_amount)}</strong><small>면세 {won(t?.tax_free_supply_amount)}{t?.unknown_tax_supply_amount ? ` · 미확인 ${won(t.unknown_tax_supply_amount)}` : ''}</small></div>
        <button type="button" className={`rd-card rd-page__tile${t?.estimate_line_count ? ' is-warn' : ' is-ok'}`} onClick={() => quick({ check_status: 'ESTIMATE', source: 'ORDER' })}>
          <span>발주 단가 추정</span><strong>{fmt(t?.estimate_line_count)}줄</strong><small>공급사 청구 대조 전 · 눌러서 보기</small></button>
        <button type="button" className={`rd-card rd-page__tile${diffCount ? ' is-warn' : ' is-ok'}`} onClick={() => quick({ check_status: 'DIFF', source: 'ORDER' })}>
          <span>청구와 다름</span><strong>{fmt(diffCount)}줄</strong><small>금액 {fmt(t?.price_diff_line_count)} · 수량 {fmt(t?.qty_diff_line_count)}</small></button>
      </div>

      <section className="rd-card rd-page__main ledger__main">
        <div className="ledger__bar">
          <h2 className="rd-h2">묶어 보기</h2>
          <div className="rd-pills" role="tablist" aria-label="묶는 기준">
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map(g => <button key={g} type="button" role="tab" aria-selected={groupBy === g} className={groupBy === g ? 'is-active' : ''} onClick={() => setGroupBy(g)}>{GROUP_LABEL[g]}</button>)}
          </div>
          <span className="rd-muted rd-fs-sm">발주 {won(t?.order_total_amount)} · 직접 구매 {won(t?.direct_total_amount)} · 구매 이력 {won(t?.history_total_amount)}</span>
        </div>
        <div className="rd-page__scroll ledger__scroll is-short" tabIndex={0} role="region" aria-label="묶음별 합계">
          <table className="rd-table ledger__table">
            <thead><tr><th>{GROUP_LABEL[groupBy].replace('별', '')}</th><th className="is-num">줄</th><th className="is-num">과세 공급가</th><th className="is-num">부가세</th><th className="is-num">면세</th><th className="is-num">합계</th><th className="is-num">추정</th><th className="is-num">차이</th></tr></thead>
            <tbody>{(summary?.groups ?? []).map(g => <tr key={g.group_key}>
              <td><strong>{g.group_name ?? g.group_key}</strong></td>
              <td className="is-num">{fmt(g.line_count)}</td>
              <td className="is-num">{won(g.taxable_supply_amount)}</td>
              <td className="is-num">{won(g.vat_amount)}</td>
              <td className="is-num">{won(g.tax_free_supply_amount)}</td>
              <td className="is-num"><strong>{won(g.total_amount)}</strong></td>
              <td className="is-num">{g.estimate_line_count ? <span className="rd-chip is-info">{fmt(g.estimate_line_count)}</span> : '-'}</td>
              <td className="is-num">{g.price_diff_line_count + g.qty_diff_line_count ? <span className="rd-chip is-warn">{fmt(g.price_diff_line_count + g.qty_diff_line_count)}</span> : '-'}</td>
            </tr>)}
            {!loading && !summary?.groups.length ? <tr><td colSpan={8} className="rd-muted">이 기간 매입이 없습니다.</td></tr> : null}</tbody>
          </table>
        </div>
      </section>

      <section className="rd-card rd-page__main ledger__main">
        <div className="ledger__bar">
          <div className="rd-pills" role="tablist" aria-label="보기">
            <button type="button" role="tab" aria-selected={view === 'lines'} className={view === 'lines' ? 'is-active' : ''} onClick={() => setView('lines')}>매입 줄 {lines ? fmt(lines.total_count) : ''}</button>
            <button type="button" role="tab" aria-selected={view === 'check'} className={view === 'check' ? 'is-active' : ''} onClick={() => setView('check')}>공급사 청구 대조 · 단가 기준</button>
          </div>
          <div className="ledger__actions">
            {view === 'lines'
              ? <button type="button" className="rd-btn" disabled={!!busy || !lines?.total_count} onClick={() => void download()}>{busy === 'excel' ? '만드는 중…' : '엑셀 내려받기'}</button>
              : <button type="button" className="rd-btn" disabled={!!busy} onClick={() => void recheck()} title="이미 받은 공급사 청구 내역으로 다시 대조(공급사 API는 부르지 않음)">{busy === 'recheck' ? '대조 중…' : '다시 대조'}</button>}
          </div>
        </div>
        {view === 'lines' ? <>
          <div className="rd-page__scroll ledger__scroll" tabIndex={0} role="region" aria-label="매입 줄">
            <table className="rd-table ledger__table">
              <thead><tr><th>입고일</th><th>구분</th><th>거래처</th><th>공급사</th><th>상품</th><th className="is-num">수량</th><th className="is-num">단가</th><th className="is-num">공급가액</th><th className="is-num">부가세</th><th className="is-num">합계</th><th>과세</th><th>금액 상태</th></tr></thead>
              <tbody>{(lines?.rows ?? []).map(l => {
                const state = amountState(l)
                return <tr key={l.goods_receipt_item_id}>
                  <td>{l.receipt_date}</td>
                  <td>{SOURCE_LABEL[l.source]}</td>
                  <td>{l.account_name ?? l.account_id}</td>
                  <td>{l.supplier_name}{l.site_name ? <small className="rd-muted"> {l.site_name}</small> : null}</td>
                  <td><strong>{l.product_name ?? '-'}</strong><small className="rd-muted"> {l.supplier_item_code}{l.client_ord ? ` · ${l.client_ord}` : ''}</small></td>
                  <td className="is-num">{fmt(l.received_qty, 3)}{l.order_unit}</td>
                  <td className="is-num">{won(l.unit_price)}</td>
                  <td className="is-num">{won(l.supply_amount)}</td>
                  <td className="is-num">{won(l.vat_amount)}</td>
                  <td className="is-num"><strong>{won(l.total_amount)}</strong></td>
                  <td>{l.tax_type ? TAX_LABEL[l.tax_type] : <span className="rd-chip is-warn">미확인</span>}</td>
                  <td><span className={`rd-chip ${state.tone}`} title={l.source === 'ORDER' && l.bill_qty ? `공급사 청구 ${fmt(l.bill_qty, 3)}${l.order_unit} · 공급가 ${won(l.bill_supply_amount)}` : undefined}>{state.label}</span></td>
                </tr>
              })}
              {!loading && !lines?.rows.length ? <tr><td colSpan={12} className="rd-muted">조건에 맞는 매입이 없습니다.</td></tr> : null}</tbody>
            </table>
          </div>
          {pages > 1 ? <div className="ledger__pager">
            <button type="button" className="rd-btn" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>이전</button>
            <span>{page + 1} / {pages}</span>
            <button type="button" className="rd-btn" disabled={page + 1 >= pages || loading} onClick={() => setPage(p => p + 1)}>다음</button>
          </div> : null}
        </> : <PriceCheckView check={check} />}
      </section>
    </div>
  </TopMenuLayout></div>
}

function PriceCheckView({ check }: { check: PriceCheck | null }) {
  if (!check) return <p className="rd-muted">불러오는 중…</p>
  return <div className="ledger__check">
    <p className="rd-muted rd-fs-sm">과세 상품의 <strong>발주 단가 × 청구 수량</strong>이 공급사 공급가와 맞으면 '부가세 별도', 합계와 맞으면 '부가세 포함'입니다(1원 이하 차이 무시). 비교할 내역은 고객사 초기 세팅에서 구매 이력을 가져오면 생깁니다. 결과가 '부가세 포함'이면 서버 설정 <code>purchase-ledger.price-includes-vat-suppliers</code>에 그 공급사를 적어야 합니다.</p>
    <div className="rd-page__scroll ledger__scroll is-short" tabIndex={0} role="region" aria-label="공급사별 단가 기준">
      <table className="rd-table ledger__table">
        <thead><tr><th>공급사</th><th>우리 발주 단가</th><th className="is-num">비교한 청구 줄</th><th className="is-num">별도 / 포함 / 기타</th><th>공급사 입고 단가</th><th>지금 설정</th></tr></thead>
        <tbody>{check.suppliers.map(s => <tr key={s.supplier_code}>
          <td><strong>{s.supplier_name}</strong></td>
          <td><span className={`rd-chip ${s.order_price_basis === 'NO_DATA' ? '' : s.setting_ok ? 'is-done' : 'is-urgent'}`}>{BASIS_LABEL[s.order_price_basis]}</span></td>
          <td className="is-num">{fmt(s.order?.line_count ?? 0)}</td>
          <td className="is-num">{s.order ? `${fmt(s.order.excludes_vat_count)} / ${fmt(s.order.includes_vat_count)} / ${fmt(s.order.other_count)}` : '-'}</td>
          <td>{BASIS_LABEL[s.supplier_unit_price_basis]}{s.history ? <small className="rd-muted"> ({fmt(s.history.line_count)}줄)</small> : null}</td>
          <td>{s.configured_includes_vat ? '부가세 포함으로 계산' : '부가세 별도로 계산'}{s.setting_ok ? '' : <strong className="ledger__bad"> · 설정 확인 필요</strong>}</td>
        </tr>)}
        {!check.suppliers.length ? <tr><td colSpan={6} className="rd-muted">이 기간 공급사 청구 내역이 없습니다. 고객사 초기 세팅에서 구매 이력을 먼저 가져오세요.</td></tr> : null}</tbody>
      </table>
    </div>
    <BillTable title="발주 단가가 청구와 맞지 않는 줄(최근 30)" rows={check.mismatch_samples} showPrices />
    <BillTable title="공급사는 청구했는데 우리 입고가 없는 품목" rows={check.billed_not_received} />
    <BillTable title="우리 발주 품목을 못 찾은 청구 줄" rows={check.unlinked_bill_lines} />
  </div>
}

function BillTable({ title, rows, showPrices = false }: { title: string; rows: PriceCheck['mismatch_samples']; showPrices?: boolean }) {
  return <details className="ledger__bills" open={rows.length > 0 && rows.length <= 10}>
    <summary>{title} <span className={`rd-chip ${rows.length ? 'is-warn' : 'is-done'}`}>{fmt(rows.length)}</span></summary>
    {rows.length ? <div className="rd-page__scroll ledger__scroll is-short" tabIndex={0} role="region" aria-label={title}>
      <table className="rd-table ledger__table">
        <thead><tr><th>청구일</th><th>공급사</th><th>거래처</th><th>주문번호</th><th>상품</th><th className="is-num">수량</th>
          {showPrices ? <><th className="is-num">발주 단가</th><th className="is-num">청구 단가</th><th className="is-num">공급가</th><th className="is-num">부가세</th></> : null}<th className="is-num">합계</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>
          <td>{r.bill_date}</td><td>{r.supplier_name}</td><td>{r.account_id}</td><td>{r.client_ord}{r.client_ord_item ? `-${r.client_ord_item}` : ''}</td>
          <td>{r.product_name || '-'}<small className="rd-muted"> {r.supplier_item_code ?? ''}</small></td>
          <td className="is-num">{fmt(r.billed_qty, 3)}</td>
          {showPrices ? <><td className="is-num">{won(r.order_unit_price)}</td><td className="is-num">{won(r.bill_unit_price)}</td><td className="is-num">{won(r.supply_amount)}</td><td className="is-num">{won(r.vat_amount)}</td></> : null}
          <td className="is-num">{won(r.total_amount)}</td>
        </tr>)}</tbody>
      </table>
    </div> : null}
  </details>
}
