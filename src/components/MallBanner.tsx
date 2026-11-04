import { Link } from 'react-router-dom'
import './MallBanner.css'

/**
 * 홈 → 더채움몰 입구 띠 배너(2026-11-03 사용자 요청). 더채움몰은 따로 운영되는 쇼핑몰처럼 별도 화면(/mall)으로 열리고,
 * 몰 맨 위 오른쪽 '발주 프로그램 가기'로 돌아온다. 홈이 한 화면에 들어가도록 한 줄 높이로만.
 */
export default function MallBanner({ compact = false }: { compact?: boolean }) {
  return <Link to="/mall" className={`mall-banner${compact ? ' is-compact' : ''}`} aria-label="더채움몰 가기 — 산지 직송 기획전">
    <span className="mall-banner__logo" aria-hidden="true">더채움<b>몰</b></span>
    <span className="mall-banner__text"><strong>산지 직송 기획전 진행 중</strong><small>협력사 신선 식자재·더채움 상품을 바로 주문하세요</small></span>
    <span className="mall-banner__go" aria-hidden="true">채움몰 가기 →</span>
  </Link>
}
