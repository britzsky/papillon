import { Link } from 'react-router-dom'
import { useShortcutLinks } from '../features/home/shortcuts'
import { LOGIN_REQUIRED_TITLE, guestCanOpen, useSignedIn } from '../features/auth/session'

/**
 * 새 홈 바로가기(2026-11-09 사용자 요청, 물방울 모양 · 2026-11-10 시안: 주황부터 주황/파랑 번갈아).
 * 관리 거래처(account_id)는 상단 메뉴와 같은 규칙으로 들고 간다.
 * 로그인 전(손님)에는 보이기만 하고 누를 수 없다 — 더채움몰만 열림(2026-11-12 사용자 요청).
 */
export default function HomeShortcuts() {
  const items = useShortcutLinks()
  const signedIn = useSignedIn()

  return (
    <nav className="home-shortcuts" aria-label="바로가기 메뉴">
      {items.map((item, index) => {
        const color = index % 2 ? ' is-blue' : ' is-orange'
        const body = <>
          <span className="home-shortcuts__drop">{item.icon}</span>
          <span className="home-shortcuts__label">{item.label}</span>
        </>
        return signedIn || guestCanOpen(item.to)
          ? <Link key={item.key} to={item.to} className={`home-shortcuts__item${color}`}>{body}</Link>
          : <span key={item.key} className={`home-shortcuts__item${color} is-locked`} aria-disabled="true" title={LOGIN_REQUIRED_TITLE}>
            {body}<span className="rd-sr-only"> (로그인 후 이용)</span>
          </span>
      })}
    </nav>
  )
}
