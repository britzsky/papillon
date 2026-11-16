/**
 * 상품 발주 마감 표기(2026-11-12 사용자 요청: 발주하기 상품 카드에 상품별 마감시간).
 * 마감 일시는 서버 OrderAvailability가 납품일 − 준비기간(D-N) + 마감시각으로 계산해 order_deadline(한국시간 'YYYY-MM-DDTHH:mm')으로 준다.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const SOON_MS = 3 * 60 * 60 * 1000

export type DeadlineInfo = { text: string; left: string; soon: boolean; passed: boolean }

/** '오늘 11:00' · '내일 17:00' · '11/14(금) 11:00'. 3시간 안이면 soon + left('N시간 남음'/'N분 남음' — 카드에서 아랫줄로 따로 보임), 지났으면 passed */
export function deadlineInfo(iso: string | undefined, now = new Date()): DeadlineInfo | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '')
  if (!m) return null
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.round((day - today) / 86400000)
  const time = `${m[4]}:${m[5]}`
  const when = diffDays === 0 ? '오늘' : diffDays === 1 ? '내일' : `${at.getMonth() + 1}/${at.getDate()}(${WEEK[at.getDay()]})`
  const left = at.getTime() - now.getTime()
  const soon = left > 0 && left <= SOON_MS
  const leftText = soon ? (left < 3600000 ? `${Math.max(1, Math.ceil(left / 60000))}분 남음` : `${Math.floor(left / 3600000)}시간 남음`) : ''
  return { text: `${when} ${time}`, left: leftText, soon, passed: left <= 0 }
}
