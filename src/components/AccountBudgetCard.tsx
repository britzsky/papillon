import { budgetLevel } from '../features/workspace/budgetLevel'
import { useAccountSummary, type AccountSummary } from '../features/workspace/useAccountSummary'

const won = (value: number) => Math.round(value).toLocaleString('ko-KR')
/** 예산 묶음 하나(예산·사용·여유 + 사용 막대) */

function budgetBlock(title: string, budget = 0, used = 0, remaining = 0) {
  const pct = budget ? Math.round(used / budget * 100) : 0
  const level = budgetLevel(budget, used)
  // 한 줄 제목(사용률) + 막대 + 예산|사용|여유 가로 3칸 — 홈이 스크롤 없이 한 화면에 들어가게(사용자 요청)
  return <div className={`rd-budget${level ? ` ${level}` : ''}`}>
    <div className="rd-budget__head"><strong className="rd-budget__title">{title}</strong>{budget ? <span className="rd-budget__pct rd-muted rd-fs-xs" role={level === 'is-over' ? 'status' : undefined}>{pct}% 사용{level === 'is-over' ? ' · 예산 초과' : ''}</span> : null}</div>
    {budget ? <span className="rd-bar rd-account__bar" aria-hidden="true"><span className={used > budget ? 'is-over' : ''} style={{ width: `${Math.min(100, pct)}%` }} /></span> : null}
    <dl className="rd-budget__nums">
      <div><dt>예산</dt><dd>{won(budget)}원</dd></div>
      <div><dt>사용</dt><dd>{won(used)}원</dd></div>
      <div><dt>여유</dt><dd className={remaining < 0 ? 'rd-text-red' : 'rd-text-ok'}>{won(remaining)}원</dd></div>
    </dl>
  </div>
}

/**
 * 거래처 카드(거래처명·로그인한 사람·담당자 + 이달 식자재·소모품 예산). 거래처 한 곳일 때만(현장 계정·본사가 거래처를 고른 홈).
 * 기존 PC 홈(DailyWork) 오른쪽 카드와 상단 메뉴 홈(2026-11-09) 오른쪽 카드가 같이 쓴다.
 */
export default function AccountBudgetCard({ accountId, fallbackName = '', className = '' }: { accountId: string; fallbackName?: string; className?: string }) {
  const summary = useAccountSummary(accountId)
  const userName = summary?.user_name || localStorage.getItem('user_name') || ''
  return (
  <section className={`rd-card rd-account${className ? ` ${className}` : ''}`} aria-label="거래처 정보">
    {/* 거래처명 왼쪽 · 로그인한 사람 이름 오른쪽(서버 값, 없으면 로그인 때 저장한 이름 — 사이드 메뉴 카드와 같은 값) */}
    <div className="rd-account__who">
      <strong className="rd-fs-lg">{summary?.account_name || fallbackName}</strong>
      {userName ? <span className="rd-account__user">{userName} 님</span> : null}
    </div>
    <dl className="rd-account__rows">
      <div><dt>담당자</dt><dd>{summary?.manager_name ? `${summary.manager_name}${summary.manager_tel ? ` · ${summary.manager_tel}` : ''}` : '등록 안 됨'}</dd></div>
    </dl>
    <BudgetSection summary={summary} />
  </section>
  )
}

/**
 * 이달 식자재·소모품 예산(막대 + 예산|사용|여유). 이 카드와 PC 홈 인사 카드(HomeProfileCard, 2026-11-10)가 같이 쓴다.
 * 모양은 Redesign.css rd-budget* 규칙.
 */
export function BudgetSection({ summary }: { summary: AccountSummary | null }) {
  // 예산: 기존 ERP 예산관리 값 그대로(식자재 budget_grant/day_use_amount, 소모품 supplies_budget/supplies_used)
  return !summary ? <p className="rd-muted rd-fs-sm">예산을 확인하고 있어요.</p>
    : summary.budget.status === 'ERROR' ? <p className="rd-text-warn rd-fs-sm">ERP 예산을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>
    : summary.budget.status === 'NONE' ? <p className="rd-muted rd-fs-sm">{Number(summary.month.slice(5))}월 예산이 아직 등록되지 않았어요.</p>
    : <>{budgetBlock('식자재 예산', summary.budget.food_budget, summary.budget.food_used, summary.budget.food_remaining)}
      {budgetBlock('소모품 예산', summary.budget.supplies_budget, summary.budget.supplies_used, summary.budget.supplies_remaining)}
      <small className="rd-muted rd-fs-xs">{Number(summary.month.slice(5))}월 · ERP 예산관리 기준{summary.budget.note ? ` · ${summary.budget.note}` : ''}</small></>
}
