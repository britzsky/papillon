/** 식사 칸의 1인분 열량 합계(등록된 메뉴만). PC·터치 식단표 공용 */
export default function MealCalories({ menus }: { menus: ({ calories_per_serving?: number } | null)[] }) {
  if (menus.length === 0) return null
  // Existing menu forms use 0 as the default for unregistered calories.
  const known = menus.map(menu => menu?.calories_per_serving).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  )
  const missing = menus.length - known.length
  const total = known.reduce((sum, value) => sum + value, 0)
  return (
    <span className="table-meals-calories">
      {known.length === 0
        ? '열량 미등록'
        : `${missing ? '등록분 ' : ''}${total.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kcal / 1인분`}
      {missing > 0 && <small>칼로리 미등록 {missing}개 메뉴</small>}
    </span>
  )
}
