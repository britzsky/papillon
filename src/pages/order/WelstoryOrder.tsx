import { useEffect, useMemo, useState } from 'react'
import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import { getAllItemPrice, getOrderList, getRealtimeItem, getReceiveDetail, getSituationDetail, getSoldToList, transactOrder, type ApiRecord, type CartLine, type Product, type Workplace } from '../../api/welstory'
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
  const now = new Date()
  const [tab, setTab] = useState<Tab>('products')
  const [workplaces, setWorkplaces] = useState<Workplace[]>([DEFAULT_WORKPLACE])
  const [soldTo, setSoldTo] = useState(DEFAULT_WORKPLACE.soldTo)
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [records, setRecords] = useState<ApiRecord[]>([])
  const [result, setResult] = useState<{ resCd: string; resMsg: string; items: ApiRecord[] } | null>(null)
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
  const saveSoldTo = (value: string) => { setSoldTo(value); localStorage.setItem('welstory_sold_to', value); setProducts([]); setCart([]); setRecords([]) }

  const loadProducts = async () => {
    if (!soldTo) return setMessage('사업장을 선택해 주세요.')
    setBusy(true); setMessage(''); setResult(null)
    try { setProducts(await getAllItemPrice(soldTo, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'))) }
    catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) }
  }
  const addCart = (product: Product) => setCart((current) => current.some((line) => line.itemCode === product.itemCode) ? current : [...current, { ...product, quantity: Math.max(product.minQntty, product.orderIncrs, 1), status: 'N' }])
  const setQuantity = (itemCode: string, quantity: number) => setCart((current) => current.map((line) => line.itemCode === itemCode ? { ...line, quantity, status: line.clientOrdItem ? 'U' : 'N' } : line))
  const removeLine = (itemCode: string) => setCart((current) => current.flatMap((line) => line.itemCode !== itemCode ? [line] : line.clientOrdItem ? [{ ...line, status: 'D' as const }] : []))

  const submit = async () => {
    if (!soldTo || cart.length === 0) return setMessage('사업장과 주문 품목을 확인해 주세요.')
    setBusy(true); setMessage(''); setResult(null)
    try {
      const verified: CartLine[] = []
      for (const line of cart.filter((item) => item.status !== 'D')) {
        const latest = await getRealtimeItem(soldTo, line.itemCode, compact(deliveryDate))
        if (!latest) throw new Error(`${line.itemCode}: 실시간 품목 정보를 확인할 수 없습니다.`)
        if (latest.stopType && !['', 'NORMAL'].includes(latest.stopType.toUpperCase())) throw new Error(`${latest.itemName || line.itemCode}: 주문 중지(${latest.stopType}) 품목입니다.`)
        const minimum = Math.max(latest.minQntty, 1), increment = Math.max(latest.orderIncrs, 1)
        if (line.quantity < minimum || (line.quantity - minimum) % increment !== 0) throw new Error(`${latest.itemName || line.itemCode}: 최소 ${minimum}, 증가량 ${increment}을 확인해 주세요.`)
        verified.push({ ...line, ...latest, quantity: line.quantity })
      }
      const seq = String(Date.now()).slice(-2)
      const clientOrd = `7${compact(deliveryDate).slice(2)}${soldTo}${seq}`
      const response = await transactOrder({ clientOrd, soldTo, reqDeliveryDate: compact(deliveryDate), ordStatus: cart.some((line) => line.clientOrdItem) ? 'U' : 'N', clientNote: '' }, [...verified, ...cart.filter((item) => item.status === 'D')])
      setResult(response)
      setRecords(await getOrderList(soldTo, compact(deliveryDate), clientOrd))
      setTab('orders')
    } catch (error) { setMessage(errorMessage(error)) } finally { setBusy(false) }
  }

  const loadRecords = async (nextTab: Tab) => {
    if (!soldTo) return setMessage('사업장을 선택해 주세요.')
    setBusy(true); setMessage(''); setTab(nextTab)
    try {
      const date = compact(deliveryDate)
      setRecords(nextTab === 'orders' ? await getOrderList(soldTo, date) : nextTab === 'receives' ? await getReceiveDetail(soldTo, date) : await getSituationDetail(soldTo, date, date))
    } catch (error) { setRecords([]); setMessage(errorMessage(error)) } finally { setBusy(false) }
  }

  return <div className="welstory-page"><SideMenuLayout header={<HeaderBar title="Welstory 발주" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '발주 관리', to: '/order_manager' }, { label: 'Welstory 연계' }]} />}>
    <section className="welstory-toolbar">
      <label>사업장<select value={soldTo} onChange={(event) => saveSoldTo(event.target.value)}><option value="">선택</option>{workplaces.map((item) => <option key={item.soldTo} value={item.soldTo}>{item.soldTo}({item.soldToNm || '사업장명 없음'})</option>)}</select></label>
      <label>입고일<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
      <span>{selectedWorkplace?.payerNm}</span>
      <button onClick={loadProducts} disabled={busy}>전체 판가 조회</button>
    </section>
    <nav className="welstory-tabs">
      <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>상품·검색</button>
      <button className={tab === 'orders' ? 'active' : ''} onClick={() => loadRecords('orders')}>주문 내역</button>
      <button className={tab === 'receives' ? 'active' : ''} onClick={() => loadRecords('receives')}>입고 내역</button>
      <button className={tab === 'situations' ? 'active' : ''} onClick={() => loadRecords('situations')}>반품·교환</button>
    </nav>
    {message && <p className="welstory-message" role="alert">{message}</p>}
    {tab === 'products' ? <div className="welstory-grid">
      <section className="welstory-panel"><div className="welstory-panel__head"><h2>상품 목록</h2><input placeholder="품목코드·품명·규격 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="welstory-table-wrap"><table><thead><tr><th>품목코드</th><th>품명</th><th>규격</th><th>단위</th><th>가격</th><th>STOP</th><th /></tr></thead><tbody>{filtered.map((item) => <tr key={item.itemCode}><td>{item.itemCode}</td><td>{item.itemName}</td><td>{item.standard}</td><td>{item.unit}</td><td>{money(item.price)}</td><td>{item.stopType || '정상'}</td><td><button onClick={() => addCart(item)}>담기</button></td></tr>)}</tbody></table></div>
      </section>
      <section className="welstory-panel"><div className="welstory-panel__head"><h2>주문 품목 ({cart.filter((i) => i.status !== 'D').length})</h2></div>
        <div className="welstory-table-wrap"><table><thead><tr><th>품목</th><th>수량</th><th>상태</th><th /></tr></thead><tbody>{cart.map((line) => <tr key={line.itemCode} className={line.status === 'D' ? 'deleted' : ''}><td>{line.itemName || line.itemCode}<small>{line.itemCode}</small></td><td><input type="number" min={line.minQntty || 1} step={line.orderIncrs || 1} value={line.quantity} disabled={line.status === 'D'} onChange={(event) => setQuantity(line.itemCode, Number(event.target.value))} /></td><td>{line.status}</td><td><button onClick={() => removeLine(line.itemCode)}>삭제</button></td></tr>)}</tbody></table></div>
        <footer><button className="primary" onClick={submit} disabled={busy || cart.length === 0}>{busy ? '검증·처리 중…' : '실시간 검증 후 주문'}</button></footer>
      </section>
    </div> : <section className="welstory-panel records"><div className="welstory-panel__head"><h2>{tab === 'orders' ? '주문 내역' : tab === 'receives' ? '입고 내역' : '반품·교환 내역'}</h2><span>{records.length}건</span></div><div className="record-cards">{records.map((row, index) => <article key={index}><div>{Object.entries(row).slice(0, 12).map(([key, value]) => <span key={key}><small>{key}</small><strong>{text(value)}</strong></span>)}</div>{tab === 'orders' && text(row.confirmYn) === 'Y' ? <em>확정됨 · 수정/삭제 불가</em> : null}</article>)}</div></section>}
    {result && <section className={`welstory-result ${result.resCd === 'S0000' ? 'success' : 'error'}`}><h3>주문 결과: {result.resCd}</h3><p>{result.resMsg}</p>{result.items.map((item, index) => <p key={index}>{text(item.itemCode)} / {text(item.resCd)} {text(item.errorMsg)}</p>)}</section>}
  </SideMenuLayout></div>
}
export default WelstoryOrder
