import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Payment.css'

function PaymentResult() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])

  const pathname = location.pathname
  const isBilling = pathname.startsWith('/billing')
  const isSuccess = pathname.endsWith('/success')

  const title = isBilling
    ? isSuccess
      ? '자동이체 등록 요청이 완료되었습니다'
      : '자동이체 등록 요청이 실패했습니다'
    : isSuccess
      ? '결제 요청이 접수되었습니다'
      : '결제 요청이 실패했습니다'

  const note = isBilling
    ? '등록 성공 후에는 서버에서 authKey 검증과 빌링키 발급 API를 호출해야 실제 자동결제가 가능합니다.'
    : '결제 성공 화면에 도착해도 서버에서 paymentKey, orderId, amount를 검증하고 승인 API를 호출해야 최종 완료됩니다.'

  const entries = [
    ['accountId', searchParams.get('accountId') ?? '-'],
    ['status', searchParams.get('status') ?? '-'],
    ['paymentKey', searchParams.get('paymentKey') ?? '-'],
    ['orderId', searchParams.get('orderId') ?? '-'],
    ['amount', searchParams.get('amount') ?? '-'],
    ['authKey', searchParams.get('authKey') ?? '-'],
    ['customerKey', searchParams.get('customerKey') ?? '-'],
    ['code', searchParams.get('code') ?? '-'],
    ['message', searchParams.get('message') ?? '-'],
  ].filter(([, value]) => value !== '-')

  return (
    <main className="result-page">
      <section className="result-card">
        <p className="result-kicker">{isBilling ? 'Billing Redirect' : 'Payment Redirect'}</p>
        <span className={`result-status${isSuccess ? '' : ' is-fail'}`}>{isSuccess ? 'SUCCESS' : 'FAIL'}</span>
        <h1>{title}</h1>
        <p>{isBilling ? '빌링 등록창' : '결제창'}에서 돌아온 파라미터를 확인할 수 있는 임시 결과 화면입니다.</p>

        <dl className="result-grid">
          {entries.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="result-note">{note}</div>

        <div className="result-actions">
          <button type="button" className="result-button is-secondary" onClick={() => navigate('/')}>
            로그인으로 이동
          </button>
          <button type="button" className="result-button" onClick={() => navigate('/payment')}>
            결제 화면으로 돌아가기
          </button>
        </div>
      </section>
    </main>
  )
}

export default PaymentResult
