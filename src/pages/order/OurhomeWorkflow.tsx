import OurhomeProductPhotos from './OurhomeProductPhotos'
import { buildApiUrl } from '../../config/api'
import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import LoadingScreen from '../../components/LoadingScreen'
import { getOurhomeProducts, getOurhomeOrders, type OurhomeProduct, type OurhomeProducts, type OurhomeOrders } from '../../api/ourhome'

type Props = { accountId: string; siteCode: string; siteName: string; deliveryDates: string[]; disabled: boolean }
const money = (value: string) => value.trim() && Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('ko-KR')}원` : '미제공'
/** 아워홈 마감정보(orderdtInfo "D-2 / 15:00", "D2")를 D-N 표기로, 마감시간(HHMM)을 HH:MM으로 */
const dDay = (value: string) => value.trim() ? value.trim().replace(/^D\s*-?\s*(\d+)/i, 'D-$1') : '-'
const hhmm = (value: string) => /^\d{4}$/.test(value.trim()) ? `${value.trim().slice(0, 2)}:${value.trim().slice(2)}` : value
const flag = (value: string) => value === 'Y' ? '예' : value === 'N' ? '아니오' : value || '미제공'

export default function OurhomeWorkflow({ accountId, siteCode, siteName, deliveryDates, disabled }: Props) {
  const [tab, setTab] = useState<'products' | 'orders' | 'integration'>('products')
  const [date, setDate] = useState(deliveryDates[0] || '')
  const [orderDate, setOrderDate] = useState(deliveryDates[0] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }))
  const [keyword, setKeyword] = useState('')
  const [searchType, setSearchType] = useState('A')
  const [products, setProducts] = useState<OurhomeProducts | null>(null)
  const [orders, setOrders] = useState<OurhomeOrders | null>(null)
  const [selected, setSelected] = useState<OurhomeProduct | null>(null)
  const [cursors, setCursors] = useState<string[]>([''])
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const version = useRef(0)
  useEffect(() => () => { request.current?.abort(); version.current++ }, [])

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const syncingRef = useRef(false)
  const syncCatalog = async () => {
    if (!accountId || !date || syncingRef.current) return
    syncingRef.current = true; setSyncing(true); setSyncMessage('')
    try {
      const response = await fetch(buildApiUrl('/v2/supplier-integration/ourhome/sync-catalog'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: accountId, siteCode, deliveryDate: date, user_id: localStorage.getItem('user_id') || '' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '상품 저장 실패')
      setSyncMessage(siteName + ' · ' + date + ' 상품 ' + data.products + '건 저장 완료')
    } catch (e) { setSyncMessage(e instanceof Error ? e.message : '상품 저장 실패') }
    finally { syncingRef.current = false; setSyncing(false) }
  }
  const cancel = () => {
    request.current?.abort(); request.current = null; version.current++
    setBusy(false); setError('')
  }
  const reset = () => {
    request.current?.abort(); request.current = null; version.current++
    setBusy(false); setError(''); setProducts(null); setSelected(null); setPage(0); setCursors([''])
  }
  const loadProducts = async (index = 0, cursor = '') => {
    if (!date || disabled || request.current) return
    const controller = new AbortController(); request.current = controller
    const id = ++version.current
    setBusy(true); setError('')
    try {
      const result = await getOurhomeProducts({ siteCode, deliveryDate: date, keyword: keyword.trim(), searchType, nextKey: cursor }, controller.signal)
      if (id !== version.current) return
      if (result.siteCode !== siteCode || result.deliveryDate !== date) throw new Error('조회 조건과 상품 응답이 다릅니다. 다시 조회해 주세요.')
      if (result.hasNext && (!result.nextKey || cursors.slice(0, index + 1).includes(result.nextKey))) throw new Error('다음 페이지 정보가 반복됩니다. 처음부터 다시 조회해 주세요.')
      setProducts(result); setSelected(null); setPage(index)
      setCursors(previous => [...previous.slice(0, index), cursor, ...(result.hasNext ? [result.nextKey] : [])])
    } catch (reason) {
      if (id === version.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '상품 조회에 실패했습니다.')
    } finally { if (id === version.current) { setBusy(false); request.current = null } }
  }
  const loadOrders = async () => {
    if (!orderDate || disabled || request.current) return
    const controller = new AbortController(); request.current = controller
    const id = ++version.current
    setBusy(true); setError('')
    try {
      const result = await getOurhomeOrders(siteCode, orderDate, controller.signal)
      if (id === version.current) setOrders(result)
    } catch (reason) {
      if (id === version.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '주문·입고 조회에 실패했습니다.')
    } finally { if (id === version.current) { setBusy(false); request.current = null } }
  }
  return <div className="ourhome-workflow" aria-busy={busy}>
    {syncing ? <LoadingScreen overlay message={siteName + ' · ' + date + ' 아워홈 전체 상품을 저장하고 있습니다. 상품이 많아 몇 분 걸릴 수 있습니다.'} /> : null}
    {busy ? <LoadingScreen compact message="아워홈에서 조회하고 있습니다." /> : null}
    <nav className="supplier-switch supplier-task-switch" aria-label="아워홈 업무 선택">{([['products', '상품·판가'], ['orders', '주문·입고'], ['integration', '연동 관리']] as const).map(([value, label]) =>
      <button type="button" key={value} aria-pressed={tab === value} onClick={() => { cancel(); setTab(value) }}>{label}</button>)}</nav>
    {disabled && <p role="status">사업장 목록을 다시 조회한 후 계속해 주세요.</p>}
    {tab === 'integration' ? <>
      <div className="supplier-integration-toolbar">
        <label>납품일<select aria-label="아워홈 저장 납품일" value={date} disabled={disabled || syncing} onChange={event => { reset(); setDate(event.target.value) }}><option value="">선택</option>{deliveryDates.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" disabled={busy || syncing || disabled || !date || !accountId} onClick={() => void syncCatalog()}>{syncing ? '전체 상품 저장 중…' : '이 사업장 연결·상품 저장'}</button>
        <p>선택 납품일의 아워홈 전체 상품·판가를 이 거래처로 저장합니다(검색어·페이지와 무관). 발주 화면에서 납품일을 고르면 자동으로도 준비되며, 결과는 위 '동기화 상태'에 쌓입니다. <Link to={'/order_manager/product-order?account_id=' + encodeURIComponent(accountId)}>통합 상품발주로 이동</Link></p>
      </div>
      {syncMessage && <div role="status" className="supplier-integration-message">{syncMessage}</div>}
    </> : tab === 'products' ? <>
      <div className="supplier-integration-toolbar">
        <label>납품일<select aria-label="아워홈 납품일" value={date} disabled={disabled || syncing} onChange={event => { reset(); setDate(event.target.value) }}><option value="">선택</option>{deliveryDates.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>검색 구분<select value={searchType} onChange={event => { reset(); setSearchType(event.target.value) }}><option value="A">전체</option><option value="N">상품명</option><option value="G">상품코드</option></select></label>
        <label>상품 검색<input aria-label="아워홈 상품 검색" maxLength={100} value={keyword} onChange={event => { reset(); setKeyword(event.target.value) }} placeholder="검색어 없이 전체 조회" /></label>
        <button type="button" disabled={busy || disabled || !date} onClick={() => void loadProducts()}>{busy ? '조회 중…' : '상품·판가 조회'}</button>
      </div>
      {!deliveryDates.length && <p>제공된 발주 가능일이 없어 상품을 조회할 수 없습니다.</p>}
      {products && <>
        <p role="status">{siteName} · 납품일 {products.deliveryDate} · 전체 {products.totalRow.toLocaleString()}건 · {page + 1}페이지 {products.products.length}건</p>
        <div className="ourhome-products-scroll ourhome-products-scroll--single-line"><table><thead><tr><th>상품명 / 코드</th><th>규격 / 원산지</th><th>판매단가</th><th>발주단위</th><th>상품상태 (익일 기준)</th><th>마감정보</th></tr></thead><tbody>{products.products.map((product, index) => <tr key={`${product.goodcd}-${index}`}>
          <td><button type="button" aria-pressed={selected === product} onClick={() => setSelected(product)}>{product.goodnm || product.goodcd}</button><small>{product.goodcd}</small></td>
          <td>{product.goodsz || '-'}<small>{product.originPlaceNm || '원산지 미제공'}</small></td><td>{money(product.salsUcost)}<small>{product.taxYn === 'Y' ? '과세' : product.taxYn === 'N' ? '면세' : '과세정보 미제공'}</small></td>
          <td>{product.odrUnit || '-'}</td><td>{product.goodStatusNm || product.goodStatus || '미제공'}</td><td>{dDay(product.orderdtInfo)}<small>{hhmm(product.ordTime)}</small></td>
        </tr>)}{!products.products.length && <tr><td colSpan={6}>해당 조건의 상품이 없습니다.</td></tr>}</tbody></table></div>
        <div className="ourhome-page-controls"><button disabled={busy || disabled || page === 0} onClick={() => void loadProducts(page - 1, cursors[page - 1])}>이전 페이지</button><span>{page + 1}페이지</span><button disabled={busy || disabled || !products.hasNext} onClick={() => void loadProducts(page + 1, products.nextKey)}>다음 페이지</button></div>
        <p>상품상태는 공급사 명세의 익일 기준입니다. 선택한 납품일의 최종 주문 가능 여부는 발주 접수 시 확인됩니다.</p>
      </>}
      {selected && <section className="ourhome-product-detail"><h3>{selected.goodnm} · 발주 조건</h3><OurhomeProductPhotos product={selected} /><dl className="supplier-site-facts">
        <div><dt>발주단위 / 환산중량</dt><dd>{selected.odrUnit || '-'} / {Number(selected.odrConvqty) > 0 ? `${Number(selected.odrConvqty).toLocaleString()} g` : '미제공'}</dd></div><div><dt>KG당 단가</dt><dd>{Number(selected.salsUcostKg) > 0 ? `${money(selected.salsUcostKg)} / kg` : '미제공'}</dd></div><div><dt>박스당 수량</dt><dd>{selected.boxInQty || '미제공'}</dd></div>
        <div><dt>소수점 발주 / 절상</dt><dd>{flag(selected.decOdrupYn)} / {flag(selected.odrupYn)} {selected.odrupYnDesc}</dd></div><div><dt>비정량 상품</dt><dd>{flag(selected.unquantityYn)}</dd></div>
        <div><dt>보관온도</dt><dd>{selected.keepTemp || '미제공'}</dd></div><div><dt>공급업체</dt><dd>{selected.vanNm || '미제공'}</dd></div>
      </dl><p>상품을 저장한 뒤 통합 상품발주에서 웰스토리 상품과 함께 선택할 수 있습니다. 발주서는 공급사별로 생성됩니다.</p></section>}
      {!products && !busy && <p>납품일을 선택하고 상품·판가를 조회하세요.</p>}
    </> : <>
      <div className="supplier-integration-toolbar"><label>조회 입고일<input aria-label="아워홈 조회 입고일" type="date" value={orderDate} onChange={event => { reset(); setOrders(null); setOrderDate(event.target.value) }} /></label><button type="button" disabled={busy || disabled || !orderDate} onClick={() => void loadOrders()}>{busy ? '조회 중…' : '주문·입고 조회'}</button></div>
      <p>공급사의 주문·출고 정보를 조회합니다. 출고완료는 수령 확정과 다르며, 재고는 자동 반영되지 않습니다.</p>
      {orders && <><p role="status">{siteName} · {orders.deliveryDate} · {orders.orders.length}건</p><div className="ourhome-products-scroll"><table><thead><tr><th>주문키 / 순번</th><th>상품</th><th>입고수량</th><th>평균단가 / 총액</th><th>마감 / 출고 / 삭제</th><th>원산지 / 소비기한</th></tr></thead><tbody>{orders.orders.map((order, i) => <tr key={`${order.ordKeyVal}-${order.ordSeq}-${order.foSeq}-${i}`}><td>{order.ordKeyVal}<small>{order.ordSeq} / {order.foSeq}</small></td><td>{order.goodnm}<small>{order.goodcd}</small></td><td>{order.clhaqty || '-'} {order.odrUnit}</td><td>{money(order.salsUcost)}<small>{money(order.salsAmt)}</small></td><td>{flag(order.ordStatYn)} / {flag(order.prcsStatYn)} / {flag(order.delYn)}</td><td>{order.originPlaceNm || '-'}<small>{order.expireInfo || '-'}</small></td></tr>)}{!orders.orders.length && <tr><td colSpan={6}>조회된 주문·입고 내역이 없습니다.</td></tr>}</tbody></table></div></>}
    </>}
    {error && <p role="alert" className="supplier-integration-error">{error}{(tab === 'products' ? products : orders) ? ' 표시된 목록은 이전 조회 결과입니다.' : ''}</p>}
  </div>
}
