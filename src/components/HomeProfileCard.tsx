import { useId } from 'react'
import { BudgetSection } from './AccountBudgetCard'
import { LogoutButton, UserInfoPanel } from './HeaderBar'
import HeaderAlerts from './HeaderAlerts'
import WorkspaceAccountPicker from './WorkspaceAccountPicker'
import { isHeadquarters } from '../features/workspace/workspaceAccount'
import { useAccountSummary } from '../features/workspace/useAccountSummary'

/**
 * PC 홈 슬라이드 오른쪽 접속자 카드(2026-11-10 시안): 사람 아이콘(누르면 사용자 정보) + 인사·거래처 | 이름·담당자,
 * 오른쪽 위 종 알림(HeaderAlerts) · 그 아래 로그아웃 — 이 홈에선 머리 줄 대신 여기(TopMenuLayout actionsInPage).
 * 아래는 이달 식자재·소모품 예산(AccountBudgetCard와 같은 BudgetSection, 2026-11-10 사용자 요청으로 바로가기 버튼 대신 되돌림).
 * 본사가 전체 거래처를 보는 중이면 예산 자리에 거래처 고르기.
 */
/**
 * 본사 담당자(2026-11-10 사용자 요청: 일단 임의 값으로 고정 표시). 거래처별 본사 담당자 정보가 생기면 서버 값(account-summary)으로 바꿀 것.
 */
const HQ_CONTACT = { name: '임소현 매니저', tel: '010-4075-6785' }

/** 이름 · 전화. 카드가 좁으면 전화번호는 중간에서 끊기지 않고 통째로 다음 줄로 */
function Contact({ name, tel }: { name: string; tel?: string }) {
  return <>{name}{tel ? <> · <span className="home-profile__tel">{tel}</span></> : null}</>
}

export default function HomeProfileCard({ accountId, className = '' }: { accountId: string; className?: string }) {
  const summary = useAccountSummary(accountId)
  const userInfoId = useId()
  const userName = summary?.user_name || localStorage.getItem('user_name') || ''
  return (
    <section className={`home-profile ${className}`} aria-label="접속자 정보">
      <div className="home-profile__head">
        <button type="button" className="home-profile__avatar" popoverTarget={userInfoId} aria-label="사용자 정보" title="사용자 정보">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.6" r="4.2" /><path d="M3.6 21c.6-4.6 4-7.4 8.4-7.4s7.8 2.8 8.4 7.4z" /></svg>
        </button>
        <UserInfoPanel id={userInfoId} className="home-profile__user-info" />
        <div className="home-profile__text">
          <p className="home-profile__hello">안녕하세요.</p>
          {accountId ? <>
            <p className="home-profile__who">
              <strong>{summary?.account_name || ''}</strong>
              {userName ? <><span className="home-profile__bar" aria-hidden="true">|</span>{userName} 님</> : null}
            </p>
            <p className="home-profile__contact">본사 담당자 : <Contact {...HQ_CONTACT} /></p>
            <p className="home-profile__contact">
              담당자 : {summary?.manager_name ? <Contact name={summary.manager_name} tel={summary.manager_tel || undefined} /> : summary ? '등록 안 됨' : '확인 중'}
            </p>
          </> : <>
            <p className="home-profile__who">{userName ? `${userName} 님` : ''}</p>
            <p className="home-profile__contact">{isHeadquarters() ? '관리 거래처를 고르면 담당자와 이달 예산이 보입니다.' : '로그인한 계정에 거래처 정보가 없습니다.'}</p>
          </>}
        </div>
        <div className="home-profile__actions">
          <div className="home-profile__bell"><HeaderAlerts /></div>
          <LogoutButton className="home-profile__logout" size={24} variant="line" />
        </div>
      </div>
      {accountId ? <div className="home-profile__budget"><BudgetSection summary={summary} /></div>
        : isHeadquarters() ? <div className="home-profile__picker"><WorkspaceAccountPicker /></div> : null}
    </section>
  )
}
