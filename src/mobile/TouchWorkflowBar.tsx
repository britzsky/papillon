import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { workflowIndex, workflowSteps } from '../features/workspace/workflow'
import { workspaceAccountId } from '../features/workspace/workspaceAccount'

/**
 * 업무 순서(식단표 → 발주하기 → 발주서·입고 → 재고) 태블릿판(2026-11-23 사용자 시안). PC WorkflowBar와 같은 단계·주소.
 * 지금 단계는 초록 알약, 나머지는 눌러서 이동.
 */
export default function TouchWorkflowBar() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const current = workflowIndex(pathname)
  if (!current) return null
  const accountId = workspaceAccountId(params)
  const href = (to: string) => accountId ? `${to}?${new URLSearchParams({ account_id: accountId })}` : to
  return <nav className="t-flow" aria-label="업무 순서">
    <ol>{workflowSteps.map(step => <li key={step.no} className={step.no === current ? 'is-current' : ''}>
      {step.no === current ? <span aria-current="step">{step.no}. {step.label}</span> : <Link to={href(step.to)}>{step.no}. {step.label}</Link>}
    </li>)}</ol>
  </nav>
}
