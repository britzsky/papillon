import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loadTossPayments } from '../api/payment'
import {
  DEFAULT_SUBSCRIPTION_AMOUNT,
  TOSS_PAYMENTS_CLIENT_KEY,
  TOSS_PAYMENTS_STORE_NAME,
  getPaymentBaseUrl,
} from '../config/payment'
import './Payment.css'

type PaymentLocationState = {
  accountId?: string
  status?: string
}

type PaymentMethodOption = 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT' | 'AUTO_CARD' | 'AUTO_TRANSFER'

const PAYMENT_REASON_LABELS: Record<string, string> = {
  EMPTY: '구독 내역 없음',
  EXPIRED: '구독 기간 만료',
  CANCELED: '구독 해지',
}

const PAYMENT_METHODS: Array<{
  id: PaymentMethodOption
  title: string
  description: string
  badge?: string
}> = [
  {
    id: 'CARD',
    title: '카드결제',
    description: '토스 결제창에서 카드 결제를 진행합니다.',
  },
  {
    id: 'TRANSFER',
    title: '계좌이체',
    description: '실시간 계좌이체 결제를 요청합니다.',
  },
  {
    id: 'VIRTUAL_ACCOUNT',
    title: '가상계좌',
    description: '가상계좌를 발급받고 입금으로 결제를 완료합니다.',
  },
  {
    id: 'AUTO_CARD',
    title: '자동이체 등록',
    description: '카드 기반 자동결제를 위한 빌링 등록창을 엽니다.',
    badge: '추가 계약 필요',
  },
  {
    id: 'AUTO_TRANSFER',
    title: '계좌 자동이체 등록',
    description: '계좌 기반 자동결제를 위한 빌링 등록창을 엽니다.',
    badge: '추가 계약 필요',
  },
]

function createOrderId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24)
  }

  return `ORDER${Date.now()}`
}

function createCustomerKey(userId: string, accountId: string) {
  const base = `${userId || accountId || 'guest'}-${accountId || 'account'}`
  return base.replace(/[^A-Za-z0-9\-_.=@]/g, '').slice(0, 50) || `guest-${Date.now()}`
}

function Payment() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as PaymentLocationState | null) ?? null

  const accountId =
    state?.accountId ??
    (typeof window !== 'undefined' ? localStorage.getItem('pending_payment_account_id') ?? '' : '')
  const status =
    state?.status ?? (typeof window !== 'undefined' ? localStorage.getItem('pending_payment_status') ?? '' : '')
  const userName = typeof window !== 'undefined' ? localStorage.getItem('user_name') ?? '' : ''
  const userId = typeof window !== 'undefined' ? localStorage.getItem('user_id') ?? '' : ''

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodOption>('CARD')
  const [customerName, setCustomerName] = useState(userName)
  const [customerEmail, setCustomerEmail] = useState('')
  const [amount, setAmount] = useState(DEFAULT_SUBSCRIPTION_AMOUNT)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pageMessage, setPageMessage] = useState('')

  const reasonLabel = useMemo(() => PAYMENT_REASON_LABELS[status] ?? '결제 필요 상태', [status])

  const customerKey = useMemo(() => createCustomerKey(userId, accountId), [accountId, userId])

  const handleRequestPayment = async () => {
    if (amount <= 0 || Number.isNaN(amount)) {
      setPageMessage('결제 금액을 확인해주세요.')
      return
    }

    if (customerName.trim() === '') {
      setPageMessage('구매자명을 입력해주세요.')
      return
    }

    try {
      setIsSubmitting(true)
      setPageMessage('')

      const tossPayments = await loadTossPayments(TOSS_PAYMENTS_CLIENT_KEY)
      const payment = tossPayments.payment({
        customerKey,
      })

      const baseUrl = getPaymentBaseUrl()
      const orderId = createOrderId()
      const orderName = `${TOSS_PAYMENTS_STORE_NAME} 구독 결제`

      if (selectedMethod === 'AUTO_CARD' || selectedMethod === 'AUTO_TRANSFER') {
        await payment.requestBillingAuth({
          method: selectedMethod === 'AUTO_CARD' ? 'CARD' : 'TRANSFER',
          customerName,
          customerEmail: customerEmail || undefined,
          successUrl: `${baseUrl}/billing/success?accountId=${encodeURIComponent(accountId)}`,
          failUrl: `${baseUrl}/billing/fail?accountId=${encodeURIComponent(accountId)}`,
          windowTarget: 'self',
        })
        return
      }

      await payment.requestPayment({
        method: selectedMethod,
        amount: {
          currency: 'KRW',
          value: amount,
        },
        orderId,
        orderName,
        customerName,
        customerEmail: customerEmail || undefined,
        successUrl: `${baseUrl}/payment/success?accountId=${encodeURIComponent(accountId)}&status=${encodeURIComponent(
          status,
        )}`,
        failUrl: `${baseUrl}/payment/fail?accountId=${encodeURIComponent(accountId)}&status=${encodeURIComponent(
          status,
        )}`,
        windowTarget: 'self',
        metadata: {
          accountId,
          subscriptionStatus: status,
          selectedMethod,
        },
      })
    } catch (error) {
      setPageMessage(error instanceof Error ? error.message : '결제 요청을 시작하지 못했습니다.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="payment-page">
      <section className="payment-shell">
        <div className="payment-hero">
          <div>
            <p className="payment-kicker">TossPayments Sandbox Ready</p>
            <h1>결제 진행 화면</h1>
            <p className="payment-summary">
              카드결제, 계좌이체, 가상계좌는 토스 결제창 호출 구조로 연결되어 있습니다. 자동이체는 빌링 등록창
              연결까지 포함했고, 실제 승인과 정기 청구는 서버 연동이 추가로 필요합니다.
            </p>
          </div>
          <span className="payment-badge">{reasonLabel}</span>
        </div>

        <section className="payment-card payment-overview">
          <div>
            <p className="payment-label">거래처 코드</p>
            <strong>{accountId || '확인되지 않음'}</strong>
          </div>
          <div>
            <p className="payment-label">상태 코드</p>
            <strong>{status || 'UNKNOWN'}</strong>
          </div>
          <div>
            <p className="payment-label">구매자 키</p>
            <strong>{customerKey}</strong>
          </div>
          <div>
            <p className="payment-label">기본 금액</p>
            <strong>{amount.toLocaleString('ko-KR')}원</strong>
          </div>
        </section>

        <section className="payment-grid">
          <article className="payment-card">
            <div className="section-head">
              <div>
                <p className="section-kicker">Step 1</p>
                <h2>결제 수단 선택</h2>
              </div>
            </div>

            <div className="method-grid">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className={`method-card${selectedMethod === method.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedMethod(method.id)}
                >
                  <div className="method-card__head">
                    <strong>{method.title}</strong>
                    {method.badge ? <span>{method.badge}</span> : null}
                  </div>
                  <p>{method.description}</p>
                </button>
              ))}
            </div>
          </article>

          <article className="payment-card">
            <div className="section-head">
              <div>
                <p className="section-kicker">Step 2</p>
                <h2>결제 정보 입력</h2>
              </div>
            </div>

            <div className="payment-form">
              <label>
                구매자명
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="구매자명" />
              </label>
              <label>
                이메일
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="billing@example.com"
                />
              </label>
              <label>
                결제 금액
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="payment-inline-note">
              <strong>현재 선택:</strong> {PAYMENT_METHODS.find((method) => method.id === selectedMethod)?.title}
            </div>

            <div className="payment-note-box">
              <p>
                카드/계좌이체/가상계좌는 결제 성공 후 반드시 서버에서 승인 API를 호출해야 최종 완료됩니다.
              </p>
              <p>자동이체는 등록 성공 후 빌링키 발급과 정기 결제 승인 API가 추가로 필요합니다.</p>
            </div>
          </article>
        </section>

        <section className="payment-card payment-note">
          <h2>연동 메모</h2>
          <ul className="payment-bullets">
            <li>토스페이먼츠 클라이언트 키는 `VITE_TOSS_PAYMENTS_CLIENT_KEY` 환경변수로 읽습니다.</li>
            <li>자동이체 기능은 토스 추가 계약이 있어야 실사용 가능합니다.</li>
            <li>지금 화면은 프론트 결제창 호출과 결과 확인 흐름까지 우선 연결한 상태입니다.</li>
          </ul>
        </section>

        {pageMessage ? <p className="payment-page-message">{pageMessage}</p> : null}

        <div className="payment-actions">
          <button type="button" className="payment-button is-secondary" onClick={() => navigate('/')}>
            로그인으로 돌아가기
          </button>
          <button type="button" className="payment-button" onClick={handleRequestPayment} disabled={isSubmitting}>
            {isSubmitting ? '결제창 연결중...' : '결제 계속하기'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default Payment
