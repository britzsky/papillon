import { useEffect, useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { isHeadquarters, workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { useAccountSummaryResult } from '../../features/workspace/useAccountSummary'
import { useSignedIn } from '../../features/auth/session'
import { useLogin } from '../../features/auth/useLogin'
import { clearSplashFlag } from '../../features/home/homeReady'
import { HQ_CONTACT } from '../../features/home/hqContact'
import { heroSlides, photoCards, pressArticles } from '../../features/home/homeContent'
import HeroSlider, { BrandCurves } from '../../components/HeroSlider'
import NoticeBoard from '../../components/NoticeBoard'
import InstagramGrid from '../../components/InstagramGrid'
import HomePhotoCards from '../../components/HomePhotoCards'
import bannerImage from '../../assets/image/3.png'
import '../../pages/HomeMain.css'
import './HomeTouch.css'
import { SHOW_MALL } from '../../features/mall/mallVisibility'
import HomeProfileCard from '../../components/HomeProfileCard'


/**
 * 터치 홈(2026-11-12 사용자 요청: m버전도 PC 홈 구성처럼, 터치의 직관성은 유지).
 * 순서: 접속자 카드(인사·거래처·담당자·이름 옆 로그아웃·이달 예산 / 로그인 전엔 로그인 칸) → '다음 할 일' 큰 버튼(카드 밑, 사용자 결정)
 * → 바로가기 물방울(PC와 같은 HomeShortcuts) → 통합 검색 → 이번 주 식단표(현장) → 오늘 할 일 칸 → 슬라이드·더채움 소식·인스타그램·사진·배너(PC 부품 그대로).
 * 업무가 먼저, 홍보는 아래(휴대폰은 좁아서). 로그인 전에는 업무 조회를 하지 않는다. 조회·계산은 PC와 같은 useDailyWork.
 */
/** 태블릿(700px 이상 — 아이패드 미니 6세대 744px 포함, 2026-11-23) 여부 — 화면을 열 때 한 번만 정한다(deviceMode와 같은 원칙) */
const isTabletWidth = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 700px)').matches

export default function HomeTouch() {
  // 로그인 직후 준비 화면 표시는 PC 홈(pages/Home)만 쓰므로 여기선 지운다(세션 확인 중에는 WorkspaceBoundary가 보여 줌)
  useEffect(() => { clearSplashFlag() }, [])
  const [tablet] = useState(isTabletWidth)
  const signedIn = useSignedIn()
  if (tablet) return <TabletHome signedIn={signedIn} />
  return <PhoneHome signedIn={signedIn} />
}

/** 바로가기 4칸(휴대폰 홈, 2026-11-23 사용자 시안) — 묶음의 첫 화면으로 */
const PHONE_SHORTCUTS: { label: string; icon: TouchIconName; to: string }[] = [
  { label: '운영관리', icon: 'meals', to: '/operations/table-meals' },
  { label: '발주관리', icon: 'order', to: '/order_manager/order' },
  { label: '재고관리', icon: 'inventory', to: '/inventory/account' },
  { label: '위생관리', icon: 'sanitation', to: '/sanitation/vendor' },
]

/**
 * 휴대폰 홈(2026-11-23 사용자 시안): 작은 거래처 이름 + '안녕하세요, 이름 님' → 거래처 카드(담당자·본사 담당자) → 바로가기 2×2 → 슬라이드 → 더채움 소식.
 * 아래 물방울 메뉴는 틀(TouchLayout)이 모든 화면에 붙인다. 로그인 전에는 거래처 카드 자리에 로그인 칸.
 */
function PhoneHome({ signedIn }: { signedIn: boolean }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const account = workspaceAccountId(params)
  const { data: summary } = useAccountSummaryResult(signedIn ? account : '')
  const userName = summary?.user_name || localStorage.getItem('user_name') || ''
  const accountName = summary?.account_name || localStorage.getItem('account_name') || ''
  return <TouchLayout title={signedIn ? `안녕하세요${userName ? `, ${userName} 님` : ''}` : '안녕하세요'} eyebrow={signedIn ? accountName || '홈' : '더채움'} hideAccount={!isHeadquarters()}>
    {signedIn ? <section className="t-card mh-account" aria-label="거래처 정보">
      <header><strong>{accountName || (isHeadquarters() ? '거래처를 고르세요' : '내 거래처')}</strong><span className="mh-badge">{isHeadquarters() ? '본사' : '담당자'}</span></header>
      {account ? <dl>
        <div><dt>{summary?.manager_name || '담당자'}</dt><dd>{summary?.manager_tel || (summary ? '연락처 없음' : '확인 중')}</dd></div>
        <div><dt>더채움 담당자 {HQ_CONTACT.name}</dt><dd>{HQ_CONTACT.tel}</dd></div>
      </dl> : <p className="mh-muted">위에서 거래처를 고르면 담당자 정보가 보입니다.</p>}
    </section> : <LoginCard />}
    <nav className="mh-shortcuts" aria-label="바로가기">
      {PHONE_SHORTCUTS.map(item => <button key={item.to} type="button" className="mh-shortcut" disabled={!signedIn}
        onClick={() => navigate(account ? `${item.to}?${new URLSearchParams({ account_id: account })}` : item.to)}>
        <TouchIcon name={item.icon} size={18} /><span>{item.label}</span><TouchIcon name="chevronRight" size={16} />
      </button>)}
    </nav>
    <div className="rd ht-pc mh-stories">
      <HeroSlider className="home-main__hero" slides={heroSlides} />
      <NoticeBoard press={pressArticles} />
    </div>
  </TouchLayout>
}

/**
 * 태블릿 홈(2026-11-23 사용자 시안): 위 메뉴(TouchLayout) 아래 PC 홈과 같은 부품을 시안 배치로 —
 * 슬라이드 | 접속자 카드(인사·거래처·담당자·알림 종·이달 예산, 로그인 전엔 로그인 칸) → 더채움 소식 | 인스타그램 사진 → 사진 3장 → 배너.
 * 바로가기 물방울은 위 메뉴가 대신하므로 뺀다. '오늘 할 일' 업무 칸은 2026-11-23 사용자 요청으로 태블릿 홈에서 뺌(휴대폰 홈은 그대로).
 */
function TabletHome({ signedIn }: { signedIn: boolean }) {
  const [params] = useSearchParams()
  const account = workspaceAccountId(params)
  return <TouchLayout title="홈" subtitle={signedIn ? undefined : '로그인하고 이용해 주세요'}>
    <div className="rd ht-pc ht-tab"><div className="home-main">
      <div className="home-main__hero-row">
        <HeroSlider className="home-main__hero" slides={heroSlides} />
        <HomeProfileCard key={account} accountId={account} className="home-main__account" />
      </div>
      <div className="home-main__lower">
        <NoticeBoard press={pressArticles} />
        <InstagramGrid count={2} />
      </div>
      <HomePhotoCards photos={photoCards} />
      <figure className="home-main__banner">
        <img src={bannerImage} alt="" />
        <BrandCurves variant="banner" />
      </figure>
    </div></div>
  </TouchLayout>
}


const Avatar = () => <span className="ht-profile__avatar" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.6" r="4.2" /><path d="M3.4 24v-2.6c.7-4.7 4.2-7.8 8.6-7.8s7.9 3.1 8.6 7.8V24z" /></svg>
</span>

/** 로그인 전 카드: 예산 자리에 아이디·비밀번호(따로 있던 터치 로그인 화면 대신, 2026-11-12) */
function LoginCard() {
  const { user_id, setUserId, password, setPassword, isLoading, alertState, closeAlert, handleMoveToPayment, handleSubmit } = useLogin()
  const id = useId()
  return <section className="t-card ht-profile is-guest" aria-labelledby={`${id}-title`}>
    <div className="ht-profile__head">
      <Avatar />
      <div className="ht-profile__text">
        <p className="ht-profile__hello">안녕하세요.</p>
        <p id={`${id}-title`} className="ht-profile__who"><strong>더채움 발주 프로그램 로그인</strong></p>
        <p className="ht-profile__contact">로그인하면 거래처 정보와 이달 예산이 보입니다.</p>
      </div>
    </div>
    <form className="ht-login" onSubmit={handleSubmit}>
      <label className="ht-login__field">아이디
        <input type="text" name="id" autoComplete="username" required value={user_id}
          onChange={event => { setUserId(event.target.value); if (alertState?.kind === 'info') closeAlert() }} />
      </label>
      <label className="ht-login__field">비밀번호
        <input type="password" name="password" autoComplete="current-password" required value={password}
          onChange={event => { setPassword(event.target.value); if (alertState?.kind === 'info') closeAlert() }} />
      </label>
      <button type="submit" className="t-btn is-large is-block ht-login__btn" disabled={isLoading}>{isLoading ? '로그인 중…' : '로그인'}</button>
      {alertState ? <p className="ht-login__msg" role="alert">
        {alertState.message}
        {alertState.kind === 'payment' ? <button type="button" className="t-btn is-small" onClick={handleMoveToPayment}>결제하러 가기</button> : null}
      </p> : null}
      {SHOW_MALL && <p className="ht-login__help">로그인 없이도 더채움몰 상품은 볼 수 있어요.</p>}
    </form>
  </section>
}

