/**
 * 예산 사용률 단계(2026-10-26 사용자 결정): 80% 이상 주황, 90% 이상 빨강, 100% 넘으면 빨강 + 심장 뛰듯 굵기 애니메이션.
 * 거래처 예산 카드(AccountBudgetCard)와 홈 인사 카드 경고(HomeProfileCard)가 같이 쓴다.
 */
export function budgetLevel(budget: number, used: number) {
  if (!budget) return ''
  if (used > budget) return 'is-over'
  const ratio = used / budget
  return ratio >= 0.9 ? 'is-danger' : ratio >= 0.8 ? 'is-warn' : ''
}
