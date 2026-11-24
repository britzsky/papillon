import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import TopMenuLayout from '../../components/TopMenuLayout'
import { workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { getAccountIngredients, type AccountIngredient } from '../../api/accountMenuRegistration'
import {
  getImportJob, getImportJobs, getIngredientPriceLines, getIngredientPrices, getInventorySetting, getPurchasedProducts, jobActive,
  linkProduct, saveInventorySetting, startImport, stopImport,
  type ImportJob, type IngredientPrice, type Period, type PriceLine, type ProductList, type PurchasedProduct,
} from '../../api/purchaseHistory'
import { confirmDialog } from '../../utils/dialog'
import './InitialSetup.css'

const SUPPLIERS = [['', '전체'], ['WELSTORY', '웰스토리'], ['OURHOME', '아워홈']] as const
const STATUS_LABEL: Record<ImportJob['status'], string> = {
  QUEUED: '대기 중', RUNNING: '가져오는 중', DONE: '완료', DONE_WITH_ERRORS: '완료(일부 실패)', STOPPED: '멈춤', FAILED: '실패',
}
const RECEIPT_STATUS: Record<string, string> = { HISTORY: '구매 이력', UNMATCHED: '직접 구매', RECEIVED: '발주 입고' }

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d) }
const fmt = (value: number | null | undefined, digits = 0) =>
  value == null || Number.isNaN(value) ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits: digits })
const won = (value: number | null | undefined) => (value == null ? '-' : `${fmt(value)}원`)
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)
const ingredientLabel = (i: AccountIngredient) => `${i.ingredient_name} (${i.base_unit}) · ${i.ingredient_id}`
const spec = (p: PurchasedProduct) => p.product_base_qty > 0 ? `${fmt(p.product_base_qty, 3)}${p.product_base_unit}/${p.order_unit}` : `${p.order_unit} (규격 미확인)`

/**
 * 고객사 초기 세팅(본사 전용, 2026-11-19). 웰스토리·아워홈 구매 이력을 API로 가져와(재고에는 넣지 않음)
 * 산 상품을 거래처 식재료에 연결하고, 식재료별 실제 구매 단가를 본다. 연결한 상품이 식단 원가의 판가 기준 상품이 된다.
 */
export default function InitialSetup() {
  const [params] = useSearchParams()
  const accountId = workspaceAccountId(params)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const notify = useCallback((text: string, isError = false) => { setMessage(text); setFailed(isError) }, [])

  // 재고 시작일
  const [startDate, setStartDate] = useState('')
  const [savedStart, setSavedStart] = useState<string | null>(null)
  const [savingStart, setSavingStart] = useState(false)

  // 가져오기
  const [from, setFrom] = useState('2026-09-01')
  const [to, setTo] = useState(daysAgo(1))
  const [supplier, setSupplier] = useState('')
  const [job, setJob] = useState<ImportJob | null>(null)
  const [starting, setStarting] = useState(false)

  // 조회
  const [tab, setTab] = useState<'products' | 'prices'>('products')
  const [period, setPeriod] = useState<Period>({})
  const [unlinkedOnly, setUnlinkedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<ProductList | null>(null)
  const [prices, setPrices] = useState<IngredientPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [ingredients, setIngredients] = useState<AccountIngredient[]>([])

  useEffect(() => {
    if (!accountId) return
    let alive = true
    setMessage('')
    Promise.all([getInventorySetting(accountId), getImportJobs(accountId), getAccountIngredients(accountId).catch(() => [])])
      .then(([setting, jobs, list]) => {
        if (!alive) return
        setSavedStart(setting.inventory_start_date)
        setStartDate(setting.inventory_start_date ?? '')
        setJob(jobs[0] ?? null)
        setIngredients(list)
      })
      .catch(error => { if (alive) notify(errorText(error, '설정을 불러오지 못했습니다.'), true) })
    return () => { alive = false }
  }, [accountId, notify])

  useEffect(() => {
    if (!accountId) return
    let alive = true
    setLoading(true)
    Promise.all([getPurchasedProducts(accountId, period, unlinkedOnly), getIngredientPrices(accountId, period)])
      .then(([list, priceList]) => { if (alive) { setProducts(list); setPrices(priceList.ingredients) } })
      .catch(error => { if (alive) notify(errorText(error, '구매 이력을 불러오지 못했습니다.'), true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [accountId, period, unlinkedOnly, revision, notify])

  // 진행 중인 가져오기는 2초마다 다시 본다. 끝나면 목록을 새로 읽는다.
  const runningJobId = jobActive(job) ? job!.job_id : ''
  useEffect(() => {
    if (!runningJobId) return
    const timer = window.setInterval(() => {
      getImportJob(runningJobId).then(next => {
        setJob(next)
        if (!jobActive(next)) {
          setRevision(value => value + 1)
          notify(`가져오기 ${STATUS_LABEL[next.status]}: ${fmt(next.saved_line_count)}줄 저장${next.failure_count ? `, 실패 ${next.failure_count}건` : ''}`, next.status === 'FAILED')
        }
      }).catch(error => notify(errorText(error, '진행 상황을 불러오지 못했습니다.'), true))
    }, 2000)
    return () => window.clearInterval(timer)
  }, [runningJobId, notify])

  const saveStart = async (value: string) => {
    if (savedStart && value !== savedStart && !(await confirmDialog(`재고 시작일을 ${value || '미정'}(으)로 바꾸면 이미 가져온 구매 이력도 새 날짜 기준으로 다시 나눕니다. 바꿀까요?`))) return
    setSavingStart(true)
    try {
      const result = await saveInventorySetting(accountId, value)
      setSavedStart(result.inventory_start_date)
      setStartDate(result.inventory_start_date ?? '')
      notify(`재고 시작일을 ${result.inventory_start_date ?? '미정'}(으)로 저장했습니다.${result.reclassified_receipt_count ? ` 가져온 입고 ${fmt(result.reclassified_receipt_count)}건을 다시 나눴습니다.` : ''}`)
      setRevision(v => v + 1)
    } catch (error) { notify(errorText(error, '재고 시작일을 저장하지 못했습니다.'), true) }
    finally { setSavingStart(false) }
  }

  const begin = async () => {
    if (!from || !to || from > to) { notify('가져올 기간을 확인해 주세요.', true); return }
    setStarting(true)
    try {
      const started = await startImport(accountId, from, to, supplier)
      setJob(started)
      notify(`${from} ~ ${to} 구매 이력을 가져오기 시작했습니다. 이 화면을 떠나도 서버에서 계속 진행됩니다.`)
    } catch (error) { notify(errorText(error, '구매 이력 가져오기를 시작하지 못했습니다.'), true) }
    finally { setStarting(false) }
  }

  const halt = async () => {
    if (!job) return
    try { setJob(await stopImport(job.job_id)); notify('멈추라고 요청했습니다. 지금 받는 날짜까지 저장하고 멈춥니다.') }
    catch (error) { notify(errorText(error, '가져오기를 멈추지 못했습니다.'), true) }
  }

  const shownProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = products?.products ?? []
    return q ? rows.filter(p => `${p.product_name} ${p.supplier_item_code} ${p.ingredient_name ?? ''}`.toLowerCase().includes(q)) : rows
  }, [products, search])
  const shownPrices = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? prices.filter(p => `${p.ingredient_name ?? ''} ${p.ingredient_id}`.toLowerCase().includes(q)) : prices
  }, [prices, search])

  const unlinkedCount = (products?.products ?? []).filter(p => p.unlinked_line_count > 0).length
  const variedCount = prices.filter(p => p.price_varies === 'Y').length
  const progress = job && job.total_steps > 0 ? Math.round(job.done_steps / job.total_steps * 100) : 0

  return <div className="initial-setup-page"><TopMenuLayout title="고객사 초기 세팅">
    <div className="rd rd-page rd-setup">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-sr-only">고객사 초기 세팅</h1>
          <p className="rd-muted">웰스토리·아워홈에서 실제로 산 내역을 가져와 상품을 식재료에 연결하고 실제 구매 단가를 봅니다. 가져온 내역은 <strong>재고에 넣지 않습니다</strong> — 재고는 재고 시작일에 실사한 수량으로 시작합니다.</p>
        </div>
      </header>

      <div className="rd-page__tiles">
        <div className={`rd-card rd-page__tile${savedStart ? ' is-ok' : ' is-warn'}`}><span>재고 시작일</span><strong>{savedStart ?? '미정'}</strong><small>{savedStart ? '이날 전 입고 = 구매 이력' : '정하기 전엔 모두 구매 이력'}</small></div>
        <div className="rd-card rd-page__tile is-info"><span>산 상품</span><strong>{fmt(products?.product_count ?? 0)}</strong><small>A {products?.abc_counts.A ?? 0} · B {products?.abc_counts.B ?? 0} · C {products?.abc_counts.C ?? 0} · {won(products?.total_supply_amount ?? 0)}</small></div>
        <button type="button" className={`rd-card rd-page__tile${unlinkedCount ? ' is-warn' : ' is-ok'}${tab === 'products' && unlinkedOnly ? ' is-active' : ''}`} onClick={() => { setTab('products'); setUnlinkedOnly(true) }}><span>식재료 미연결 상품</span><strong>{fmt(unlinkedCount)}</strong><small>눌러서 미연결만 보기</small></button>
        <button type="button" className={`rd-card rd-page__tile${variedCount ? ' is-warn' : ' is-ok'}${tab === 'prices' ? ' is-active' : ''}`} onClick={() => setTab('prices')}><span>단가 차이 큰 식재료</span><strong>{fmt(variedCount)}</strong><small>최저·최고 차이 30% 이상</small></button>
      </div>

      {message ? <p className={`setup__msg${failed ? ' is-error' : ''}`} role="status">{message}</p> : null}

      <div className="setup__top">
        <section className="rd-card rd-page__box setup__card">
          <h2 className="rd-h2">재고 시작일</h2>
          <p className="rd-muted rd-fs-sm">이날 실사한 수량을 기초재고로 넣습니다. 이날 전 입고는 구매 이력, 이날부터 우리 발주서 없이 들어온 입고는 '직접 구매'로 나뉩니다.</p>
          <div className="setup__row">
            <input className="rd-input" type="date" aria-label="재고 시작일" value={startDate} disabled={savingStart} onChange={event => setStartDate(event.target.value)} />
            <button type="button" className="rd-btn is-primary" disabled={savingStart || startDate === (savedStart ?? '')} onClick={() => void saveStart(startDate)}>저장</button>
            {savedStart ? <button type="button" className="rd-btn" disabled={savingStart} onClick={() => void saveStart('')}>미정으로</button> : null}
          </div>
        </section>

        <section className="rd-card rd-page__box setup__card">
          <h2 className="rd-h2">구매 이력 가져오기</h2>
          <p className="rd-muted rd-fs-sm">연결된 공급사 사업장마다 하루씩 조회합니다(사업장 1곳 × 80일이면 몇 분). 같은 기간을 다시 가져와도 중복되지 않고 공급사 값으로 고쳐집니다.</p>
          <div className="setup__row">
            <input className="rd-input" type="date" aria-label="가져올 시작일" value={from} max={to} disabled={jobActive(job)} onChange={event => setFrom(event.target.value)} />
            <span>~</span>
            <input className="rd-input" type="date" aria-label="가져올 끝일" value={to} min={from} max={daysAgo(0)} disabled={jobActive(job)} onChange={event => setTo(event.target.value)} />
            <select className="rd-input" aria-label="공급사" value={supplier} disabled={jobActive(job)} onChange={event => setSupplier(event.target.value)}>
              {SUPPLIERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {jobActive(job)
              ? <button type="button" className="rd-btn" onClick={() => void halt()}>멈춤</button>
              : <button type="button" className="rd-btn is-primary" disabled={starting} onClick={() => void begin()}>가져오기</button>}
          </div>
          {job ? <div className="setup__job">
            <div className="setup__job-head">
              <span className={`rd-chip ${job.status === 'FAILED' ? 'is-urgent' : job.status === 'DONE' ? 'is-done' : jobActive(job) ? 'is-info' : 'is-warn'}`}>{STATUS_LABEL[job.status]}</span>
              <span>{job.from_date} ~ {job.to_date} · 사업장 {job.site_count}곳</span>
              {job.current ? <span className="rd-muted">· {job.current}</span> : null}
            </div>
            <div className="setup__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="가져오기 진행률"><span style={{ width: `${progress}%` }} /></div>
            <p className="rd-fs-sm">{fmt(job.done_steps)} / {fmt(job.total_steps)}일 · 저장 {fmt(job.saved_line_count)}줄 · 우리 발주서 주문 {fmt(job.skipped_order_line_count)}줄(입고 대신 청구 대조{job.checked_order_item_count ? ` ${fmt(job.checked_order_item_count)}품목` : ''}{job.amount_diff_item_count ? `, 차이 ${fmt(job.amount_diff_item_count)}` : ''}) ·새 상품 {fmt(job.created_product_count)}개 · 기존 연결 자동 적용 {fmt(job.auto_linked_line_count)}줄</p>
            {job.failures.length ? <details className="setup__failures"><summary>실패 {fmt(job.failure_count)}건 보기</summary><ul>
              {job.failures.map((f, index) => <li key={index}>{[f.supplier_code, f.site_code, f.date].filter(Boolean).join(' · ')} — {f.message}</li>)}
            </ul></details> : null}
          </div> : null}
        </section>
      </div>

      <section className="rd-card rd-page__main setup__main">
        <div className="setup__filters">
          <div className="rd-pills" role="tablist" aria-label="보기">
            <button type="button" role="tab" aria-selected={tab === 'products'} className={tab === 'products' ? 'is-active' : ''} onClick={() => setTab('products')}>산 상품 · 식재료 연결</button>
            <button type="button" role="tab" aria-selected={tab === 'prices'} className={tab === 'prices' ? 'is-active' : ''} onClick={() => setTab('prices')}>식재료별 단가</button>
          </div>
          <PeriodFilter period={period} onChange={setPeriod} />
          <input className="rd-input setup__search" type="search" aria-label="검색" placeholder={tab === 'products' ? '상품명·코드·식재료' : '식재료'} value={search} onChange={event => setSearch(event.target.value)} />
          {tab === 'products' ? <label className="setup__check"><input type="checkbox" checked={unlinkedOnly} onChange={event => setUnlinkedOnly(event.target.checked)} />미연결만</label> : null}
        </div>
        {loading ? <p className="rd-muted">불러오는 중…</p> : tab === 'products'
          ? <ProductTable accountId={accountId} rows={shownProducts} ingredients={ingredients} notify={notify} onLinked={() => setRevision(v => v + 1)} />
          : <PriceTable accountId={accountId} rows={shownPrices} period={period} notify={notify} />}
      </section>
    </div>
  </TopMenuLayout></div>
}

function PeriodFilter({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
  const [draft, setDraft] = useState<Period>(period)
  return <form className="setup__period" onSubmit={event => { event.preventDefault(); onChange({ ...draft }) }}>
    <input className="rd-input" type="date" aria-label="조회 시작일" value={draft.from_date ?? ''} onChange={event => setDraft(d => ({ ...d, from_date: event.target.value }))} />
    <span>~</span>
    <input className="rd-input" type="date" aria-label="조회 끝일" value={draft.to_date ?? ''} onChange={event => setDraft(d => ({ ...d, to_date: event.target.value }))} />
    <select className="rd-input" aria-label="조회 공급사" value={draft.supplier_code ?? ''} onChange={event => setDraft(d => ({ ...d, supplier_code: event.target.value }))}>
      {SUPPLIERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <button type="submit" className="rd-btn">조회</button>
  </form>
}

function ProductTable({ accountId, rows, ingredients, notify, onLinked }: {
  accountId: string; rows: PurchasedProduct[]; ingredients: AccountIngredient[]
  notify: (text: string, isError?: boolean) => void; onLinked: () => void
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [choice, setChoice] = useState('')
  const [perUnit, setPerUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const byLabel = useMemo(() => new Map(ingredients.map(i => [ingredientLabel(i), i])), [ingredients])
  const picked = byLabel.get(choice) ?? ingredients.find(i => i.ingredient_id === choice.trim())

  const open = (p: PurchasedProduct) => {
    const current = ingredients.find(i => i.ingredient_id === p.ingredient_id)
    setEditing(p.supplier_product_id); setChoice(current ? ingredientLabel(current) : ''); setPerUnit('')
  }
  const save = async (p: PurchasedProduct, ingredientId: string) => {
    setSaving(true)
    try {
      const result = await linkProduct(accountId, p.supplier_product_id, ingredientId, perUnit.trim())
      notify(ingredientId
        ? `${p.product_name} → ${picked?.ingredient_name ?? ingredientId} 연결 (1${p.order_unit} = ${fmt(result.base_qty_per_order_unit, 3)}${result.base_unit}, ${fmt(result.updated_line_count)}줄)`
        : `${p.product_name} 연결을 풀었습니다.`)
      setEditing(null); onLinked()
    } catch (error) { notify(errorText(error, '식재료를 연결하지 못했습니다.'), true) }
    finally { setSaving(false) }
  }

  if (!rows.length) return <p className="rd-muted">가져온 구매 이력이 없습니다. 위에서 기간을 정해 가져오기를 실행하세요.</p>
  return <div className="rd-page__scroll setup__scroll" tabIndex={0} role="region" aria-label="산 상품 목록">
    <datalist id="setup-ingredients">{ingredients.map(i => <option key={i.ingredient_id} value={ingredientLabel(i)} />)}</datalist>
    <table className="rd-table setup__table">
      <thead><tr><th>등급</th><th>공급사</th><th>상품</th><th>규격</th><th className="is-num">입고일 수</th><th className="is-num">수량</th><th className="is-num">공급가액</th><th className="is-num">평균 단가</th><th>최근 입고</th><th>연결 식재료</th></tr></thead>
      <tbody>{rows.map(p => <tr key={p.supplier_product_id} className={p.unlinked_line_count > 0 ? 'is-unlinked' : ''}>
        <td><span className={`setup__abc is-${p.abc_class.toLowerCase()}`} title={`누적 ${fmt(p.cumulative_share_pct, 1)}%`}>{p.abc_class}</span></td>
        <td>{p.supplier_name}</td>
        <td><strong>{p.product_name}</strong><small className="rd-muted"> {p.supplier_item_code}</small></td>
        <td>{spec(p)}</td>
        <td className="is-num">{fmt(p.receipt_day_count)}</td>
        <td className="is-num">{fmt(p.total_received_qty, 3)}{p.order_unit}</td>
        <td className="is-num">{won(p.total_supply_amount)}<small className="rd-muted"> {fmt(p.amount_share_pct, 1)}%</small></td>
        <td className="is-num" title={p.min_unit_price != null && p.max_unit_price != null ? `최저 ${won(p.min_unit_price)} · 최고 ${won(p.max_unit_price)}` : undefined}>{won(p.avg_unit_price)}</td>
        <td>{p.last_receipt_date}</td>
        <td className="setup__link">{editing === p.supplier_product_id
          ? <div className="setup__link-edit">
            <input className="rd-input" list="setup-ingredients" aria-label={`${p.product_name} 식재료`} placeholder="식재료 이름으로 찾기" value={choice} disabled={saving} onChange={event => setChoice(event.target.value)} autoFocus />
            <input className="rd-input setup__per" inputMode="decimal" aria-label={`1${p.order_unit}당 식재료 수량`} placeholder={`1${p.order_unit}당 ${picked?.base_unit ?? '수량'}`} title="상품 규격으로 식재료 단위를 바꿀 수 없을 때만 입력" value={perUnit} disabled={saving} onChange={event => setPerUnit(event.target.value)} />
            <button type="button" className="rd-btn is-primary" disabled={saving || !picked} onClick={() => void save(p, picked!.ingredient_id)}>저장</button>
            {p.ingredient_ids ? <button type="button" className="rd-btn" disabled={saving} onClick={() => void save(p, '')}>해제</button> : null}
            <button type="button" className="rd-btn" disabled={saving} onClick={() => setEditing(null)}>취소</button>
          </div>
          : <button type="button" className={`rd-btn${p.ingredient_ids ? '' : ' is-primary'}`} onClick={() => open(p)}>
            {p.ingredient_name ? `${p.ingredient_name} (${p.ingredient_base_unit})` : p.ingredient_ids ? `여러 식재료: ${p.ingredient_ids}` : '연결'}
            {p.ingredient_ids && p.unlinked_line_count > 0 ? ` · 미연결 ${p.unlinked_line_count}줄` : ''}
          </button>}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function PriceTable({ accountId, rows, period, notify }: { accountId: string; rows: IngredientPrice[]; period: Period; notify: (text: string, isError?: boolean) => void }) {
  const [selected, setSelected] = useState<IngredientPrice | null>(null)
  const [lines, setLines] = useState<PriceLine[]>([])
  const [avg, setAvg] = useState(0)

  useEffect(() => {
    if (!selected) return
    let alive = true
    getIngredientPriceLines(accountId, selected.ingredient_id, period)
      .then(result => { if (alive) { setLines(result.lines); setAvg(result.weighted_unit_cost) } })
      .catch(error => { if (alive) notify(errorText(error, '입고 줄별 단가를 불러오지 못했습니다.'), true) })
    return () => { alive = false }
  }, [accountId, selected, period, notify])

  if (!rows.length) return <p className="rd-muted">식재료에 연결된 구매 이력이 없습니다. '산 상품 · 식재료 연결'에서 먼저 연결하세요.</p>
  return <div className="setup__prices">
    <div className="rd-page__scroll setup__scroll" tabIndex={0} role="region" aria-label="식재료별 단가">
      <table className="rd-table setup__table">
        <thead><tr><th>식재료</th><th className="is-num">상품 수</th><th className="is-num">입고 줄</th><th className="is-num">구매량</th><th className="is-num">공급가액</th><th className="is-num">가중평균 단가</th><th className="is-num">최저</th><th className="is-num">최고</th><th>차이</th><th>최근 입고</th></tr></thead>
        <tbody>{rows.map(p => <tr key={`${p.ingredient_id}-${p.base_unit}`} className={`is-clickable${selected?.ingredient_id === p.ingredient_id ? ' is-selected' : ''}`} onClick={() => setSelected(p)}>
          <td><strong>{p.ingredient_name ?? p.ingredient_id}</strong><small className="rd-muted"> {p.ingredient_id}</small></td>
          <td className="is-num">{fmt(p.product_count)}</td>
          <td className="is-num">{fmt(p.line_count)}</td>
          <td className="is-num">{fmt(p.total_base_qty, 1)}{p.base_unit}</td>
          <td className="is-num">{won(p.total_supply_amount)}</td>
          <td className="is-num"><strong>{fmt(p.weighted_unit_cost, 2)}</strong>원/{p.base_unit}</td>
          <td className="is-num">{fmt(p.min_unit_cost, 2)}</td>
          <td className="is-num">{fmt(p.max_unit_cost, 2)}</td>
          <td>{p.price_varies === 'Y' ? <span className="rd-chip is-warn">{fmt(p.spread_pct, 1)}%</span> : <span className="rd-muted">{fmt(p.spread_pct, 1)}%</span>}</td>
          <td>{p.last_receipt_date}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {selected ? <div className="setup__lines">
      <h3 className="rd-h2">{selected.ingredient_name ?? selected.ingredient_id} 입고 줄별 단가 <small className="rd-muted">가중평균 {fmt(avg, 2)}원/{selected.base_unit} · 공급가액(부가세 제외) ÷ 기준수량</small></h3>
      <div className="rd-page__scroll setup__scroll" tabIndex={0} role="region" aria-label="입고 줄별 단가">
        <table className="rd-table setup__table">
          <thead><tr><th>입고일</th><th>구분</th><th>공급사</th><th>상품</th><th className="is-num">수량</th><th className="is-num">공급가액</th><th className="is-num">기준수량</th><th className="is-num">단가</th><th className="is-num">평균 대비</th></tr></thead>
          <tbody>{lines.map(l => <tr key={l.goods_receipt_item_id}>
            <td>{l.receipt_date}</td>
            <td>{RECEIPT_STATUS[l.receipt_status] ?? l.receipt_status}</td>
            <td>{l.supplier_name}</td>
            <td>{l.product_name}<small className="rd-muted"> {l.supplier_item_code}</small></td>
            <td className="is-num">{fmt(l.received_qty, 3)}{l.order_unit}</td>
            <td className="is-num">{won(l.supply_amount)}</td>
            <td className="is-num">{fmt(l.base_received_qty, 1)}{l.base_unit}</td>
            <td className="is-num">{fmt(l.unit_cost, 2)}</td>
            <td className="is-num">{l.deviation_pct == null ? '-' : <span className={l.price_outlier === 'Y' ? 'rd-chip is-warn' : ''}>{l.deviation_pct > 0 ? '+' : ''}{fmt(l.deviation_pct, 1)}%</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div> : <p className="rd-muted rd-fs-sm">식재료를 누르면 입고 줄별 단가를 봅니다.</p>}
  </div>
}
