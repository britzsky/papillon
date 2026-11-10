import { useCallback, useEffect, useMemo, useState } from 'react'
import TopMenuLayout from '../../components/TopMenuLayout'
import AccountSearchSelect from '../operations/AccountSearchSelect'
import { getAccountOptions, type AccountOption } from '../../api/operations'
import {
  addCostPrice, addProductImage, addSalePrice, AVAILABILITY_LABEL, changeSaleStatus, deleteProductImage, endSalePrice, FULFILLMENT_LABEL,
  getCategories, getPartners, getProduct, getProducts, HISTORY_LABEL, PRICE_TYPE_LABEL, qty, SALE_STATUS_LABEL, SALE_TARGET_LABEL, saveAvailability,
  saveProduct, STORAGE_LABEL, TAX_LABEL, text, won, type PriceType, type ProductDetail, type ProductQuery, type Row, type SaleStatus,
} from '../../api/distAdmin'
import { Fields, Notice, type FieldDef } from './DistFields'
import { runAction } from './distActions'
import DistRichEditor from './DistRichEditor'
import { FoodLabelFields, NoticeFields } from './DistProductInfoFields'
import ProductInfoView from '../../features/dist/ProductInfoView'
import './DistAdmin.css'

type Tab = 'basic' | 'content' | 'price' | 'availability' | 'images' | 'history'
const TABS: Array<[Tab, string]> = [['basic', '기본 정보'], ['content', '상세·표시사항'], ['price', '가격'], ['availability', '판매 가능'], ['images', '이미지'], ['history', '변경 이력']]
const STATUS_TONE: Record<string, string> = { ON_SALE: 'is-ok', DRAFT: 'is-info', SOLD_OUT: 'is-warn', PAUSED: 'is-warn', DISCONTINUED: 'is-done' }
const STATUS_ACTION: Record<SaleStatus, string> = { ON_SALE: '판매 시작', SOLD_OUT: '품절 처리', PAUSED: '일시중지', DISCONTINUED: '단종', DRAFT: '작성중으로 되돌리기' }
const NEW_PRODUCT: Row = { fulfillment_type: 'DROP_SHIP', sale_target: 'ALL', tax_type: 'TAXABLE', storage_type: 'ROOM', sale_unit: 'EA', min_order_qty: '1', shipping_fee: '0', bundle_ship_yn: 'Y' }

const basicFields = (partners: Record<string, string>, categories: Record<string, string>, isNew: boolean, ownStock: boolean): FieldDef[] => [
  { key: 'partner_id', label: '공급 협력사', required: true, options: partners },
  { key: 'fulfillment_type', label: '출고 방식', required: true, options: FULFILLMENT_LABEL, hint: '직송 = 협력사가 고객에게 바로 발송, 자사재고 = 본사 창고에서 출고' },
  { key: 'category_id', label: '카테고리', options: categories },
  { key: 'product_name', label: '상품명', required: true, wide: true, maxLength: 255, placeholder: '예: 완도 활전복' },
  { key: 'option_name', label: '규격·옵션', maxLength: 100, placeholder: '예: 1kg(10~12미)' },
  { key: 'product_code', label: '상품코드', maxLength: 30, placeholder: isNew ? '비우면 자동(P날짜-번호)' : '', hint: '판매 단위·규격마다 1개' },
  { key: 'product_group_code', label: '규격 묶음 코드', maxLength: 30, hint: '1kg·2kg처럼 같은 상품의 규격을 묶을 때' },
  { key: 'partner_item_code', label: '협력사 상품코드', maxLength: 50 },
  { key: 'sale_target', label: '판매 대상', required: true, options: SALE_TARGET_LABEL },
  { key: 'tax_type', label: '과세 구분', required: true, options: TAX_LABEL, hint: '미가공 신선 수산물은 면세일 수 있음(세무 확인)' },
  { key: 'storage_type', label: '보관 방법', required: true, options: STORAGE_LABEL },
  { key: 'origin', label: '원산지', maxLength: 100, placeholder: '예: 국산(전남 완도)' },
  { key: 'sale_unit', label: '판매 단위', maxLength: 30, placeholder: 'EA·BOX·봉' },
  { key: 'unit_content_qty', label: '내용량', type: 'number' },
  { key: 'unit_content_unit', label: '내용량 단위', maxLength: 20, placeholder: 'g·kg·ml' },
  { key: 'shelf_life_days', label: '소비기한(일)', type: 'number' },
  { key: 'min_order_qty', label: '최소 주문 수량', type: 'number' },
  { key: 'max_order_qty', label: '1회 최대 주문 수량', type: 'number', hint: '비우면 제한 없음' },
  { key: 'shipping_fee', label: '기본 배송비', type: 'number' },
  { key: 'free_shipping_amount', label: '무료 배송 기준 금액', type: 'number', hint: '이 금액 이상이면 배송비 없음' },
  { key: 'bundle_ship_yn', label: '합포장', required: true, options: { Y: '같은 출고지 상품과 가능', N: '따로 포장' } },
  ...(ownStock ? [{ key: 'safety_stock_qty', label: '안전재고', type: 'number' as const, hint: '이 아래로 떨어지면 알림(재고 단계에서 사용)' }] : []),
  { key: 'sale_start_at', label: '판매 시작', type: 'datetime-local', hint: '비우면 바로' },
  { key: 'sale_end_at', label: '판매 종료', type: 'datetime-local', hint: '명절 한정 등. 비우면 계속' },
  { key: 'summary', label: '한 줄 소개', wide: true, maxLength: 500 },
  ...(isNew ? [
    { key: 'account_price', label: '거래처가(첫 판매가)', type: 'number' as const, hint: 'VAT 포함, 요양원 구매가' },
    { key: 'personal_price', label: '개인가(첫 판매가)', type: 'number' as const, hint: 'VAT 포함, 원장님·직원 개인 구매가' },
    { key: 'unit_cost', label: '매입가(첫 매입가)', type: 'number' as const, hint: 'VAT 제외' },
  ] : []),
]

/**
 * 협력사 관리 › 상품 관리(본사 전용, 2026-11-02). 왼쪽 목록에서 고르면 오른쪽에서 기본 정보·가격·판매 가능·이미지·변경 이력을 다룬다.
 * 새 상품은 '작성중'으로 등록되고, 판매가를 확인한 뒤 '판매중'으로 바꾸면 더채움몰에 보인다(더채움몰은 다음 단계).
 */
export default function DistProducts() {
  const [query, setQuery] = useState<ProductQuery>({})
  const [keyword, setKeyword] = useState('')
  const [products, setProducts] = useState<Row[]>([])
  const [partners, setPartners] = useState<Row[]>([])
  const [categories, setCategories] = useState<Row[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [draft, setDraft] = useState<Row | null>(null)
  const [tab, setTab] = useState<Tab>('basic')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const notice = useCallback((value: string, isError: boolean) => { setMessage(value); setFailed(isError) }, [])

  const [listRevision, setListRevision] = useState(0)
  useEffect(() => {
    let alive = true
    getProducts(query).then(result => { if (alive) setProducts(result.products) })
      .catch(error => { if (alive) notice(error instanceof Error ? error.message : '상품 목록을 불러오지 못했습니다.', true) })
    return () => { alive = false }
  }, [query, listRevision, notice])
  const loadDetail = useCallback(async (productId: number) => {
    try {
      const result = await getProduct(productId)
      setDetail(result)
      setDraft({ ...result.product })
    } catch (error) { notice(error instanceof Error ? error.message : '상품을 불러오지 못했습니다.', true) }
  }, [notice])

  useEffect(() => {
    Promise.all([getPartners(), getCategories()])
      .then(([partnerResult, categoryResult]) => { setPartners(partnerResult.partners); setCategories(categoryResult.categories) })
      .catch(error => notice(error instanceof Error ? error.message : '기준 정보를 불러오지 못했습니다.', true))
  }, [notice])

  const partnerOptions = useMemo(() => Object.fromEntries(partners
    .filter(row => row.active_yn !== 'N' || text(row.partner_id) === text(draft?.partner_id))
    .map(row => [text(row.partner_id), text(row.partner_name)])), [partners, draft?.partner_id])
  const categoryOptions = useMemo(() => Object.fromEntries(categories
    .filter(row => row.use_yn !== 'N' || text(row.category_id) === text(draft?.category_id))
    .map(row => [text(row.category_id), text(row.category_name)])), [categories, draft?.category_id])

  const open = (productId: number) => { setSelected(productId); setTab('basic'); notice('', false); void loadDetail(productId) }
  const startNew = () => {
    setSelected(null); setDetail(null); setTab('basic'); notice('', false)
    setDraft({ ...NEW_PRODUCT, partner_id: query.partner_id ?? (partners.length === 1 ? text(partners[0].partner_id) : '') })
  }
  const refresh = async (productId: number) => { setListRevision(value => value + 1); await loadDetail(productId) }

  const submitBasic = async () => {
    if (!draft) return
    let savedId: number | null = selected
    const ok = await runAction(setBusy, notice, async () => {
      const result = await saveProduct(draft)
      savedId = Number(result.product_id ?? selected)
      return result
    })
    if (ok && savedId) { setSelected(savedId); await refresh(savedId) }
  }
  const setStatus = async (status: SaleStatus) => {
    if (!selected) return
    const reason = status === 'PAUSED' || status === 'DISCONTINUED' ? window.prompt(`${SALE_STATUS_LABEL[status]} 사유(선택)`) ?? undefined : undefined
    if (await runAction(setBusy, notice, () => changeSaleStatus(selected, status, reason))) await refresh(selected)
  }

  const product = detail?.product
  const isNew = draft !== null && !selected

  return <div className="dist-page"><TopMenuLayout title="상품 관리">
    <div className="rd rd-page dist-admin">
      <header className="rd-page__head">
        <div>
          <h1 className="rd-sr-only">상품 관리</h1>
          <p className="rd-muted">더채움 유통으로 파는 상품입니다. <b>판매중</b>인 상품만 더채움몰에 보입니다. 가격을 바꾸면 이전 가격은 기록으로 남습니다.</p>
        </div>
        <button type="button" className="rd-btn is-primary" disabled={busy || partners.length === 0} onClick={startNew}>상품 등록</button>
      </header>
      {partners.length === 0 ? <p className="dist-msg is-error" role="status">협력사가 없습니다. 협력사 관리 › 협력사·기본 설정에서 판매 주체와 협력사를 먼저 등록하세요.</p> : null}
      <Notice message={message} failed={failed} />

      <div className="dist-split">
        <section className="rd-card dist-card dist-list" aria-labelledby="dist-products-title">
          <form className="dist-filters" onSubmit={event => { event.preventDefault(); setQuery(current => ({ ...current, keyword: keyword.trim() })) }}>
            <select className="rd-input" aria-label="협력사" value={query.partner_id ?? ''} onChange={event => setQuery(current => ({ ...current, partner_id: event.target.value }))}>
              <option value="">협력사 전체</option>
              {partners.map(row => <option key={text(row.partner_id)} value={text(row.partner_id)}>{text(row.partner_name)}</option>)}
            </select>
            <select className="rd-input" aria-label="카테고리" value={query.category_id ?? ''} onChange={event => setQuery(current => ({ ...current, category_id: event.target.value }))}>
              <option value="">카테고리 전체</option>
              {categories.map(row => <option key={text(row.category_id)} value={text(row.category_id)}>{text(row.category_name)}</option>)}
            </select>
            <select className="rd-input" aria-label="판매 상태" value={query.sale_status ?? ''} onChange={event => setQuery(current => ({ ...current, sale_status: event.target.value }))}>
              <option value="">상태 전체</option>
              {Object.entries(SALE_STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <input className="rd-input" type="search" aria-label="상품명·코드 검색" placeholder="상품명·코드" value={keyword} onChange={event => setKeyword(event.target.value)} />
            <button type="submit" className="rd-btn">검색</button>
          </form>
          <h2 className="rd-h2" id="dist-products-title">상품 {products.length}개</h2>
          <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="상품 목록">
            <table className="rd-table dist-table dist-products">
              <thead><tr><th>상품</th><th>협력사</th><th>상태</th><th className="is-num">거래처가</th><th className="is-num">개인가</th><th className="is-num">매입가</th></tr></thead>
              <tbody>
                {products.length === 0 ? <tr><td colSpan={6} className="dist-empty">조건에 맞는 상품이 없습니다.</td></tr> : null}
                {products.map(row => {
                  const id = Number(row.product_id)
                  return <tr key={id} className={selected === id ? 'is-selected' : ''}>
                    <td>
                      <button type="button" className="dist-row-link" onClick={() => open(id)} aria-current={selected === id ? 'true' : undefined}>
                        {row.image_url ? <img src={text(row.image_url)} alt="" loading="lazy" /> : <span className="dist-thumb" aria-hidden="true" />}
                        <span><b>{text(row.product_name)}</b>{row.option_name ? <small> {text(row.option_name)}</small> : null}
                          <small className="rd-muted dist-code">{text(row.product_code)} · {FULFILLMENT_LABEL[text(row.fulfillment_type) as keyof typeof FULFILLMENT_LABEL]}</small></span>
                      </button>
                    </td>
                    <td>{text(row.partner_name)}</td>
                    <td><span className={`rd-chip ${STATUS_TONE[text(row.sale_status)] ?? ''}`}>{SALE_STATUS_LABEL[text(row.sale_status) as SaleStatus] ?? text(row.sale_status)}</span></td>
                    <td className="is-num">{won(row.account_price)}</td>
                    <td className="is-num">{won(row.personal_price)}</td>
                    <td className="is-num">{won(row.unit_cost)}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rd-card dist-card dist-detail" aria-label="상품 상세">
          {!draft ? <p className="dist-empty">왼쪽 목록에서 상품을 고르거나 '상품 등록'을 누르세요.</p> : <>
            <div className="dist-card__head">
              <h2 className="rd-h2">{isNew ? '새 상품' : `${text(product?.product_name)}${product?.option_name ? ` ${text(product.option_name)}` : ''}`}</h2>
              {product ? <span className={`rd-chip ${STATUS_TONE[text(product.sale_status)] ?? ''}`}>{SALE_STATUS_LABEL[text(product.sale_status) as SaleStatus]}</span> : null}
            </div>
            {product ? <div className="dist-status" role="group" aria-label="판매 상태 바꾸기">
              {(['ON_SALE', 'SOLD_OUT', 'PAUSED', 'DISCONTINUED', 'DRAFT'] as SaleStatus[]).filter(status => status !== product.sale_status).map(status =>
                <button key={status} type="button" className={`rd-btn${status === 'ON_SALE' ? ' is-primary' : ''}`} disabled={busy} onClick={() => void setStatus(status)}>
                  {STATUS_ACTION[status]}</button>)}
            </div> : null}
            {!isNew ? <div className="dist-tabs" role="tablist" aria-label="상품 정보">
              {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>)}
            </div> : null}

            {tab === 'basic' || isNew ? <form onSubmit={event => { event.preventDefault(); void submitBasic() }}>
              <Fields defs={basicFields(partnerOptions, categoryOptions, isNew, draft.fulfillment_type === 'OWN_STOCK')} value={draft} disabled={busy}
                onChange={patch => setDraft(current => ({ ...current, ...patch }))} />
              {isNew ? <p className="rd-muted rd-fs-sm">상세 설명·식품 표시사항·상품정보제공고시는 등록한 뒤 '상세·표시사항' 탭에서 넣습니다.</p> : null}
              <div className="dist-actions">
                {isNew ? <button type="button" className="rd-btn" disabled={busy} onClick={() => setDraft(null)}>취소</button> : null}
                <button type="submit" className="rd-btn is-primary" disabled={busy}>{isNew ? '등록' : '저장'}</button>
              </div>
            </form> : null}
            {!isNew && detail && tab === 'content' ? <ContentPanel key={selected} detail={detail} draft={draft} busy={busy}
              onChange={patch => setDraft(current => ({ ...current, ...patch }))} onSave={() => void submitBasic()} /> : null}
            {!isNew && detail && tab === 'price' ? <PricePanel detail={detail} busy={busy} setBusy={setBusy} notice={notice} reload={() => refresh(detail.product.product_id as number)} /> : null}
            {!isNew && detail && tab === 'availability' ? <AvailabilityPanel detail={detail} busy={busy} setBusy={setBusy} notice={notice} reload={() => refresh(detail.product.product_id as number)} /> : null}
            {!isNew && detail && tab === 'images' ? <ImagePanel detail={detail} busy={busy} setBusy={setBusy} notice={notice} reload={() => refresh(detail.product.product_id as number)} /> : null}
            {!isNew && detail && tab === 'history' ? <HistoryPanel detail={detail} /> : null}
          </>}
        </section>
      </div>
    </div>
  </TopMenuLayout></div>
}

const IMAGE_TYPE_LABEL: Record<string, string> = { MAIN: '대표', DETAIL: '상세', LABEL: '표시사항' }

/** 상세 설명(편집기)·식품 표시사항·상품정보제공고시. 저장은 기본 정보와 같은 상품 저장(draft 전체) */
function ContentPanel({ detail, draft, busy, onChange, onSave }: { detail: ProductDetail; draft: Row; busy: boolean; onChange: (patch: Row) => void; onSave: () => void }) {
  const [preview, setPreview] = useState(false)
  const images = detail.images.map(image => ({ url: text(image.image_url), label: `${IMAGE_TYPE_LABEL[text(image.image_type)] ?? ''} 이미지` }))
  return <form className="dist-panel" onSubmit={event => { event.preventDefault(); onSave() }}>
    <div className="dist-card__head">
      <h3 className="dist-editor__title">상세 설명 <small className="rd-muted">더채움몰 상품 상세에 보입니다</small></h3>
      <button type="button" className="rd-btn" aria-pressed={preview} onClick={() => setPreview(open => !open)}>{preview ? '편집으로' : '더채움몰 미리 보기'}</button>
    </div>
    {preview
      ? <div className="dist-preview"><ProductInfoView description={draft.description_html} foodLabel={draft.food_label_json} notice={draft.notice_json} />
        {!draft.description_html && !draft.food_label_json && !draft.notice_json ? <p className="dist-empty">아직 입력한 내용이 없습니다.</p> : null}</div>
      : <>
        <DistRichEditor id="dist-description" value={draft.description_html} disabled={busy} images={images} onChange={html => onChange({ description_html: html })} />
        <FoodLabelFields draft={draft} disabled={busy} onChange={onChange} />
        <NoticeFields draft={draft} disabled={busy} onChange={onChange} />
      </>}
    <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy}>저장</button></div>
  </form>
}

type PanelProps = { detail: ProductDetail; busy: boolean; setBusy: (busy: boolean) => void; notice: (message: string, failed: boolean) => void; reload: () => Promise<void> }

function PricePanel({ detail, busy, setBusy, notice, reload }: PanelProps) {
  const productId = Number(detail.product.product_id)
  const [price, setPrice] = useState<Row>({ price_type: 'ACCOUNT', unit_price: '', start_at: '', change_reason: '', account_id: '' })
  const [cost, setCost] = useState<Row>({ unit_cost: '', start_date: '', change_reason: '' })
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const canPickAccount = price.price_type === 'ACCOUNT' || price.price_type === 'EVENT'
  useEffect(() => { if (canPickAccount && accounts.length === 0) getAccountOptions().then(setAccounts).catch(() => setAccounts([])) }, [canPickAccount, accounts.length])

  const currentCost = Number(detail.cost_prices.find(row => Number(row.current_yn) === 1)?.unit_cost ?? NaN)
  const margin = (value: unknown) => {
    const sale = Number(value)
    if (!Number.isFinite(currentCost) || !Number.isFinite(sale) || sale <= 0) return ''
    // 판매가는 VAT 포함, 매입가는 VAT 제외 — 과세 상품은 판매가에서 VAT를 빼고 비교
    const net = detail.product.tax_type === 'TAX_FREE' ? sale : sale / 1.1
    return `${Math.round(((net - currentCost) / net) * 1000) / 10}%`
  }
  const submitPrice = async () => {
    if (await runAction(setBusy, notice, () => addSalePrice({ ...price, product_id: productId, account_id: canPickAccount ? price.account_id : '' }))) {
      setPrice(current => ({ ...current, unit_price: '', start_at: '', change_reason: '' })); await reload()
    }
  }
  const submitCost = async () => {
    if (await runAction(setBusy, notice, () => addCostPrice({ ...cost, product_id: productId }))) { setCost({ unit_cost: '', start_date: '', change_reason: '' }); await reload() }
  }
  const end = async (row: Row) => {
    if (!window.confirm(`${PRICE_TYPE_LABEL[text(row.price_type) as PriceType]} ${won(row.unit_price)}을(를) 지금 끝낼까요?`)) return
    if (await runAction(setBusy, notice, () => endSalePrice(productId, Number(row.sale_price_id)))) await reload()
  }

  return <div className="dist-panel">
    <h3 className="dist-editor__title">판매가 <small className="rd-muted">VAT 포함 · 거래처 전용가 &gt; 행사가 &gt; 공통가 순으로 적용</small></h3>
    <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="판매가 이력">
      <table className="rd-table dist-table">
        <thead><tr><th>유형</th><th>거래처</th><th className="is-num">판매가</th><th className="is-num">마진</th><th>적용 기간</th><th>사유</th><th aria-label="종료" /></tr></thead>
        <tbody>
          {detail.sale_prices.length === 0 ? <tr><td colSpan={7} className="dist-empty">판매가가 없습니다. 판매가가 있어야 판매를 시작할 수 있습니다.</td></tr> : null}
          {detail.sale_prices.map(row => {
            const current = Number(row.current_yn) === 1
            const future = isFuture(row.start_at)
            return <tr key={text(row.sale_price_id)} className={current ? 'is-current' : future ? '' : 'is-off'}>
              <td>{PRICE_TYPE_LABEL[text(row.price_type) as PriceType] ?? text(row.price_type)}{current ? <span className="rd-chip is-ok">적용 중</span> : future ? <span className="rd-chip is-info">예약</span> : null}</td>
              <td>{row.account_id ? text(row.account_name) || text(row.account_id) : '공통'}</td>
              <td className="is-num">{won(row.unit_price)}</td>
              <td className="is-num">{margin(row.unit_price)}</td>
              <td>{text(row.start_at)} ~ {text(row.end_at) || '계속'}</td>
              <td>{text(row.change_reason)}</td>
              <td>{current && !row.end_at ? <button type="button" className="rd-btn" disabled={busy} onClick={() => void end(row)}>종료</button> : null}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    <form className="dist-subform" onSubmit={event => { event.preventDefault(); void submitPrice() }}>
      <h4>판매가 바꾸기·추가</h4>
      <div className="dist-fields">
        <div className="dist-field"><label htmlFor="dist-price-type">유형</label>
          <select id="dist-price-type" className="rd-input" value={text(price.price_type)} disabled={busy} onChange={event => setPrice(current => ({ ...current, price_type: event.target.value }))}>
            {Object.entries(PRICE_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div className="dist-field"><label htmlFor="dist-price-value">판매가(원)<b aria-hidden="true"> *</b></label>
          <input id="dist-price-value" className="rd-input" inputMode="decimal" value={text(price.unit_price)} disabled={busy} onChange={event => setPrice(current => ({ ...current, unit_price: event.target.value }))} /></div>
        <div className="dist-field"><label htmlFor="dist-price-start">적용 시작</label>
          <input id="dist-price-start" className="rd-input" type="datetime-local" value={text(price.start_at)} disabled={busy} onChange={event => setPrice(current => ({ ...current, start_at: event.target.value }))} />
          <small className="rd-muted">비우면 지금부터</small></div>
        {canPickAccount ? <div className="dist-field is-wide"><label htmlFor="dist-price-account">특정 거래처 전용가(선택)</label>
          <AccountSearchSelect id="dist-price-account" options={accounts} placeholder="비우면 모든 거래처 공통" value={text(price.account_id)}
            onChange={accountId => setPrice(current => ({ ...current, account_id: accountId }))} /></div> : null}
        <div className="dist-field is-wide"><label htmlFor="dist-price-reason">변경 사유</label>
          <input id="dist-price-reason" className="rd-input" maxLength={500} value={text(price.change_reason)} disabled={busy} placeholder="예: 시세 상승" onChange={event => setPrice(current => ({ ...current, change_reason: event.target.value }))} /></div>
      </div>
      <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy || !text(price.unit_price).trim()}>판매가 저장</button></div>
    </form>

    <h3 className="dist-editor__title">매입가 <small className="rd-muted">VAT 제외 · {text(detail.product.partner_name)}에서 사는 값</small></h3>
    <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="매입가 이력">
      <table className="rd-table dist-table">
        <thead><tr><th className="is-num">매입가</th><th>적용 기간</th><th>사유</th><th>입력</th></tr></thead>
        <tbody>
          {detail.cost_prices.length === 0 ? <tr><td colSpan={4} className="dist-empty">매입가가 없습니다.</td></tr> : null}
          {detail.cost_prices.map(row => <tr key={text(row.cost_price_id)} className={Number(row.current_yn) === 1 ? 'is-current' : ''}>
            <td className="is-num">{won(row.unit_cost)}{Number(row.current_yn) === 1 ? <span className="rd-chip is-ok">적용 중</span> : null}</td>
            <td>{text(row.start_date)} ~ {text(row.end_date) || '계속'}</td>
            <td>{text(row.change_reason)}</td>
            <td>{row.input_source === 'PARTNER' ? '협력사' : '본사'} {text(row.user_id)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <form className="dist-subform" onSubmit={event => { event.preventDefault(); void submitCost() }}>
      <h4>매입가 바꾸기</h4>
      <div className="dist-fields">
        <div className="dist-field"><label htmlFor="dist-cost-value">매입가(원)<b aria-hidden="true"> *</b></label>
          <input id="dist-cost-value" className="rd-input" inputMode="decimal" value={text(cost.unit_cost)} disabled={busy} onChange={event => setCost(current => ({ ...current, unit_cost: event.target.value }))} /></div>
        <div className="dist-field"><label htmlFor="dist-cost-start">적용 시작일</label>
          <input id="dist-cost-start" className="rd-input" type="date" value={text(cost.start_date)} disabled={busy} onChange={event => setCost(current => ({ ...current, start_date: event.target.value }))} />
          <small className="rd-muted">비우면 오늘부터</small></div>
        <div className="dist-field is-wide"><label htmlFor="dist-cost-reason">변경 사유</label>
          <input id="dist-cost-reason" className="rd-input" maxLength={500} value={text(cost.change_reason)} disabled={busy} onChange={event => setCost(current => ({ ...current, change_reason: event.target.value }))} /></div>
      </div>
      <div className="dist-actions"><button type="submit" className="rd-btn is-primary" disabled={busy || !text(cost.unit_cost).trim()}>매입가 저장</button></div>
    </form>
  </div>
}

const isFuture = (value: unknown) => {
  const time = Date.parse(text(value).replace(' ', 'T'))
  return Number.isFinite(time) && time > Date.now()
}

const EMPTY_AVAILABILITY: Row = { availability_id: '', available_from: '', available_to: '', available_qty: '', status: 'AVAILABLE', note: '' }

function AvailabilityPanel({ detail, busy, setBusy, notice, reload }: PanelProps) {
  const productId = Number(detail.product.product_id)
  const [row, setRow] = useState<Row>(EMPTY_AVAILABILITY)
  const submit = async () => {
    if (await runAction(setBusy, notice, () => saveAvailability({ ...row, product_id: productId }))) { setRow(EMPTY_AVAILABILITY); await reload() }
  }
  const defs: FieldDef[] = [
    { key: 'available_from', label: '시작일', type: 'date', required: true },
    { key: 'available_to', label: '종료일', type: 'date', hint: '비우면 계속' },
    { key: 'available_qty', label: '판매 가능 수량', type: 'number', hint: '비우면 제한 없음' },
    { key: 'status', label: '상태', required: true, options: AVAILABILITY_LABEL },
    { key: 'note', label: '메모', wide: true, maxLength: 500, placeholder: '예: 기상 악화로 출하 지연' },
  ]
  return <div className="dist-panel">
    <p className="rd-muted rd-fs-sm">{detail.product.fulfillment_type === 'DROP_SHIP'
      ? '협력사가 알려준 기간별 판매 가능 수량입니다. 정보가 없으면 수량 제한 없이 판매합니다.'
      : '자사재고 상품은 재고 수량으로 판매 가능 여부를 정합니다(재고 단계). 여기서는 기간 한정 판매만 정할 수 있습니다.'}</p>
    <div className="rd-page__scroll" tabIndex={0} role="region" aria-label="판매 가능 기간">
      <table className="rd-table dist-table">
        <thead><tr><th>기간</th><th className="is-num">가능 수량</th><th className="is-num">주문받은 수량</th><th>상태</th><th>메모</th><th aria-label="수정" /></tr></thead>
        <tbody>
          {detail.availability.length === 0 ? <tr><td colSpan={6} className="dist-empty">등록된 기간이 없습니다.</td></tr> : null}
          {detail.availability.map(item => <tr key={text(item.availability_id)} className={Number(item.current_yn) === 1 ? 'is-current' : ''}>
            <td>{text(item.available_from)} ~ {text(item.available_to) || '계속'}{Number(item.current_yn) === 1 ? <span className="rd-chip is-ok">오늘</span> : null}</td>
            <td className="is-num">{item.available_qty === null || item.available_qty === undefined ? '제한 없음' : qty(item.available_qty)}</td>
            <td className="is-num">{qty(item.reserved_qty)}</td>
            <td>{AVAILABILITY_LABEL[text(item.status)] ?? text(item.status)}</td>
            <td>{text(item.note)}</td>
            <td><button type="button" className="rd-btn" disabled={busy} onClick={() => setRow({ ...item, available_qty: text(item.available_qty) })}>수정</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <form className="dist-subform" onSubmit={event => { event.preventDefault(); void submit() }}>
      <h4>{row.availability_id ? '판매 가능 기간 수정' : '판매 가능 기간 추가'}</h4>
      <Fields defs={defs} value={row} disabled={busy} onChange={patch => setRow(current => ({ ...current, ...patch }))} />
      <div className="dist-actions">
        {row.availability_id ? <button type="button" className="rd-btn" disabled={busy} onClick={() => setRow(EMPTY_AVAILABILITY)}>취소</button> : null}
        <button type="submit" className="rd-btn is-primary" disabled={busy || !text(row.available_from)}>저장</button>
      </div>
    </form>
  </div>
}

function ImagePanel({ detail, busy, setBusy, notice, reload }: PanelProps) {
  const productId = Number(detail.product.product_id)
  const [url, setUrl] = useState('')
  const [type, setType] = useState('MAIN')
  const add = async () => {
    if (await runAction(setBusy, notice, () => addProductImage(productId, url.trim(), type))) { setUrl(''); await reload() }
  }
  const remove = async (image: Row) => {
    if (!window.confirm('이 이미지를 뺄까요?')) return
    if (await runAction(setBusy, notice, () => deleteProductImage(productId, Number(image.product_image_id)))) await reload()
  }
  return <div className="dist-panel">
    <p className="rd-muted rd-fs-sm">이미지 주소(https://…)를 넣습니다. 첫 번째 대표 이미지가 목록·더채움몰 썸네일로 쓰입니다.</p>
    <ul className="dist-images">
      {detail.images.length === 0 ? <li className="dist-empty">이미지가 없습니다.</li> : null}
      {detail.images.map(image => <li key={text(image.product_image_id)}>
        <img src={text(image.image_url)} alt={`${IMAGE_TYPE_LABEL[text(image.image_type)] ?? ''} 이미지`} loading="lazy" />
        <span className="rd-chip is-info">{IMAGE_TYPE_LABEL[text(image.image_type)] ?? text(image.image_type)}</span>
        <button type="button" className="rd-btn" disabled={busy} onClick={() => void remove(image)}>빼기</button>
      </li>)}
    </ul>
    <form className="dist-inline" onSubmit={event => { event.preventDefault(); void add() }}>
      <select className="rd-input" aria-label="이미지 종류" value={type} disabled={busy} onChange={event => setType(event.target.value)}>
        {Object.entries(IMAGE_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <input className="rd-input dist-url" type="url" aria-label="이미지 주소" placeholder="https://" value={url} disabled={busy} onChange={event => setUrl(event.target.value)} />
      <button type="submit" className="rd-btn is-primary" disabled={busy || !url.trim()}>추가</button>
    </form>
  </div>
}

const FIELD_LABEL: Record<string, string> = {
  product_name: '상품명', option_name: '규격', product_code: '상품코드', partner_id: '협력사', category_id: '카테고리', fulfillment_type: '출고 방식',
  sale_target: '판매 대상', tax_type: '과세', storage_type: '보관', origin: '원산지', sale_unit: '판매 단위', shipping_fee: '배송비', sale_status: '판매 상태',
  min_order_qty: '최소 주문', max_order_qty: '최대 주문', summary: '한 줄 소개', description_html: '상세 설명', food_label_json: '식품 표시사항', notice_json: '상품정보제공고시', reason: '사유', image_added: '이미지 추가', image_deleted: '이미지 삭제',
}

function HistoryPanel({ detail }: { detail: ProductDetail }) {
  const describe = (value: unknown) => {
    try {
      const data = typeof value === 'string' ? JSON.parse(value) as Row : (value as Row | null) ?? {}
      return Object.entries(data).map(([key, item]) => {
        const shown = key === 'sale_status' ? SALE_STATUS_LABEL[text(item) as SaleStatus] ?? text(item) : text(item)
        return `${FIELD_LABEL[key] ?? key}: ${shown.length > 40 ? `${shown.slice(0, 40)}…` : shown || '(없음)'}`
      }).join(' · ')
    } catch { return '' }
  }
  return <div className="dist-panel">
    <p className="rd-muted rd-fs-sm">상품 정보·판매 상태·이미지를 바꾼 기록(최근 50건)입니다. 가격 변경은 가격 탭의 이력에 남습니다.</p>
    <ol className="dist-history">
      {detail.history.length === 0 ? <li className="dist-empty">기록이 없습니다.</li> : null}
      {detail.history.map(item => <li key={text(item.product_approval_id)}>
        <div><span className="rd-chip is-info">{HISTORY_LABEL[text(item.request_type)] ?? text(item.request_type)}</span>
          <span className="rd-muted rd-fs-sm"> {text(item.requested_at)} · {text(item.requested_by)}{item.requester_type === 'PARTNER' ? ' (협력사)' : ''}</span></div>
        {item.before_json ? <p className="rd-fs-sm"><span className="rd-muted">전</span> {describe(item.before_json)}</p> : null}
        <p className="rd-fs-sm"><span className="rd-muted">{item.before_json ? '후' : '내용'}</span> {describe(item.after_json)}</p>
      </li>)}
    </ol>
  </div>
}
