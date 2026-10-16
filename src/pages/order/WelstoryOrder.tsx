import HeaderBar from '../../components/HeaderBar'
import SideMenuLayout from '../../components/SideMenuLayout'
import DeadlineAlertSlot from '../../components/DeadlineAlertSlot'
import ProductImage from '../../components/ProductImage'
import { Link } from 'react-router-dom'
import './WelstoryOrder.css'
import { useWelstoryRaw, text, money } from '../../features/order/useWelstoryRaw'

function WelstoryOrder() {
  const { tab, setTab, workplaces, soldTo, periodYear, setPeriodYear, periodGroup, setPeriodGroup, deliveryDate, setDeliveryDate, query, setQuery, products, records, busy, message, selectedWorkplace, filtered, saveSoldTo, loadProducts, loadRecords } = useWelstoryRaw()
  return <div className="welstory-page procurement-refresh"><SideMenuLayout header={<HeaderBar title="웰스토리 원문 조회" breadcrumbs={[{ label: 'Home', to: '/home' }, { label: '공급사 통합 연동', to: '/order_manager/suppliers' }, { label: '웰스토리 원문 조회' }]} />}>
    <div className="rd rd-page rd-wel">
    <header className="rd-page__head">
      <div>
        <span className="rd-supplier is-WELSTORY">삼성웰스토리</span>
        <h1 className="rd-sr-only">웰스토리 원문 조회</h1>
        <p className="rd-muted">웰스토리가 보내 준 상품·주문·입고·반품 원문을 그대로 봅니다. 주문은 발주하기에서 합니다.</p>
      </div>
      <DeadlineAlertSlot />
      <div className="rd-page__actions">
        <Link className="rd-btn" to="/order_manager/order">발주하기로 이동</Link>
      </div>
    </header>
    <section className="welstory-toolbar rd-card rd-page__filters">
      <label>사업장<select className="workplace-select" value={soldTo} onChange={(event) => saveSoldTo(event.target.value)}><option value="">선택</option>{workplaces.map((item) => <option key={item.soldTo} value={item.soldTo}>{item.soldTo}({item.soldToNm || '사업장명 없음'})</option>)}</select></label>
      <label>판가 연도<input inputMode="numeric" maxLength={4} value={periodYear} onChange={(event) => setPeriodYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
      <label>순기<input inputMode="numeric" maxLength={2} placeholder="예: 12" value={periodGroup} onChange={(event) => setPeriodGroup(event.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
      <label>입고일<input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
      <span>{selectedWorkplace?.payerNm}</span>
      <button type="button" className="rd-btn is-primary" onClick={loadProducts} disabled={busy}>전체 판가 조회</button>
    </section>
    <nav className="rd-pills" aria-label="원문 종류">
      <button type="button" className={tab === 'products' ? 'is-active' : ''} onClick={() => setTab('products')}>상품·검색</button>
      <button type="button" className={tab === 'orders' ? 'is-active' : ''} onClick={() => loadRecords('orders')}>주문 내역</button>
      <button type="button" className={tab === 'receives' ? 'is-active' : ''} onClick={() => loadRecords('receives')}>입고 내역</button>
      <button type="button" className={tab === 'situations' ? 'is-active' : ''} onClick={() => loadRecords('situations')}>반품·교환</button>
    </nav>
    {message && <p className="rd-page__notice is-warn" role="alert">{message}</p>}
    {tab === 'products' ? <div className="welstory-grid">
      <section className="welstory-panel procurement-catalog"><div className="welstory-panel__head"><h2>상품 목록 <span className="procurement-count">{filtered.length}</span></h2><input aria-label="품목코드·품명·규격 검색" placeholder="품목코드·품명·규격 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="procurement-product-list" aria-label="공급상품 목록">{filtered.map(item => <article className="procurement-product" key={item.itemCode}>
          <ProductImage src={item.image_url} name={item.itemName || item.itemCode} />
          <div className="procurement-product__info"><h3>{item.itemName || item.itemCode}</h3><span className="procurement-product__supplier">삼성웰스토리</span><p>규격 {item.standard || '—'} · 단위 {item.unit || '—'}</p><small>품목코드 {item.itemCode} · 최소 {item.minQntty || 1} · 발주배수 {item.orderIncrs || 1}</small><span className={`workspace-status workspace-status--${!item.stopType || item.stopType === 'NORMAL' ? 'success' : 'warning'}`}>{item.stopType || '정상'}</span></div>
          <div className="procurement-product__action"><strong>{money(item.price)}원</strong><small>/{item.unit || '단위 확인'}</small></div>
        </article>)}{!filtered.length ? <p className="procurement-empty">{busy ? '상품을 불러오는 중입니다.' : products.length ? '검색어에 해당하는 상품이 없습니다.' : '사업장과 판가 연도·순기를 선택한 후 전체 판가를 조회해주세요.'}</p> : null}</div>
      </section>
      <section className="rd-card rd-page__box rd-wel__note"><h2 className="rd-h2">주문은 발주하기에서</h2>
        <p className="rd-muted">이 화면은 웰스토리 원문 조회 전용입니다. 여기서 직접 주문하면 발주서·입고·재고·상품 연결에 남지 않아 중복 발주 위험이 있어 주문 전송을 막았습니다.</p>
        <Link className="rd-btn is-primary" to="/order_manager/order">발주하기로 이동</Link>
      </section>
    </div> : <section className="welstory-panel records"><div className="welstory-panel__head"><h2>{tab === 'orders' ? '주문 내역' : tab === 'receives' ? '입고 내역' : '반품·교환 내역'}</h2><span>{records.length}건</span></div><div className="record-cards">{records.map((row, index) => <article key={index}><div>{Object.entries(row).slice(0, 12).map(([key, value]) => <span key={key}><small>{key}</small><strong>{text(value)}</strong></span>)}</div>{tab === 'orders' && text(row.confirmYn) === 'Y' ? <em>확정됨 · 수정/삭제 불가</em> : null}</article>)}</div></section>}
    </div>
  </SideMenuLayout></div>
}
export default WelstoryOrder
