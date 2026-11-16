import WeekMealBoard from '../../components/WeekMealBoard'
import { isSiteUser } from '../../features/workspace/roleScreens'
import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import TouchLayout from '../TouchLayout'
import TouchIcon, { type TouchIconName } from '../TouchIcon'
import { TASKS, accountHref, needsSite, taskCount, useDailyWork, type TaskTile } from '../../features/workspace/useDailyWork'
import HomeSearchTouch from './HomeSearchTouch'
import NextStepSheet, { type NextStep } from '../NextStepSheet'
import { useUpcomingMealDays } from '../../features/workspace/useWorkspaceCalendar'
import { isHeadquarters, rememberWorkspaceAccount, workspaceAccountId } from '../../features/workspace/workspaceAccount'
import { useAccountSummaryResult } from '../../features/workspace/useAccountSummary'
import { useSignedIn } from '../../features/auth/session'
import { useLogin } from '../../features/auth/useLogin'
import { logout } from '../../api/auth'
import { clearSplashFlag } from '../../features/home/homeReady'
import { HQ_CONTACT } from '../../features/home/hqContact'
import { heroSlides, photoCards, pressArticles } from '../../features/home/homeContent'
import { BudgetSection } from '../../components/AccountBudgetCard'
import HeroSlider, { BrandCurves } from '../../components/HeroSlider'
import HomeShortcuts from '../../components/HomeShortcuts'
import NoticeBoard from '../../components/NoticeBoard'
import InstagramGrid from '../../components/InstagramGrid'
import HomePhotoCards from '../../components/HomePhotoCards'
import bannerImage from '../../assets/image/3.png'
import '../../pages/HomeMain.css'
import './HomeTouch.css'

const TILE_ICON: Record<string, TouchIconName> = { prepare: 'order', pending_orders: 'alert', due_receipts: 'truck', pending_meals: 'meals' }

/**
 * 터치 홈(2026-11-12 사용자 요청: m버전도 PC 홈 구성처럼, 터치의 직관성은 유지).
 * 순서: 접속자 카드(인사·거래처·담당자·이름 옆 로그아웃·이달 예산 / 로그인 전엔 로그인 칸) → '다음 할 일' 큰 버튼(카드 밑, 사용자 결정)
 * → 바로가기 물방울(PC와 같은 HomeShortcuts) → 통합 검색 → 이번 주 식단표(현장) → 오늘 할 일 칸 → 슬라이드·더채움 소식·인스타그램·사진·배너(PC 부품 그대로).
 * 업무가 먼저, 홍보는 아래(휴대폰은 좁아서). 로그인 전에는 업무 조회를 하지 않는다. 조회·계산은 PC와 같은 useDailyWork.
 */
export default function HomeTouch() {
  // 로그인 직후 준비 화면 표시는 PC 홈(pages/Home)만 쓰므로 여기선 지운다(세션 확인 중에는 WorkspaceBoundary가 보여 줌)
  useEffect(() => { clearSplashFlag() }, [])
  return useSignedIn() ? <SignedInHome /> : <GuestHome />
}

function GuestHome() {
  return <TouchLayout title="홈" subtitle="로그인하고 이용해 주세요">
    <LoginCard />
    <div className="rd ht-pc"><HomeShortcuts /></div>
    <HomeStories />
  </TouchLayout>
}

function SignedInHome() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // 관리 거래처(PC와 같은 규칙). 본사가 비우면 모든 거래처를 본다
  const account = workspaceAccountId(params)
  const { data, error, rows, single, busy, tiles, refresh } = useDailyWork(account)

  const pickAccount = (accountId: string) => {
    rememberWorkspaceAccount(accountId)
    navigate(accountHref('/home', accountId))
  }
  const upcomingMealDays = useUpcomingMealDays(single?.account_id || '')
  const [sheet, setSheet] = useState<NextStep | null>(null)
  const next = single ? nextAction(single.account_id, needsSite(single), upcomingMealDays, tiles.find(tile => tile.key === 'prepare')) : null

  const toolbar = <button type="button" className="t-btn is-small" onClick={refresh}>새로고침</button>

  return <TouchLayout title="홈" subtitle={single ? single.account_name : rows.length > 1 ? `거래처 ${rows.length}곳` : undefined} toolbar={toolbar}>
    <ProfileCard key={account} accountId={account} />
    {/* 큰 버튼 하나가 다음 할 일(새 주: 식단 → 발주서 → 발주 3번, 식단 있음: 발주서 → 발주 2번) — 접속자 카드 바로 밑 */}
    {next && <section className={`ht-next${next.tone ? ` is-${next.tone}` : ''}`} aria-label="다음 할 일">
      <div className="ht-next__text"><small>{next.eyebrow}</small><strong>{next.title}</strong>{next.hint && <small>{next.hint}</small>}</div>
      {next.step ? <button type="button" className="t-btn is-large" onClick={() => setSheet(next.step!)}>{next.action}</button>
        : next.to ? <Link className="t-btn is-large" to={next.to}>{next.action}</Link> : null}
    </section>}
    {sheet && single && <NextStepSheet accountId={single.account_id} step={sheet} onClose={() => { setSheet(null); refresh() }} />}
    <div className="rd ht-pc"><HomeShortcuts /></div>
    <HomeSearchTouch />
    {/* 현장 계정(2026-10-22): 이번 주 식단표를 크게 */}
    {single && isSiteUser() && <div className="rd ht-week"><WeekMealBoard accountId={single.account_id} editHref={accountHref('/operations/table-meals', single.account_id)} /></div>}
    <h2 className="t-section-title">
      오늘 할 일
      {data?.checked_at && <small className="ht-checked">{data.checked_at.slice(11, 16)} 기준</small>}
    </h2>
    {error && <p className="t-msg is-error" role="alert">{error}</p>}
    {!data && !error && <p className="t-msg" role="status">업무 현황을 확인하고 있습니다.</p>}
    {data && !rows.length && <p className="t-msg">조회할 거래처가 없습니다. 거래처 설정을 확인해주세요.</p>}

    {tiles.length > 0 && <div className="ht-tiles">{tiles.map(tile => <Tile key={tile.key} tile={tile} />)}</div>}

    {!single && busy.length > 0 && <>
      <h2 className="t-section-title">확인할 일이 있는 거래처 {busy.length}곳</h2>
      <ul className="ht-accounts">
        {busy.map(row => <li key={row.account_id}>
          <button type="button" className="t-card ht-account" onClick={() => pickAccount(row.account_id)}>
            <span className="t-dot">{row.account_name.slice(0, 1)}</span>
            <strong>{row.account_name}</strong>
            <span className="ht-account__chips">
              {needsSite(row) && <span className="t-badge is-warn">사업장 지정 필요</span>}
              {TASKS.filter(task => taskCount(row, task.key) > 0).map(task =>
                <span key={task.key} className={`t-badge ${task.tone === 'warn' ? 'is-warn' : 'is-info'}`}>{task.label} {taskCount(row, task.key)}</span>)}
            </span>
            <TouchIcon name="chevronRight" />
          </button>
        </li>)}
      </ul>
    </>}
    {!single && rows.length > 0 && !busy.length && <p className="t-msg">모든 거래처에 지금 확인할 업무가 없습니다.</p>}

    <HomeStories />
  </TouchLayout>
}

const Avatar = () => <span className="ht-profile__avatar" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.6" r="4.2" /><path d="M3.4 24v-2.6c.7-4.7 4.2-7.8 8.6-7.8s7.9 3.1 8.6 7.8V24z" /></svg>
</span>

/** 접속자 카드(PC HomeProfileCard와 같은 내용, 터치 크기): 인사 · 거래처 | 이름 님 + 작은 로그아웃 · 담당자 · 이달 예산 */
function ProfileCard({ accountId }: { accountId: string }) {
  const { data: summary } = useAccountSummaryResult(accountId)
  const userName = summary?.user_name || localStorage.getItem('user_name') || ''
  return <section className="t-card ht-profile" aria-label="접속자 정보">
    <div className="ht-profile__head">
      <Avatar />
      <div className="ht-profile__text">
        <p className="ht-profile__hello">안녕하세요.</p>
        <p className="ht-profile__who">
          {accountId && summary?.account_name ? <><strong>{summary.account_name}</strong><span className="ht-profile__bar" aria-hidden="true">|</span></> : null}
          {userName ? `${userName} 님` : ''}
          <button type="button" className="ht-profile__logout" onClick={logout} aria-label="로그아웃" title="로그아웃">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9" />
            </svg>
          </button>
        </p>
        {accountId ? <>
          <p className="ht-profile__contact">본사 담당자 : {HQ_CONTACT.name} · <span className="ht-nowrap">{HQ_CONTACT.tel}</span></p>
          <p className="ht-profile__contact">담당자 : {summary?.manager_name ? <>{summary.manager_name}{summary.manager_tel ? <> · <span className="ht-nowrap">{summary.manager_tel}</span></> : null}</> : summary ? '등록 안 됨' : '확인 중'}</p>
        </> : <p className="ht-profile__contact">{isHeadquarters() ? '위에서 거래처를 고르면 담당자와 이달 예산이 보입니다.' : '로그인한 계정에 거래처 정보가 없습니다.'}</p>}
      </div>
    </div>
    {accountId ? <div className="rd ht-profile__budget"><BudgetSection summary={summary} /></div> : null}
  </section>
}

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
      <p className="ht-login__help">로그인 없이도 더채움몰 상품은 볼 수 있어요.</p>
    </form>
  </section>
}

/** 업무 아래 홍보·소식(PC 홈 부품 그대로): 슬라이드 → 더채움 소식 · 인스타그램 → 사진 3장 → 배너 */
function HomeStories() {
  return <div className="rd ht-pc ht-stories">
    <HeroSlider className="home-main__hero" slides={heroSlides} />
    <div className="home-main__lower">
      <NoticeBoard press={pressArticles} />
      <InstagramGrid />
    </div>
    <HomePhotoCards photos={photoCards} />
    <figure className="home-main__banner">
      <img src={bannerImage} alt="" />
      <BrandCurves variant="banner" />
    </figure>
  </div>
}

function Tile({ tile }: { tile: TaskTile }) {
  const body = <>
    <span className="ht-tile__icon"><TouchIcon name={TILE_ICON[tile.key] || 'alert'} /></span>
    <span className="ht-tile__label">{tile.label}</span>
    <strong className="ht-tile__value">{tile.value}</strong>
    <span className="ht-tile__hint">{tile.hint}</span>
  </>
  const className = `t-card ht-tile is-${tile.tone}`
  return tile.to ? <Link className={className} to={tile.to}>{body}</Link> : <div className={className}>{body}</div>
}

type NextAction = { eyebrow: string; title: string; hint?: string; action: string; step?: NextStep; to?: string; tone?: 'quiet' | 'warn' }

/** 홈 맨 위 큰 버튼: 사업장 지정 → 다음 7일 식단 → 급한 발주(마감·재고 부족) → 식단 기준 발주 순서로 지금 할 일 하나 */
function nextAction(accountId: string, siteMissing: boolean, upcomingMealDays: number | null, prepare?: TaskTile): NextAction | null {
  if (siteMissing) return { eyebrow: '발주 준비', title: '공급사 사업장이 지정되지 않았어요', hint: isHeadquarters() ? '사업장을 지정하면 상품·판가를 받아 발주할 수 있어요' : '본사에 공급사 사업장 지정을 요청하세요', tone: 'warn',
    action: '사업장 지정', to: isHeadquarters() ? accountHref('/order_manager/supplier-sites', accountId) : undefined }
  if (upcomingMealDays === null) return null
  if (upcomingMealDays === 0) return { eyebrow: '다음 7일 식단표가 없어요', title: '다음 주 식단 만들기', hint: '템플릿 식단표 또는 식단표 파일을 불러와 저장하면 모자란 재료로 발주해요',
    action: '식단표로 가기', to: accountHref('/operations/table-meals', accountId) }
  if (prepare?.to && prepare.tone !== 'done') {
    const query = new URLSearchParams(prepare.to.split('?')[1] || '')
    const override: Record<string, string> = { account_id: accountId, autoselect: '1' }
    query.forEach((value, key) => { if (key !== 'tab') override[key] = value })
    if (query.get('tab') === 'stock') override.source = 'STOCK'
    return { eyebrow: prepare.label, title: `발주서 보기 · ${prepare.value}`, hint: prepare.hint, action: '발주서 보기', step: { kind: 'order', override, title: prepare.label } }
  }
  return { eyebrow: '급한 발주 없음', title: '식단 기준으로 발주서 보기', hint: '저장된 식단에서 모자란 재료만 골라 발주서를 만들어요', tone: 'quiet',
    action: '발주서 보기', step: { kind: 'order', override: { account_id: accountId, source: 'PLAN', autoselect: '1' }, title: '식단 기준 발주서' } }
}
