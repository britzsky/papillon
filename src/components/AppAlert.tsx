import { useEffect, useRef } from 'react'
import { showAlert } from '../utils/dialog'

export type AppAlertState = {
  type: 'success' | 'error'
  title: string
  message: string
}

type AppAlertProps = {
  alert: AppAlertState | null
  onClose: () => void
}

/**
 * 알림 창. 2026-11-17부터 sweetalert2 창으로 띄운다(utils/dialog showAlert).
 * 쓰는 쪽(alert 상태 + onClose)은 예전 그대로 — 상태가 생기면 창을 띄우고, 확인을 누르면 onClose.
 */
function AppAlert({ alert, onClose }: AppAlertProps) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!alert) return
    let active = true
    void showAlert(alert.type, alert.title, alert.message).then(() => { if (active) close.current() })
    return () => { active = false }
  }, [alert])
  return null
}

export default AppAlert
