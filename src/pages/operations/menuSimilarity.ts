// 메뉴명 비슷한 정도(0~1). 두 글자씩 묶은 조각의 겹침(Dice)에, 한쪽 이름이 다른 쪽을 품으면('들깨미역국'·'미역국') 가산한다.

// 공백·괄호·기호·숫자(알레르기 번호)를 지운 비교용 이름. 한글·영문만 남긴다
const key = (value: string) => value.normalize('NFKC').replace(/[^\p{L}]/gu, '').toLowerCase()

function bigrams(value: string) {
  const grams = new Map<string, number>()
  for (let i = 0; i < value.length - 1; i++) {
    const gram = value.slice(i, i + 2)
    grams.set(gram, (grams.get(gram) ?? 0) + 1)
  }
  return grams
}

export function menuSimilarity(left: string, right: string) {
  const a = key(left), b = key(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const ga = bigrams(a), gb = bigrams(b)
  let overlap = 0
  ga.forEach((count, gram) => { overlap += Math.min(count, gb.get(gram) ?? 0) })
  const total = Math.max(1, a.length - 1 + b.length - 1)
  const dice = (2 * overlap) / total
  const shorter = a.length <= b.length ? a : b, longer = a.length <= b.length ? b : a
  return shorter.length >= 2 && longer.includes(shorter) ? Math.max(dice, 0.6 + 0.4 * (shorter.length / longer.length)) : dice
}

/** 이름이 비슷한 메뉴를 점수순으로. threshold 미만은 뺀다 */
export function similarMenus<T extends { menu_name: string }>(text: string, menus: T[], limit = 5, threshold = 0.35) {
  return menus
    .map(menu => ({ menu, score: menuSimilarity(text, menu.menu_name) }))
    .filter(entry => entry.score >= threshold)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
}
