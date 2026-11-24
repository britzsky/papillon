import { useId } from 'react'
import { BudgetSection } from './AccountBudgetCard'
import { LogoutButton, UserInfoPanel } from './HeaderBar'
import HeaderAlerts from './HeaderAlerts'
import WorkspaceAccountPicker from './WorkspaceAccountPicker'
import { isHeadquarters } from '../features/workspace/workspaceAccount'
import { useAccountSummaryResult } from '../features/workspace/useAccountSummary'
import { useReportReady } from '../features/home/homeReady'
import { useSignedIn } from '../features/auth/session'
import { useLogin } from '../features/auth/useLogin'
import { HQ_CONTACT } from '../features/home/hqContact'
import { SHOW_MALL } from '../features/mall/mallVisibility'

/**
 * PC 홈 슬라이드 오른쪽 접속자 카드(2026-11-10 시안): 사람 아이콘(누르면 사용자 정보) + 인사·거래처 | 이름·담당자,
 * 오른쪽 위 종 알림(HeaderAlerts) · 로그아웃은 이름 옆 작은 아이콘(2026-11-12) — 이 홈에선 머리 줄 대신 여기(TopMenuLayout actionsInPage).
 * 아래는 이달 식자재·소모품 예산(AccountBudgetCard와 같은 BudgetSection, 2026-11-10 사용자 요청으로 바로가기 버튼 대신 되돌림).
 * 본사가 전체 거래처를 보는 중이면 예산 자리에 거래처 고르기.
 */

/** 이름 · 전화. 카드가 좁으면 전화번호는 중간에서 끊기지 않고 통째로 다음 줄로 */
function Contact({ name, tel }: { name: string; tel?: string }) {
  return <>{name}{tel ? <> · <span className="home-profile__tel">{tel}</span></> : null}</>
}

type CardProps = { accountId: string; className?: string }

/** 로그인 전(손님)이면 예산 자리에 로그인 칸(2026-11-12 사용자 요청: 따로 있던 로그인 화면 대신), 로그인하면 거래처·예산 */
export default function HomeProfileCard(props: CardProps) {
  return useSignedIn() ? <SignedInCard {...props} /> : <LoginCard className={props.className} />
}

/** 손님용: 인사 + 아이디·비밀번호 로그인(PC·터치 공용 useLogin — 성공하면 홈을 다시 열고 준비 화면을 보여 줌) */
function LoginCard({ className = '' }: { className?: string }) {
  const { user_id, setUserId, password, setPassword, isLoading, alertState, closeAlert, handleMoveToPayment, handleSubmit } = useLogin()
  const formId = useId()
  return (
    <section className={`home-profile is-guest ${className}`} aria-labelledby={`${formId}-title`}>
      <div className="home-profile__head">
        <span className="home-profile__avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8.6" r="4.2" /><path d="M3.4 24v-2.6c.7-4.7 4.2-7.8 8.6-7.8s7.9 3.1 8.6 7.8V24z" /></svg>
        </span>
        <div className="home-profile__text">
          <p className="home-profile__hello">안녕하세요.</p>
          <p id={`${formId}-title`} className="home-profile__who">더채움 발주 프로그램 로그인</p>
          <p className="home-profile__contact">로그인하면 거래처 정보와 이달 예산이 보입니다.</p>
        </div>
      </div>
      <form className="home-profile__login" onSubmit={handleSubmit} aria-describedby={alertState ? `${formId}-msg` : undefined}>
        <label className="rd-sr-only" htmlFor={`${formId}-id`}>아이디</label>
        <input id={`${formId}-id`} name="id" type="text" autoComplete="username" placeholder="아이디" required
          value={user_id} onChange={event => { setUserId(event.target.value); if (alertState?.kind === 'info') closeAlert() }} />
        <label className="rd-sr-only" htmlFor={`${formId}-pw`}>비밀번호</label>
        <input id={`${formId}-pw`} name="password" type="password" autoComplete="current-password" placeholder="비밀번호" required
          value={password} onChange={event => { setPassword(event.target.value); if (alertState?.kind === 'info') closeAlert() }} />
        <button type="submit" className="rd-btn is-primary home-profile__login-btn" disabled={isLoading}>{isLoading ? '로그인 중…' : '로그인'}</button>
        {alertState ? <p id={`${formId}-msg`} className="home-profile__login-msg" role="alert">
          {alertState.message}
          {alertState.kind === 'payment' ? <button type="button" className="rd-btn" onClick={handleMoveToPayment}>결제하러 가기</button> : null}
        </p> : null}
        {SHOW_MALL && <p className="home-profile__login-help">로그인 없이도 더채움몰 상품은 볼 수 있어요.</p>}
      </form>
    </section>
  )
}

function SignedInCard({ accountId, className = '' }: CardProps) {
  const { data: summary, done } = useAccountSummaryResult(accountId)
  useReportReady('account', done)
  const userInfoId = useId()
  const userName = summary?.user_name || localStorage.getItem('user_name') || ''
  return (
    <section className={`home-profile ${className}`} aria-label="접속자 정보">
      <div className="home-profile__head">
        <button type="button" className="home-profile__avatar" popoverTarget={userInfoId} aria-label="사용자 정보" title="사용자 정보">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.6" r="4.2" /><path d="M3.4 24v-2.6c.7-4.7 4.2-7.8 8.6-7.8s7.9 3.1 8.6 7.8V24z" /></svg>
        </button>
        <UserInfoPanel id={userInfoId} className="home-profile__user-info" />
        <div className="home-profile__text">
          <p className="home-profile__hello">안녕하세요.</p>
          {accountId ? <>
            <p className="home-profile__who">
              <strong>{summary?.account_name || ''}</strong>
              {userName ? <><span className="home-profile__bar" aria-hidden="true">|</span>{userName} 님</> : null}
              <LogoutButton className="home-profile__logout" size={15} variant="line" />
            </p>
            {/* 이름표 칸 폭을 맞춰 ':'와 이름이 위아래 같은 줄에 오게(2026-11-16 사용자 요청) */}
            <dl className="home-profile__contacts">
              <dt>본사 담당자</dt><dd>: <Contact {...HQ_CONTACT} /></dd>
              <dt>담당자</dt>
              <dd>: {summary?.manager_name ? <Contact name={summary.manager_name} tel={summary.manager_tel || undefined} /> : summary ? '등록 안 됨' : '확인 중'}</dd>
            </dl>
          </> : <>
            <p className="home-profile__who">{userName ? `${userName} 님` : ''}<LogoutButton className="home-profile__logout" size={15} variant="line" /></p>
            <p className="home-profile__contact">{isHeadquarters() ? '관리 거래처를 고르면 담당자와 이달 예산이 보입니다.' : '로그인한 계정에 거래처 정보가 없습니다.'}</p>
          </>}
        </div>
        <div className="home-profile__actions">
          <div className="home-profile__bell"><HeaderAlerts /></div>
        </div>
      </div>
      {accountId ? <div className="home-profile__budget"><BudgetSection summary={summary} /></div>
        : isHeadquarters() ? <div className="home-profile__picker"><WorkspaceAccountPicker /></div> : null}
    </section>
  )
}
