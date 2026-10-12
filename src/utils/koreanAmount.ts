const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const SMALL = ['', '십', '백', '천']
const LARGE = ['', '만', '억', '조']
/** 12000 → '일만이천', 150000 → '일십오만' (발주서·견적서의 '일금 ○○원정' 표기) */
export function koreanAmount(value: number) {
  let n = Math.round(Math.abs(value))
  if (n === 0) return '영'
  let text = ''
  for (let group = 0; n > 0; group++, n = Math.floor(n / 10000)) {
    const part = n % 10000
    if (!part) continue
    let chunk = ''
    for (let i = 0, rest = part; rest > 0; i++, rest = Math.floor(rest / 10)) {
      const digit = rest % 10
      // 공식 서류 관례: 위변조 방지를 위해 '일'을 생략하지 않는다(일십오만, 일백만일천)
      if (digit) chunk = DIGITS[digit] + SMALL[i] + chunk
    }
    text = chunk + LARGE[group] + text
  }
  return text
}
