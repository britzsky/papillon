import { Link, useLocation } from 'react-router-dom'
import { workflowIndex, workflowSteps } from '../features/workspace/workflow'

/**
 * 업무 순서 진행 표시(식단표 → 발주하기 → 발주서·입고 → 재고). 네 화면 위에만 한 줄로 보이고,
 * 오른쪽 '다음' 버튼으로 다음 단계에 바로 간다(2026-10-16 사용자 결정: 식단표부터 발주까지 클릭 5번 안).
 */
export default function WorkflowBar() {
  const location = useLocation()
  const current = workflowIndex(location.pathname)
  if (!current) return null
  const query = new URLSearchParams(location.search)
  const accountId = query.get('account_id') || localStorage.getItem('account_id') || ''
  const href = (to: string) => accountId ? `${to}?${new URLSearchParams({ account_id: accountId })}` : to
  const next = workflowSteps[current] // current는 1부터
  return (
    <nav className="rd workflow-bar" aria-label="업무 순서">
      <ol className="workflow-bar__steps">
        {workflowSteps.map((step) => (
          <li key={step.no} className={step.no === current ? 'is-current' : step.no < current ? 'is-done' : ''}>
            {step.no === current
              ? <span aria-current="step"><b>{step.no}</b>{step.label}</span>
              : <Link to={href(step.to)}><b>{step.no}</b>{step.label}</Link>}
          </li>
        ))}
      </ol>
      {next ? <Link className="rd-btn workflow-bar__next" to={href(next.to)}>다음: {next.label} →</Link>
        : <span className="rd-muted workflow-bar__done">재고는 식단 사용 확정·입고로 자동 반영됩니다</span>}
    </nav>
  )
}
