import { Link } from 'react-router-dom'
import { useShortcutLinks } from '../features/home/shortcuts'

/**
 * 새 홈 바로가기(2026-11-09 사용자 요청, 물방울 모양 · 2026-11-10 시안: 주황부터 주황/파랑 번갈아).
 * 관리 거래처(account_id)는 상단 메뉴와 같은 규칙으로 들고 간다.
 */
export default function HomeShortcuts() {
  const items = useShortcutLinks()

  return (
    <nav className="home-shortcuts" aria-label="바로가기 메뉴">
      {items.map((item, index) => (
        <Link key={item.key} to={item.to} className={`home-shortcuts__item${index % 2 ? ' is-blue' : ' is-orange'}`}>
          <span className="home-shortcuts__drop">{item.icon}</span>
          <span className="home-shortcuts__label">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
