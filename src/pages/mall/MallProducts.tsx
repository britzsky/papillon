import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BUYER_LABEL, getMallContext, getMallProduct, getMallProducts, num, STORAGE_LABEL, text, won, type BuyerType, type MallContext, type Row } from '../../api/distShop'
import { addToCart, setCartBuyerType, useCart } from '../../features/mall/mallCart'
import MallLayout from './MallLayout'
import ProductInfoView from '../../features/dist/ProductInfoView'
import './Mall.css'

/**
 * 더채움몰 › 상품 보기(본사·현장 누구나, 2026-11-02). 구매 유형(거래처/개인)마다 가격이 다르다 — 고른 유형의 가격으로 보여 주고 담는다.
 * 장바구니는 이 브라우저에 보관, 주문 화면에서 서버가 금액을 다시 계산한다.
 * 2026-11-03 사용자 요청: 기획전 페이지처럼 — 큰 배너 → 혜택 띠 → 고정 탭(특가·카테고리) → 묶음별 상품. 검색(?q=)하면 검색 결과만.
 */
type Section = { key: string; title: string; note?: string; products: Row[] }

/** 행사가가 정상가보다 낮을 때만 할인율(%) — 정상가는 서버 regular_price(같은 구매 유형의 행사 아닌 가격) */
function discountRate(product: Row) {
  const price = Number(product.unit_price)
  const regular = Number(product.regular_price)
  if (product.price_type !== 'EVENT' || !regular || !(price < regular)) return 0
  return Math.floor((1 - price / regular) * 100)
}
const productName = (product: Row) => `${text(product.product_name)}${product.option_name ? ` ${text(product.option_name)}` : ''}`

export default function MallProducts() {
  const cart = useCart()
  const [params] = useSearchParams()
  const search = (params.get('q') ?? '').trim()
  const [context, setContext] = useState<MallContext | null>(null)
  const [buyerType, setBuyerType] = useState<BuyerType | ''>('')
  const [products, setProducts] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState('')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let alive = true
    getMallContext().then(result => {
      if (!alive) return
      setContext(result)
      const fromCart = cart.buyer_type && result.buyer_types.includes(cart.buyer_type) ? cart.buyer_type : ''
      setBuyerType(fromCart || result.buyer_types[0])
    }).catch(error => { if (alive) { setFailed(true); setMessage(error instanceof Error ? error.message : '더채움몰 정보를 불러오지 못했습니다.') } })
    return () => { alive = false }
    // 처음 한 번만(장바구니 유형은 시작값으로만 쓴다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 기획전은 전체 상품을 한 번에 받아 카테고리별로 묶는다(카테고리 탭 = 같은 화면 안 이동)
  useEffect(() => {
    if (!buyerType) return
    let alive = true
    getMallProducts(buyerType, '', search).then(result => { if (alive) { setProducts(result.products); setLoaded(true) } })
      .catch(error => { if (alive) { setFailed(true); setMessage(error instanceof Error ? error.message : '상품을 불러오지 못했습니다.') } })
    return () => { alive = false }
  }, [buyerType, search])

  // 담기 알림은 잠깐만
  useEffect(() => {
    if (!message || failed) return
    const timer = window.setTimeout(() => setMessage(''), 3500)
    return () => window.clearTimeout(timer)
  }, [message, failed])

  const sections = useMemo<Section[]>(() => {
    const deals = products.filter(product => product.price_type === 'EVENT' && product.orderable !== false)
    const result: Section[] = deals.length ? [{ key: 'deal', title: '오늘의 특가', note: '행사 기간에만 이 가격', products: deals }] : []
    // 상위 카테고리로 묶는다(하위 카테고리 상품은 부모 칸에)
    const categories = context?.categories ?? []
    const parentOf = new Map(categories.map(row => [text(row.category_id), text(row.parent_category_id) || text(row.category_id)]))
    const groups = new Map<string, Row[]>()
    for (const product of products) {
      const id = product.category_id ? parentOf.get(text(product.category_id)) ?? text(product.category_id) : ''
      groups.set(id, [...(groups.get(id) ?? []), product])
    }
    for (const row of categories.filter(row => !row.parent_category_id)) {
      const id = text(row.category_id)
      const items = groups.get(id)
      if (items?.length) result.push({ key: `cat-${id}`, title: text(row.category_name), products: items })
      groups.delete(id)
    }
    const rest = [...groups.values()].flat()
    if (rest.length) result.push({ key: 'etc', title: '그 밖의 상품', products: rest })
    return result
  }, [products, context])

  const deals = sections.find(section => section.key === 'deal')?.products ?? []
  const bestRate = Math.max(0, ...products.map(discountRate))
  const spotlight = (deals.length ? deals : products.filter(product => product.orderable !== false)).slice(0, 3)

  // 스크롤 위치에 맞춰 탭 표시(몰 화면은 .mall-site가 스크롤된다)
  useEffect(() => {
    if (search || !sections.length) return
    const root = document.querySelector('.mall-site')
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) setActiveTab((visible.target as HTMLElement).dataset.section ?? '')
    }, { root, rootMargin: '-80px 0px -60% 0px' })
    sections.forEach(section => { const node = sectionRefs.current[section.key]; if (node) observer.observe(node) })
    return () => observer.disconnect()
  }, [sections, search])

  const goTo = (key: string) => {
    setActiveTab(key)
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const chooseBuyer = (type: BuyerType) => { setBuyerType(type); if (cart.lines.length) setCartBuyerType(type) }
  const add = (product: Row) => {
    if (!buyerType) return
    const amount = Math.max(1, Number(product.min_order_qty) || 1)
    addToCart(buyerType, Number(product.product_id), amount, productName(product))
    setFailed(false)
    setMessage(`${productName(product)} ${num(amount)}개를 장바구니에 담았습니다.`)
  }

  const buyerSwitch = context && context.buyer_types.length > 1 ? <div className="mall-buyer" role="group" aria-label="구매 유형">
    {context.buyer_types.map(type => <button key={type} type="button" className={buyerType === type ? 'is-active' : ''} aria-pressed={buyerType === type} onClick={() => chooseBuyer(type)}>
      <b>{BUYER_LABEL[type]}</b><small>{type === 'ACCOUNT' ? `${text(context.account_name)} 이름으로 · 후불 가능` : '내 돈으로 · 무통장 입금'}</small>
    </button>)}
  </div> : context ? <p className="mall-buyer-note">본사 계정은 개인 구매만 할 수 있습니다(거래처 구매는 거래처 계정으로).</p> : null

  const grid = (items: Row[]) => <ul className="mall-grid">
    {items.map(product => <ProductCard key={text(product.product_id)} product={product} onOpen={() => setDetailId(Number(product.product_id))} onAdd={() => add(product)} />)}
  </ul>

  return <MallLayout>
    <div className="rd mall mall-shop">
      {search ? <section className="mall-wrap mall-result-head">
        <h1><q>{search}</q> 검색 결과 <b>{loaded ? num(products.length) : '…'}</b>개</h1>
        <Link to="/mall">기획전 전체 보기</Link>
      </section> : <>
        <section className="mall-hero" aria-labelledby="mall-hero-title">
          <div className="mall-wrap mall-hero__inner">
            <div className="mall-hero__copy">
              <span className="mall-hero__eyebrow">더채움 직송 기획전</span>
              <h1 id="mall-hero-title">산지에서 바로,<br />우리 현장 주방까지</h1>
              <p>협력사가 직접 보내는 신선 식자재와 더채움 상품을 한곳에서 주문하세요.</p>
              <ul className="mall-hero__stats">
                <li><b>{loaded ? num(products.length) : '-'}</b><span>판매 상품</span></li>
                <li><b>{loaded ? num(deals.length) : '-'}</b><span>특가 상품</span></li>
                {bestRate ? <li><b>{bestRate}%</b><span>최대 할인</span></li> : null}
              </ul>
            </div>
            {spotlight.length ? <ul className="mall-hero__spot" aria-label="추천 상품">
              {spotlight.map(product => {
                const rate = discountRate(product)
                return <li key={text(product.product_id)}>
                  <button type="button" onClick={() => setDetailId(Number(product.product_id))} aria-label={`${productName(product)} 자세히 보기`}>
                    <span className="mall-hero__spot-img">{product.image_url ? <img src={text(product.image_url)} alt="" /> : <span aria-hidden="true">{text(product.product_name).slice(0, 1)}</span>}</span>
                    <span className="mall-hero__spot-name">{productName(product)}</span>
                    <span className="mall-hero__spot-price">{rate ? <em>{rate}%</em> : null}<b>{won(product.unit_price)}</b></span>
                  </button>
                </li>
              })}
            </ul> : null}
          </div>
        </section>
        <ul className="mall-wrap mall-benefits" aria-label="혜택">
          <li><b>산지 직송</b><span>협력사가 바로 보내 더 신선하게</span></li>
          <li><b>묶음 무료 배송</b><span>같은 협력사 일정 금액 이상이면 무료</span></li>
          <li><b>{context?.buyer_types.includes('ACCOUNT') ? '거래처 후불 결제' : '무통장 입금'}</b><span>{context?.buyer_types.includes('ACCOUNT') ? '거래처 구매는 월말에 한 번에 청구' : '주문 후 안내 계좌로 입금'}</span></li>
        </ul>
      </>}

      <div className="mall-wrap">{buyerSwitch}</div>
      {failed && message ? <div className="mall-wrap"><p className="mall-msg is-error" role="alert">{message}</p></div> : null}

      {!search && sections.length > 1 ? <nav className="mall-tabs" aria-label="기획전 바로가기">
        <div className="mall-wrap mall-tabs__inner">
          {sections.map(section => <button key={section.key} type="button" className={activeTab === section.key ? 'is-active' : ''} aria-current={activeTab === section.key ? 'true' : undefined}
            onClick={() => goTo(section.key)}>{section.title}<small>{num(section.products.length)}</small></button>)}
        </div>
      </nav> : null}

      {loaded && products.length === 0 ? <section className="mall-wrap"><div className="rd-card mall-empty"><h2 className="rd-h2">{search ? '찾는 상품이 없습니다' : '판매 중인 상품이 없습니다'}</h2>
        <p className="rd-muted">{search ? '다른 검색어로 찾아보세요.' : '본사에서 상품을 준비하고 있습니다.'}</p></div></section> : null}
      {!loaded && !failed ? <p className="mall-wrap rd-muted" role="status">상품을 불러오는 중…</p> : null}

      {search ? <section className="mall-wrap mall-section-block">{grid(products)}</section>
        : sections.map(section => <section key={section.key} data-section={section.key} ref={node => { sectionRefs.current[section.key] = node }}
          className={`mall-section-block${section.key === 'deal' ? ' is-deal' : ''}`} aria-labelledby={`mall-sec-${section.key}`}>
          <div className="mall-wrap">
            <header className="mall-section-block__head">
              <h2 id={`mall-sec-${section.key}`}>{section.title}</h2>
              {section.note ? <span>{section.note}</span> : <span>{num(section.products.length)}개 상품</span>}
            </header>
            {grid(section.products)}
          </div>
        </section>)}
    </div>
    {!failed && message ? <p className="rd mall-toast" role="status">{message} <Link to="/mall/cart">장바구니 보기</Link></p> : null}
    {detailId !== null && buyerType ? <ProductDialog productId={detailId} buyerType={buyerType} onClose={() => setDetailId(null)} onAdd={add} /> : null}
  </MallLayout>
}

function ProductCard({ product, onOpen, onAdd }: { product: Row; onOpen: () => void; onAdd: () => void }) {
  const min = Math.max(1, Number(product.min_order_qty) || 1)
  const remaining = product.remaining_qty === null || product.remaining_qty === undefined ? undefined : Number(product.remaining_qty)
  const orderable = product.orderable !== false
  const rate = discountRate(product)
  const name = productName(product)
  return <li className={`mall-pcard${orderable ? '' : ' is-off'}`}>
    <button type="button" className="mall-pcard__image" onClick={onOpen} aria-label={`${name} 자세히 보기`}>
      {product.image_url ? <img src={text(product.image_url)} alt="" loading="lazy" /> : <span className="mall-pcard__noimg" aria-hidden="true">{text(product.product_name).slice(0, 1)}</span>}
      <span className="mall-pcard__flags">
        {product.price_type === 'EVENT' ? <i className="is-deal">특가</i> : null}
        {product.fulfillment_type === 'DROP_SHIP' ? <i>산지 직송</i> : null}
        {product.storage_type && product.storage_type !== 'ROOM' ? <i className={`is-${text(product.storage_type).toLowerCase()}`}>{STORAGE_LABEL[text(product.storage_type)]}</i> : null}
      </span>
      {!orderable ? <em>{text(product.unavailable_reason)}</em> : null}
    </button>
    <div className="mall-pcard__body">
      <small className="mall-pcard__partner">{text(product.partner_name)}</small>
      <button type="button" className="mall-pcard__name" onClick={onOpen}>{name}</button>
      <div className="mall-pcard__price">
        {rate ? <em>{rate}%</em> : null}
        <b>{num(product.unit_price)}<small>원</small></b>
        {rate ? <del>{won(product.regular_price)}</del> : null}
      </div>
      <div className="mall-pcard__meta">
        <span>{Number(product.shipping_fee) > 0 ? `배송비 ${won(product.shipping_fee)}` : '무료 배송'}</span>
        {min > 1 ? <span>최소 {num(min)}개</span> : null}
        {remaining !== undefined && remaining > 0 && remaining <= 20 ? <span className="is-warn">{num(remaining)}개 남음</span> : null}
      </div>
      {orderable ? <button type="button" className="mall-pcard__add" onClick={onAdd} aria-label={`${name} 장바구니 담기`}>장바구니 담기</button> : null}
    </div>
  </li>
}

function ProductDialog({ productId, buyerType, onClose, onAdd }: { productId: number; buyerType: BuyerType; onClose: () => void; onAdd: (product: Row) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<{ product: Row; images: Row[] } | null>(null)
  const [error, setError] = useState('')
  const [image, setImage] = useState(0)
  useEffect(() => { ref.current?.showModal() }, [])
  useEffect(() => {
    let alive = true
    getMallProduct(productId, buyerType).then(result => { if (alive) setData(result) })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : '상품을 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [productId, buyerType])
  const product = data?.product
  const rate = product ? discountRate(product) : 0
  const info: Array<[string, string]> = product ? [
    ['협력사', text(product.partner_name)],
    ['원산지', text(product.origin)],
    ['보관', STORAGE_LABEL[text(product.storage_type)] ?? ''],
    ['판매 단위', `${text(product.sale_unit)}${product.unit_content_qty ? ` (${num(product.unit_content_qty)}${text(product.unit_content_unit)})` : ''}`],
    ['주문 수량', `${num(product.min_order_qty)}개부터${product.max_order_qty ? ` · 한 번에 ${num(product.max_order_qty)}개까지` : ''}`],
    ['배송비', Number(product.shipping_fee) > 0 ? `${won(product.shipping_fee)}${product.free_shipping_amount ? ` (같은 협력사 ${won(product.free_shipping_amount)} 이상 무료)` : ''}` : '무료'],
    ['출고', product.fulfillment_type === 'DROP_SHIP' ? '협력사에서 바로 보냄' : '더채움 창고에서 보냄'],
    ['과세', product.tax_type === 'TAX_FREE' ? '면세' : '과세(부가세 포함 가격)'],
  ].filter(([, value]) => value) as Array<[string, string]> : []
  return <dialog ref={ref} className="mall-dialog" aria-labelledby="mall-dialog-title" onClose={onClose} onClick={event => { if (event.target === ref.current) ref.current?.close() }}>
    <div className="mall-dialog__body rd">
      <button type="button" className="rd-btn mall-dialog__close" onClick={() => ref.current?.close()} aria-label="닫기">닫기</button>
      {error ? <p className="mall-msg is-error" role="alert">{error}</p> : null}
      {!product ? (error ? null : <p role="status">불러오는 중…</p>) : <>
        <div className="mall-dialog__gallery">
          {data.images.length ? <img src={text(data.images[image]?.image_url)} alt={`${text(product.product_name)} 사진 ${image + 1}`} /> : <span className="mall-dialog__noimg" aria-hidden="true">{text(product.product_name).slice(0, 1)}</span>}
          {data.images.length > 1 ? <div className="mall-dialog__thumbs">{data.images.map((row, index) =>
            <button key={index} type="button" aria-label={`사진 ${index + 1}`} aria-pressed={index === image} onClick={() => setImage(index)}><img src={text(row.image_url)} alt="" /></button>)}</div> : null}
        </div>
        <div className="mall-dialog__info">
          <h2 className="rd-h2" id="mall-dialog-title">{productName(product)}</h2>
          {product.summary ? <p>{text(product.summary)}</p> : null}
          <p className="mall-dialog__price">{rate ? <em>{rate}%</em> : null}<b>{won(product.unit_price)}</b>{rate ? <del>{won(product.regular_price)}</del> : null}
            {product.price_type === 'EVENT' ? <span className="rd-chip is-urgent">행사가</span> : null}
            <small className="rd-muted"> {buyerType === 'ACCOUNT' ? '거래처 구매가' : '개인 구매가'}</small></p>
          <dl className="mall-dl">{info.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {product.orderable !== false ? <button type="button" className="rd-btn is-primary" onClick={() => { onAdd(product); ref.current?.close() }}>{num(Math.max(1, Number(product.min_order_qty) || 1))}개 담기</button>
            : <p className="mall-msg is-error">{text(product.unavailable_reason)}</p>}
        </div>
        <div className="mall-dialog__more">
          <ProductInfoView description={product.description_html} foodLabel={product.food_label_json} notice={product.notice_json} />
        </div>
      </>}
    </div>
  </dialog>
}
