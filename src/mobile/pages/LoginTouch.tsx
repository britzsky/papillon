import logo from '../../assets/logo/thefull.png'
import { useLogin } from '../../features/auth/useLogin'
import { useTouchBody } from '../useTouchBody'
import '../TouchLayout.css'
import './LoginTouch.css'

/** 로그인(태블릿·휴대폰): 큰 입력칸·버튼, 결제 안내는 가운데 창. 로직은 PC 로그인과 같은 useLogin. */
export default function LoginTouch() {
  useTouchBody()
  const l = useLogin()
  return <main className="lg-page">
    <section className="lg-card">
      <img src={logo} alt="더채움" className="lg-logo" />
      <p>식단 · 발주 · 재고를 한 곳에서</p>
      <form className="lg-form" onSubmit={l.handleSubmit}>
        <label className="lg-field">아이디<input type="text" name="id" autoComplete="username" value={l.user_id} onChange={e => l.setUserId(e.target.value)} required /></label>
        <label className="lg-field">비밀번호<input type="password" name="password" autoComplete="current-password" value={l.password} onChange={e => l.setPassword(e.target.value)} required /></label>
        <button type="submit" className="t-btn is-primary is-large is-block" disabled={l.isLoading}>{l.isLoading ? '로그인 중…' : '로그인'}</button>
      </form>
      <button type="button" className="t-btn is-ghost is-small lg-test" onClick={l.handleOpenPaymentSandbox}>결제 테스트 화면</button>
    </section>

    {l.alertState && <div className="t-sheet-backdrop" role="presentation" onClick={l.closeAlert}>
      <section className="t-sheet lg-alert" role="alertdialog" aria-modal="true" aria-labelledby="lg-alert-title" onClick={e => e.stopPropagation()}>
        <div className="t-sheet__body">
          <span className={`lg-alert__icon${l.alertState.kind === 'payment' ? ' is-payment' : ''}`} aria-hidden="true">{l.alertState.kind === 'payment' ? '₩' : '!'}</span>
          <h2 id="lg-alert-title">{l.alertState.kind === 'payment' ? '결제 진행 안내' : '로그인 안내'}</h2>
          <p>{l.alertState.message}</p>
        </div>
        <footer className="t-sheet__actions">
          {l.alertState.kind === 'payment'
            ? <><button type="button" className="t-btn is-large" onClick={l.closeAlert}>나중에</button><button type="button" className="t-btn is-primary is-large" onClick={l.handleMoveToPayment}>결제하러 가기</button></>
            : <button type="button" className="t-btn is-primary is-large" onClick={l.closeAlert}>확인</button>}
        </footer>
      </section>
    </div>}
  </main>
}
