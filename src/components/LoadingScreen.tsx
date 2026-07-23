import logo from '../assets/image/thefull_sign_1.png'
import './LoadingScreen.css'

type LoadingScreenProps = {
  message?: string
  compact?: boolean
}

function LoadingScreen({ message = '조회 중입니다.', compact = false }: LoadingScreenProps) {
  return (
    <div className={`loading-screen${compact ? ' is-compact' : ''}`} role="status" aria-live="polite">
      <div className="loading-screen__panel">
        <img src={logo} alt="The Full" className="loading-screen__logo" />
        <div className="loading-screen__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>{message}</p>
      </div>
    </div>
  )
}

export default LoadingScreen
