import { useEffect, useState } from 'react'
import logo from '../assets/image/thefull_sign_1.png'
import './LoadingScreen.css'

type LoadingScreenProps = {
  message?: string
  compact?: boolean
  overlay?: boolean
  progress?: number
}

function LoadingScreen({ message = '조회 중입니다.', compact = false, overlay = false, progress }: LoadingScreenProps) {
  const [estimatedProgress, setEstimatedProgress] = useState(8)

  useEffect(() => {
    if (progress !== undefined) return

    const timer = window.setInterval(() => {
      setEstimatedProgress((current) => {
        if (current >= 92) return current
        const remaining = 92 - current
        return Math.min(92, current + Math.max(1, Math.ceil(remaining * 0.08)))
      })
    }, 450)

    return () => window.clearInterval(timer)
  }, [progress])

  const displayedProgress = Math.round(Math.min(100, Math.max(0, progress ?? estimatedProgress)))

  return (
    <div
      className={`loading-screen${compact ? ' is-compact' : ''}${overlay ? ' is-overlay' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${message} ${displayedProgress}%`}
    >
      <div className="loading-screen__panel">
        <img src={logo} alt="The Full" className="loading-screen__logo" />
        <p>{message}</p>
        <div className="loading-screen__progress-row">
          <div
            className="loading-screen__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayedProgress}
          >
            <span style={{ width: `${displayedProgress}%` }} />
          </div>
          <strong>{displayedProgress}%</strong>
        </div>
        <small>잠시만 기다려주세요.</small>
      </div>
    </div>
  )
}

export default LoadingScreen
