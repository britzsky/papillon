import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import ProductImage from '../../components/ProductImage'
import { Link } from 'react-router-dom'
import { getAllItemPrice, getOrderList, getReceiveDetail, getSituationDetail, getSoldToList, type ApiRecord, type Product, type Workplace } from '../../api/welstory'
import './WelstoryOrder.css'

type Tab = 'products' | 'orders' | 'receives' | 'situations'
const text = (value: unknown) => value == null ? '' : String(value)
const compact = (value: string) => value.replaceAll('-', '')
const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number) => new Intl.NumberFormat('ko-KR').format(value)
const DEFAULT_WORKPLACE: Workplace = {
  soldTo: 'A0199183',
  soldToNm: '더채움',
  payerNm: '',
  pricingCode: '',
  repSoldtoYn: '',
}
const withDefaultWorkplace = (items: Workplace[]) =>
  items.some((item) => item.soldTo === DEFAULT_WORKPLACE.soldTo)
    ? items
    : [DEFAULT_WORKPLACE, ...items]
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.'

function WelstoryOrder() {
  const [tab, setTab] = useState<Tab>('products')
  const [workplaces, setWorkplaces] = useState<Workplace[]>([DEFAULT_WORKPLACE])
  const [soldTo, setSoldTo] = useState(DEFAULT_WORKPLACE.soldTo)
  const [periodYear, setPeriodYear] = useState(() => localStorage.getItem('welstory_period_year') || String(new Date().getFullYear()))
  const [periodGroup, setPeriodGroup] = useState(() => localStorage.getItem('welstory_period_group') || '')
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<ApiRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    getSoldToList(controller.signal).then((rows) => {
      setWorkplaces(withDefaultWorkplace(rows))
    }).catch((error) => setMessage(errorMessage(error))).finally(() => setBusy(false))
    return () => controller.abort()
  }, [])

  const selectedWorkplace = workplaces.find((item) => item.soldTo === soldTo)
  const filtered = useMemo(() => products.filter((item) => `${item.itemCode} ${item.itemName} ${item.standard}`.toLowerCase().includes(query.toLowerCase())), [products, query])
  const saveSoldTo = (value: string) => { setSoldTo(value); localStorage.setItem('welstory_sold_to', value); setProducts([]); setRecords([]) }

  const loadProducts = async () => {
    if (!soldTo) return setMessage('사업장을 선택해 주세요.')
    if (!/^\d{4}$/.test(periodYear)) return setMessage('판가 연도를 4자리로 입력해 주세요.')
    if (!/^\d{2}$/.test(periodGroup)) return setMessage('웰스토리 순기를 2자리로 입력해 주세요. 예: 12')
    setBusy(true); setMessage('')
    try {
      localStorage.setItem('welstory_period_year', periodYear)
      localStorage.setItem('welstory_period_group', periodGroup)
      setProducts(await getAllItemPrice(soldTo, periodYear, periodGroup))
    }
    catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) }
  }
  const loadRecords = async (nextTab: Tab) => {
    if (!soldTo) return setMessage('사업장을 선택해 주세요.')
    setBusy(true); setMessage(''); setTab(nextTab)
    try {
      const date = compact(deliveryDate)
      setRecords(nextTab === 'orders' ? await getOrderList(soldTo, date) : nextTab === 'receives' ? await getReceiveDetail(soldTo, date) : await getSituationDetail(soldTo, date, date))
    } catch (error) { setRecords([]); setMessage(errorMessage(error)) } finally { setBusy(false) }
  }

  return <div className="welstory-page procurement-refresh"><SideMenuLayout header={<HeaderBar title="웰스토리 원문 조회" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '공급사 통합 연동', to: '/order_manager/suppliers' }, { label: '웰스토리 원문 조회' }]} />}>
    <section className="procurement-page-heading"><span className="procurement-eyebrow">삼성웰스토리</span><h2>{tab === 'products' ? '상품 선택' : tab === 'orders' ? '주문 내역' : tab === 'receives' ? '입고 내역' : '반품·교환'}</h2><p>사업장별 공급상품을 확인하고 필요한 품목을 담으세요.</p></section>
    <section className="welstory-toolbar">
      <label>사업장<select className="workplace-select" value={soldTo} onChange={(event) => saveSoldTo(event.target.value)}><option value="">선택</option>{workplaces.map((item) => <option key={item.soldTo} value={item.soldTo}>{item.soldTo}({item.soldToNm || '사업장명 없음'})</option>)}</select></label>
      <label>판가 연도<input inputMode="numeric" maxLength={4} value={periodYear} onChange={(event) => setPeriodYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
      <label>순기<input inputMode="numeric" maxLength={2} placeholder="예: 12" value={periodGroup} onChange={(event) => setPeriodGroup(event.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
      <label>입고일<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
      <span>{selectedWorkplace?.payerNm}</span>
      <button className="action-query-button" onClick={loadProducts} disabled={busy}>전체 판가 조회</button>
    </section>
    <nav className="welstory-tabs">
      <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>상품·검색</button>
      <button className={tab === 'orders' ? 'active' : ''} onClick={() => loadRecords('orders')}>주문 내역</button>
      <button className={tab === 'receives' ? 'active' : ''} onClick={() => loadRecords('receives')}>입고 내역</button>
      <button className={tab === 'situations' ? 'active' : ''} onClick={() => loadRecords('situations')}>반품·교환</button>
    </nav>
    {message && <p className="welstory-message" role="alert">{message}</p>}
    {tab === 'products' ? <div className="welstory-grid">
      <section className="welstory-panel procurement-catalog"><div className="welstory-panel__head"><h2>상품 목록 <span className="procurement-count">{filtered.length}</span></h2><input aria-label="품목코드·품명·규격 검색" placeholder="품목코드·품명·규격 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="procurement-product-list" aria-label="공급상품 목록">{filtered.map(item => <article className="procurement-product" key={item.itemCode}>
          <ProductImage src={item.image_url} name={item.itemName || item.itemCode} />
          <div className="procurement-product__info"><h3>{item.itemName || item.itemCode}</h3><span className="procurement-product__supplier">삼성웰스토리</span><p>규격 {item.standard || '—'} · 단위 {item.unit || '—'}</p><small>품목코드 {item.itemCode} · 최소 {item.minQntty || 1} · 발주배수 {item.orderIncrs || 1}</small><span className={`workspace-status workspace-status--${!item.stopType || item.stopType === 'NORMAL' ? 'success' : 'warning'}`}>{item.stopType || '정상'}</span></div>
          <div className="procurement-product__action"><strong>{money(item.price)}원</strong><small>/{item.unit || '단위 확인'}</small></div>
        </article>)}{!filtered.length ? <p className="procurement-empty">{busy ? '상품을 불러오는 중입니다.' : products.length ? '검색어에 해당하는 상품이 없습니다.' : '사업장과 판가 연도·순기를 선택한 후 전체 판가를 조회해주세요.'}</p> : null}</div>
      </section>
      <section className="welstory-panel procurement-cart"><div className="welstory-panel__head"><h2>주문은 발주하기에서</h2></div>
        <p>이 화면은 웰스토리 원문 조회 전용입니다. 여기서 직접 주문하면 발주서·입고·재고·상품 연결에 남지 않아 중복 발주 위험이 있어 주문 전송을 막았습니다.</p>
        <p><Link to="/order_manager/order">발주하기로 이동</Link></p>
      </section>
    </div> : <section className="welstory-panel records"><div className="welstory-panel__head"><h2>{tab === 'orders' ? '주문 내역' : tab === 'receives' ? '입고 내역' : '반품·교환 내역'}</h2><span>{records.length}건</span></div><div className="record-cards">{records.map((row, index) => <article key={index}><div>{Object.entries(row).slice(0, 12).map(([key, value]) => <span key={key}><small>{key}</small><strong>{text(value)}</strong></span>)}</div>{tab === 'orders' && text(row.confirmYn) === 'Y' ? <em>확정됨 · 수정/삭제 불가</em> : null}</article>)}</div></section>}
  </SideMenuLayout></div>
}
export default WelstoryOrder
