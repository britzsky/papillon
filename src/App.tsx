import logo from './assets/image/thefull_sign_1.png'
import { useLogin } from './features/auth/useLogin'
import './App.css'

/** 로그인(PC). 로직은 features/auth/useLogin(터치 로그인과 공용). */
function App() {
  const { user_id, setUserId, password, setPassword, isLoading, alertState, closeAlert, handleMoveToPayment, handleOpenPaymentSandbox, handleSubmit } = useLogin()

  return (
    <main className="login-page">
      {alertState ? (
        <div className="alert-backdrop" role="presentation" onClick={closeAlert}>
          <section
            className="alert-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="login-alert-title"
            aria-describedby="login-alert-message"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`alert-icon${alertState.kind === 'payment' ? ' is-payment' : ''}`} aria-hidden="true">
              {alertState.kind === 'payment' ? '₩' : '!'}
            </div>
            <h2 id="login-alert-title">
              {alertState.kind === 'payment' ? '결제 진행 안내' : '로그인 안내'}
            </h2>
            <p id="login-alert-message">{alertState.message}</p>
            <div className="alert-actions">
              {alertState.kind === 'payment' ? (
                <>
                  <button type="button" className="alert-button is-secondary" onClick={closeAlert}>
                    나중에
                  </button>
                  <button type="button" className="alert-button" onClick={handleMoveToPayment}>
                    결제하러 가기
                  </button>
                </>
              ) : (
                <button type="button" className="alert-button" onClick={closeAlert}>
                  확인
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <section className="login-panel">
        <img src={logo} alt="logo" className="logo" />

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            id="id"
            type="text"
            name="id"
            placeholder="아이디"
            value={user_id}
            onChange={(e) => setUserId(e.target.value)}
            required
          />

          <input
            id="password"
            type="password"
            name="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="login-options">
            <a href="/">비밀번호 찾기</a>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading ? '로그인 시도중...' : '로그인'}
          </button>
        </form>

        <div className="login-test-tools">
          <p>토스 샌드박스 결제창만 빠르게 확인할 때 쓰는 테스트 진입입니다.</p>
          <button type="button" className="login-test-button" onClick={handleOpenPaymentSandbox}>
            결제 테스트 화면 바로가기
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
