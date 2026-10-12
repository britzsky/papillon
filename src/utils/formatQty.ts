/** 수량 표시: 1,000 이상인 g·ml은 kg·L로 바꿔 보여준다(계산은 식재료 기준단위 그대로). signed면 +/− 부호를 붙인다. */
export function formatQty(value: number, unit: string, signed = false) {
  const number = Number(value) || 0
  const big = Math.abs(number) >= 1000 && (unit === 'g' || unit === 'ml')
  const shown = big ? number / 1000 : number
  const text = Math.abs(shown).toLocaleString('ko-KR', { maximumFractionDigits: big ? 2 : 1 }) + ' ' + (big ? (unit === 'g' ? 'kg' : 'L') : unit)
  return (signed ? (number > 0 ? '+' : number < 0 ? '−' : '') : number < 0 ? '−' : '') + text
}
