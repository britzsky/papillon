/**
 * 식재료명·검색어 ↔ 공급상품명 유사도(검색 정렬용). 띄어쓰기·괄호를 무시하고 동의어를 같은 말로 본다.
 * 백엔드 ProductNameMatch.java와 같은 동의어 표·점수 규칙(변경 시 함께 수정). 이것만으로 자동 연결하지 않는다.
 */
const SYNONYMS: string[][] = [
  ['돼지고기', '돈육', '돼지'], ['소고기', '쇠고기', '우육', '한우'], ['닭고기', '계육', '닭'],
  ['계란', '달걀', '난류'], ['쌀', '백미', '멥쌀'], ['고춧가루', '고추가루'],
  ['식용유', '대두유', '콩기름'], ['설탕', '백설탕', '정백당'], ['소금', '천일염', '정제염'],
  ['간장', '진간장', '양조간장'], ['참치캔', '참치'], ['어묵', '오뎅'],
  ['요구르트', '요거트'], ['마늘', '깐마늘', '다진마늘'], ['명태', '동태', '황태'],
  ['김치', '배추김치'], ['소시지', '소세지'], ['밀가루', '소맥분'],
  ['전분', '감자전분', '옥수수전분'], ['국수면', '소면', '중면'], ['떡', '떡볶이떡', '가래떡'],
]
const SEPARATORS = /[\s()[\]{}<>,./·_\-+*&]+/g

export function normalizeName(value: string) {
  return value.toLowerCase().replace(SEPARATORS, '')
}

function tokens(value: string) {
  return value.toLowerCase().split(SEPARATORS).filter(Boolean)
}

function aliases(word: string) {
  const key = normalizeName(word)
  const group = SYNONYMS.find(items => items.some(item => normalizeName(item) === key))
  return group ? group.map(normalizeName).filter(item => item !== key) : []
}

/** 0이면 근거 없음. 30 포함, 25 동의어 포함, 10 단어 일부 일치. 한 글자는 단어가 정확히 같을 때만. */
export function nameScore(query: string, productName: string) {
  const key = normalizeName(query), product = normalizeName(productName)
  if (!key || !product) return 0
  const productTokens = tokens(productName).map(normalizeName)
  if (key.length === 1) return productTokens.includes(key) ? 30 : 0
  if (product.includes(key)) return 30
  if (aliases(query).some(alias => alias.length > 1 ? product.includes(alias) : productTokens.includes(alias))) return 25
  return tokens(query).some(token => token.length >= 2 && product.includes(normalizeName(token))) ? 10 : 0
}

/**
 * 상품 검색 점수. 검색어가 비면 1(전체). 상품명 유사도가 없으면 상품코드·공급사명 포함 여부로 5.
 * 여러 단어 검색은 단어마다 이름·코드 중 하나에 맞아야 한다.
 */
export function productSearchScore(query: string, offer: { product_name: string; supplier_item_code?: string; supplier_name?: string }) {
  const trimmed = query.trim()
  if (!trimmed) return 1
  const whole = nameScore(trimmed, offer.product_name)
  if (whole > 0) return whole
  const extra = normalizeName(`${offer.supplier_item_code || ''} ${offer.supplier_name || ''}`)
  const words = tokens(trimmed)
  const each = words.map(word => Math.max(nameScore(word, offer.product_name), extra.includes(normalizeName(word)) ? 5 : 0))
  return each.length && each.every(score => score > 0) ? Math.min(...each) : 0
}
