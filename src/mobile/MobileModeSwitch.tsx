import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { MOBILE_ROUTES, getUiModePreference, isTouchDevice, setUiModePreference } from './deviceMode'
import './MobileModeSwitch.css'

/**
 * PC 주소에서 모바일 화면으로의 자동 전환(터치 기기)과 '모바일 화면' 버튼.
 * 모바일 화면이 있는 주소(MOBILE_ROUTES)에서만 동작한다.
 */
export default function MobileModeSwitch() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const mobilePath = MOBILE_ROUTES[pathname]
  const touch = isTouchDevice()
  const preference = getUiModePreference()

  if (!mobilePath) return null
  if (preference === 'mobile' || (touch && preference !== 'pc')) return <Navigate to={`${mobilePath}${search}`} replace />
  if (!touch) return null
  return <button type="button" className="mobile-mode-switch" onClick={() => { setUiModePreference('mobile'); navigate(`${mobilePath}${search}`) }}>
    모바일 화면
  </button>
}
