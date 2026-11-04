import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BUYER_LABEL, getMallContext, num, placeOrder, quoteCart, text, won, type BuyerType, type MallContext, type PaymentMethod, type Quote } from '../../api/distShop'
import { clearCart, newRequestKey, setCartBuyerType, setCartQty, useCart } from '../../features/mall/mallCart'
import MallLayout from './MallLayout'
import './Mall.css'

type Person = { name: string; phone: string; email: string }
type Address = { name: string; phone: string; zipcode: string; address1: string; address2: string; delivery_request: string }
const EMPTY_ADDRESS: Address = { name: '', phone: '', zipcode: '', address1: '', address2: '', delivery_request: '' }

/**
 * 더채움몰 › 장바구니·주문. 금액(상품·배송비·세금)은 서버가 계산한 값만 보여 준다.
 * 결제: 거래처 구매 = 후불(월말 청구) 또는 무통장, 개인 구매 = 무통장 입금(카드는 PG 정한 뒤). 같은 주문 요청 번호는 한 번만 접수된다.
 */
export default function MallCheckout() {
  const navigate = useNavigate()
  const cart = useCart()
  const [context, setContext] = useState<MallContext | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [orderer, setOrderer] = useState<Person>({ name: '', phone: '', email: '' })
  const [recipient, setRecipient] = useState<Address>(EMPTY_ADDRESS)
  const [sameAsOrderer, setSameAsOrderer] = useState(true)
  const [depositor, setDepositor] = useState('')
  const [note, setNote] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [requestKey] = useState(newRequestKey)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    getMallContext().then(result => {
      if (!alive) return
      setContext(result)
      const defaults = result.account_defaults
      if (defaults) setRecipient(current => ({ ...current, name: text(defaults.recipient_name), phone: text(defaults.phone), zipcode: text(defaults.zipcode), address1: text(defaults.address1), address2: text(defaults.address2) }))
      if (defaults) setSameAsOrderer(false)
    }).catch(error => { if (alive) setMessage(error instanceof Error ? error.message : '더채움몰 정보를 불러오지 못했습니다.') })
    return () => { alive = false }
  }, [])

  const buyerType: BuyerType = (context && cart.buyer_type && context.buyer_types.includes(cart.buyer_type) ? cart.buyer_type : context?.buyer_types[0]) ?? 'PERSONAL'
  const cartKey = useMemo(() => JSON.stringify(cart.lines.map(line => [line.product_id, line.qty])), [cart.lines])
  useEffect(() => {
    if (!context || cart.lines.length === 0) return
    let alive = true
    const timer = window.setTimeout(() => {
      quoteCart(buyerType, cart.lines).then(result => { if (alive) { setQuote(result); setQuoteError('') } })
        .catch(error => { if (alive) { setQuote(null); setQuoteError(error instanceof Error ? error.message : '금액을 계산하지 못했습니다.') } })
    }, 250)
    return () => { alive = false; window.clearTimeout(timer) }
    // cart.lines는 cartKey로 비교(같은 내용이면 다시 계산하지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, buyerType, cartKey])

  const creditAllowed = buyerType === 'ACCOUNT' && (quote?.credit?.allowed ?? context?.credit?.allowed ?? false)
  const creditReason = quote?.credit?.reason ?? context?.credit?.reason ?? ''
  const effectiveMethod: PaymentMethod = buyerType === 'ACCOUNT' && method === 'CREDIT' && creditAllowed ? 'CREDIT' : 'BANK_TRANSFER'
  const quotedLine = (productId: number) => quote?.lines.find(line => Number(line.product_id) === productId)
  const shipTo = sameAsOrderer ? { ...recipient, name: orderer.name, phone: orderer.phone } : recipient

  const missing = [
    !orderer.name.trim() && '주문자 이름', !orderer.phone.trim() && '주문자 연락처',
    !shipTo.name.trim() && '받는 분', !shipTo.phone.trim() && '받는 분 연락처', !recipient.zipcode.trim() && '우편번호', !recipient.address1.trim() && '주소',
    buyerType === 'PERSONAL' && !agreed && '개인정보 동의',
    effectiveMethod === 'BANK_TRANSFER' && !context?.deposit && '입금 계좌(본사 미등록)',
  ].filter(Boolean) as string[]

  const submit = async () => {
    if (!quote || missing.length || busy) return
    setBusy(true); setMessage('')
    try {
      const result = await placeOrder({
        client_request_key: requestKey, buyer_type: buyerType, payment_method: effectiveMethod, items: cart.lines.map(({ product_id, qty }) => ({ product_id, qty })),
        orderer, recipient: shipTo, depositor_name: depositor.trim() || orderer.name.trim(), request_note: note, privacy_agreed: agreed,
      })
      clearCart()
      navigate(`/mall/orders/${result.order_id}`, { state: { placed: result.message } })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '주문하지 못했습니다.')
    } finally { setBusy(false) }
  }

  const field = (id: string, label: string, value: string, onChange: (value: string) => void, options: { required?: boolean; type?: string; placeholder?: string; wide?: boolean; maxLength?: number; autoComplete?: string } = {}) =>
    <div className={`mall-field${options.wide ? ' is-wide' : ''}`}>
      <label htmlFor={id}>{label}{options.required ? <b aria-hidden="true"> *</b> : null}</label>
      <input id={id} className="rd-input" type={options.type ?? 'text'} value={value} placeholder={options.placeholder} maxLength={options.maxLength ?? 100}
        autoComplete={options.autoComplete} required={options.required} onChange={event => onChange(event.target.value)} />
    </div>

  return <MallLayout>
    <div className="rd rd-page mall mall-wrap mall-sub">
      <header className="mall-head">
        <div><h1 className="rd-h1">장바구니·주문</h1><p className="rd-muted">금액은 주문하는 순간의 가격으로 다시 계산됩니다.</p></div>
        <Link to="/mall" className="rd-btn">상품 더 보기</Link>
      </header>
      {message ? <p className="mall-msg is-error" role="alert">{message}</p> : null}
      {context && !context.order_ready ? <p className="mall-msg is-error" role="alert">지금은 주문을 받을 수 없습니다(개인정보 암호화 설정 필요). 관리자에게 알려주세요.</p> : null}

      {cart.lines.length === 0 ? <section className="rd-card mall-empty"><h2 className="rd-h2">장바구니가 비어 있습니다</h2><p><Link to="/mall" className="rd-btn is-primary">상품 보러 가기</Link></p></section> :
        <div className="mall-checkout">
          <div className="mall-checkout__main">
            {context && context.buyer_types.length > 1 ? <section className="rd-card mall-section" aria-labelledby="mall-buyer-title">
              <h2 className="rd-h2" id="mall-buyer-title">구매 유형</h2>
              <div className="mall-buyer" role="group" aria-label="구매 유형">
                {context.buyer_types.map(type => <button key={type} type="button" className={buyerType === type ? 'is-active' : ''} aria-pressed={buyerType === type} onClick={() => setCartBuyerType(type)}>
                  <b>{BUYER_LABEL[type]}</b><small>{type === 'ACCOUNT' ? `${text(context.account_name)} 이름으로 · 세금계산서` : '개인 돈으로 · 무통장 입금'}</small></button>)}
              </div>
            </section> : null}

            <section className="rd-card mall-section" aria-labelledby="mall-cart-title">
              <h2 className="rd-h2" id="mall-cart-title">담은 상품 {cart.lines.length}가지</h2>
              {quoteError ? <p className="mall-msg is-error" role="alert">{quoteError} 문제 상품의 수량을 바꾸거나 빼 주세요.</p> : null}
              <ul className="mall-lines">
                {cart.lines.map(line => {
                  const quoted = quotedLine(line.product_id)
                  return <li key={line.product_id}>
                    {quoted?.image_url ? <img src={text(quoted.image_url)} alt="" /> : <span className="mall-thumb" aria-hidden="true" />}
                    <div className="mall-lines__name"><b>{quoted ? `${text(quoted.product_name)}${quoted.option_name ? ` ${text(quoted.option_name)}` : ''}` : line.name || `상품 ${line.product_id}`}</b>
                      <small className="rd-muted">{quoted ? `${text(quoted.partner_name)} · ${won(quoted.unit_price)}${quoted.price_type === 'EVENT' ? ' (행사가)' : ''}` : '금액 확인 중'}</small></div>
                    <div className="mall-qty" role="group" aria-label={`${line.name ?? '상품'} 수량`}>
                      <button type="button" aria-label="하나 빼기" onClick={() => setCartQty(line.product_id, line.qty - 1)}>−</button>
                      <input className="rd-input" type="number" min={1} step={1} value={line.qty} aria-label="수량" onChange={event => setCartQty(line.product_id, Math.max(1, Math.floor(Number(event.target.value) || 1)))} />
                      <button type="button" aria-label="하나 더하기" onClick={() => setCartQty(line.product_id, line.qty + 1)}>+</button>
                    </div>
                    <b className="mall-lines__amount">{quoted ? won(quoted.amount) : ''}</b>
                    <button type="button" className="rd-btn is-ghost" onClick={() => setCartQty(line.product_id, 0)} aria-label={`${line.name ?? '상품'} 빼기`}>빼기</button>
                  </li>
                })}
              </ul>
              {quote?.groups.map(group => group.free_shipping_left ? <p key={text(group.partner_id)} className="rd-muted rd-fs-sm">{text(group.partner_name)} 상품을 {won(group.free_shipping_left)} 더 담으면 배송비가 무료입니다.</p> : null)}
            </section>

            <section className="rd-card mall-section" aria-labelledby="mall-orderer-title">
              <h2 className="rd-h2" id="mall-orderer-title">주문자</h2>
              <div className="mall-fields">
                {field('mall-orderer-name', '이름', orderer.name, value => setOrderer(current => ({ ...current, name: value })), { required: true, maxLength: 50, autoComplete: 'name' })}
                {field('mall-orderer-phone', '연락처', orderer.phone, value => setOrderer(current => ({ ...current, phone: value })), { required: true, type: 'tel', placeholder: '010-0000-0000', maxLength: 30, autoComplete: 'tel' })}
                {field('mall-orderer-email', '이메일(선택)', orderer.email, value => setOrderer(current => ({ ...current, email: value })), { type: 'email', autoComplete: 'email' })}
              </div>
            </section>

            <section className="rd-card mall-section" aria-labelledby="mall-ship-title">
              <h2 className="rd-h2" id="mall-ship-title">배송지</h2>
              <label className="mall-check"><input type="checkbox" checked={sameAsOrderer} onChange={event => setSameAsOrderer(event.target.checked)} />받는 분이 주문자와 같음</label>
              <div className="mall-fields">
                {!sameAsOrderer ? <>
                  {field('mall-rcpt-name', '받는 분', recipient.name, value => setRecipient(current => ({ ...current, name: value })), { required: true, maxLength: 50 })}
                  {field('mall-rcpt-phone', '받는 분 연락처', recipient.phone, value => setRecipient(current => ({ ...current, phone: value })), { required: true, type: 'tel', maxLength: 30 })}
                </> : null}
                {field('mall-rcpt-zip', '우편번호', recipient.zipcode, value => setRecipient(current => ({ ...current, zipcode: value })), { required: true, maxLength: 10, autoComplete: 'postal-code' })}
                {field('mall-rcpt-addr1', '주소', recipient.address1, value => setRecipient(current => ({ ...current, address1: value })), { required: true, wide: true, maxLength: 255, autoComplete: 'address-line1' })}
                {field('mall-rcpt-addr2', '상세주소', recipient.address2, value => setRecipient(current => ({ ...current, address2: value })), { wide: true, maxLength: 255, autoComplete: 'address-line2' })}
                {field('mall-rcpt-request', '배송 요청사항', recipient.delivery_request, value => setRecipient(current => ({ ...current, delivery_request: value })), { wide: true, maxLength: 500, placeholder: '예: 경비실에 맡겨 주세요' })}
              </div>
            </section>

            <section className="rd-card mall-section" aria-labelledby="mall-pay-title">
              <h2 className="rd-h2" id="mall-pay-title">결제 방법</h2>
              <div className="mall-pay" role="radiogroup" aria-label="결제 방법">
                {buyerType === 'ACCOUNT' ? <label className={`mall-pay__option${effectiveMethod === 'CREDIT' ? ' is-active' : ''}${creditAllowed ? '' : ' is-disabled'}`}>
                  <input type="radio" name="mall-pay" checked={effectiveMethod === 'CREDIT'} disabled={!creditAllowed} onChange={() => setMethod('CREDIT')} />
                  <span><b>후불(월말 청구)</b><small>{creditAllowed ? '거래처 앞으로 월말 청구서에 포함됩니다.' : creditReason || '후불을 쓸 수 없습니다.'}</small></span>
                </label> : null}
                <label className={`mall-pay__option${effectiveMethod === 'BANK_TRANSFER' ? ' is-active' : ''}`}>
                  <input type="radio" name="mall-pay" checked={effectiveMethod === 'BANK_TRANSFER'} onChange={() => setMethod('BANK_TRANSFER')} />
                  <span><b>무통장 입금</b><small>{context?.deposit ? `${text(context.deposit.bank_name)} ${text(context.deposit.account_no)} (${text(context.deposit.holder)}) · 주문 후 ${text(context.deposit.due_days)}일 안에` : '본사가 입금 계좌를 아직 등록하지 않았습니다.'}</small></span>
                </label>
                <label className="mall-pay__option is-disabled"><input type="radio" name="mall-pay" disabled /><span><b>카드</b><small>준비 중입니다.</small></span></label>
              </div>
              {effectiveMethod === 'BANK_TRANSFER' ? <div className="mall-fields">
                {field('mall-depositor', '입금자명', depositor, setDepositor, { placeholder: orderer.name || '비우면 주문자 이름', maxLength: 50 })}
              </div> : null}
              <div className="mall-field is-wide"><label htmlFor="mall-note">요청사항(본사에 전달)</label>
                <textarea id="mall-note" className="rd-input" rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></div>
              {buyerType === 'PERSONAL' ? <div className="mall-consent">
                <label className="mall-check"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /><b>개인정보 수집·이용에 동의합니다(필수)</b></label>
                <p className="rd-muted rd-fs-sm">수집 항목: 이름·연락처·이메일·배송지 / 목적: 주문 처리·배송·상담 / 보관: 전자상거래법에 따라 5년(대금 결제·재화 공급 기록) 후 파기.
                  배송을 위해 협력사(산지)에 받는 분 이름·연락처·주소가 전달됩니다.</p>
              </div> : null}
            </section>
          </div>

          <aside className="rd-card mall-summary" aria-labelledby="mall-summary-title">
            <h2 className="rd-h2" id="mall-summary-title">결제 금액</h2>
            {quote ? <dl className="mall-dl">
              <div><dt>상품 합계</dt><dd>{won(quote.item_amount)}</dd></div>
              <div><dt>배송비</dt><dd>{won(quote.shipping_fee)}</dd></div>
              {quote.groups.length > 1 ? quote.groups.map(group => <div key={text(group.partner_id)} className="is-sub"><dt>{text(group.partner_name)}</dt><dd>{won(group.shipping_fee)}</dd></div>) : null}
              <div className="is-total"><dt>합계</dt><dd>{won(quote.total_amount)}</dd></div>
              <div className="is-sub"><dt>과세 공급가 · 부가세</dt><dd>{won(quote.taxable_amount)} · {won(quote.vat_amount)}</dd></div>
              {Number(quote.tax_free_amount) > 0 ? <div className="is-sub"><dt>면세</dt><dd>{won(quote.tax_free_amount)}</dd></div> : null}
            </dl> : <p className="rd-muted">{quoteError ? '금액을 계산할 수 없습니다.' : '금액 계산 중…'}</p>}
            <p className="rd-muted rd-fs-sm">{BUYER_LABEL[buyerType]} · {effectiveMethod === 'CREDIT' ? '후불' : '무통장 입금'}{quote ? ` · ${num(cart.lines.reduce((sum, line) => sum + line.qty, 0))}개` : ''}</p>
            {missing.length ? <p className="rd-muted rd-fs-sm" id="mall-missing">입력 필요: {missing.join(', ')}</p> : null}
            <button type="button" className="rd-btn is-primary mall-submit" disabled={busy || !quote || missing.length > 0 || context?.order_ready === false}
              aria-describedby={missing.length ? 'mall-missing' : undefined} onClick={() => void submit()}>
              {busy ? '주문하는 중…' : quote ? `${won(quote.total_amount)} 주문하기` : '주문하기'}</button>
          </aside>
        </div>}
    </div>
  </MallLayout>
}

