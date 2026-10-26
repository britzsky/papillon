import { useEffect, useState, useSyncExternalStore } from 'react'
import LoadingScreen from './LoadingScreen'
import logo from '../assets/logo/thefull.png'
import { getLoadingSnapshot, subscribeLoading } from '../api/requestLoading'
import './GlobalLoading.css'

const SHOW_AFTER_MS = 250

/** 아주 짧은 요청은 표시하지 않도록 일정 시간 이상 계속될 때만 true */
function useDelayed(active: boolean) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(active), active ? SHOW_AFTER_MS : 0)
    return () => window.clearTimeout(timer)
  }, [active])
  return active && shown
}

/** 조회 중: 상단 진행률 막대. 끝으로 갈수록 느려지다가 끝나면 100%로 채우고 사라진다. */
function TopProgress({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (active) {
      const start = window.setTimeout(() => { setVisible(true); setProgress(current => Math.max(current, 10)) }, 0)
      const timer = window.setInterval(() => setProgress(current => current >= 90 ? current : current + Math.max(1, (90 - current) * 0.1)), 200)
      return () => { window.clearTimeout(start); window.clearInterval(timer) }
    }
    const fill = window.setTimeout(() => setProgress(current => current > 0 ? 100 : 0), 0)
    const hide = window.setTimeout(() => { setVisible(false); setProgress(0) }, 300)
    return () => { window.clearTimeout(fill); window.clearTimeout(hide) }
  }, [active])
  if (!visible) return null
  // 맨 위 가는 막대 + 가운데 위 로고 카드(사이드 메뉴 로고와 같은 크기, 2026-10-26). 화면은 막지 않는다
  return <>
    <div className="global-loading-bar" role="progressbar" aria-label="조회 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <span style={{ width: `${progress}%` }} />
    </div>
    <div className="global-loading-chip" aria-hidden="true">
      <img src={logo} alt="" />
      <span className="global-loading-chip__track"><span style={{ width: `${progress}%` }} /></span>
    </div>
  </>
}

/**
 * 앱 전체 로딩 표시. 조회는 화면을 막지 않는 상단 막대, 저장·발주 같은 처리는 진행률 로딩 화면.
 * 화면이 자체 로딩 화면(예: 발주 전송 안내)을 띄운 동안에는 겹쳐 띄우지 않는다.
 */
export default function GlobalLoading() {
  const { read, write } = useSyncExternalStore(subscribeLoading, getLoadingSnapshot)
  const reading = useDelayed(read > 0)
  const writing = useDelayed(write > 0)
  const ownOverlay = writing && typeof document !== 'undefined' && Boolean(document.querySelector('.loading-screen.is-overlay:not(.global-loading-overlay .loading-screen)'))
  return <>
    {/* 처리 중에는 로딩 화면에 진행률이 있으므로 상단 막대는 겹쳐 띄우지 않는다 */}
    <TopProgress active={reading && !writing} />
    {writing && !ownOverlay && <div className="global-loading-overlay"><LoadingScreen overlay message="처리 중입니다." /></div>}
  </>
}
