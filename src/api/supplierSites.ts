import { buildApiUrl } from '../config/api'

type Row = Record<string, unknown>

export type SupplierCode = 'WELSTORY' | 'OURHOME'

/** 공급사가 알려준 사업장 (거래처 연결 전 후보) */
export type SupplierMasterSite = {
  supplier_site_id: number
  supplier_code: SupplierCode
  supplier_name: string
  external_site_code: string
  external_site_name: string
  center_code: string
  center_name: string
  representative_site_code: string
  use_yn: 'Y' | 'N'
  provider_listed_yn: 'Y' | 'N'
  last_seen_at: string
  assigned_account_ids: string[]
}

/** 거래처에 지정된 공급사 사업장 */
export type SupplierSiteMapping = {
  supplier_account_site_id: number
  account_id: string
  supplier_code: string
  external_site_code: string
  external_site_name: string
  mod_at: string
  user_id: string
}

/** 같은 사업장을 다른 거래처가 이미 쓰고 있어 확인이 필요한 경우 */
export class SharedSiteError extends Error {
  readonly accountIds: string[]
  constructor(message: string, accountIds: string[]) { super(message); this.accountIds = accountIds }
}

const text = (value: unknown) => value == null ? '' : String(value)
const userId = () => localStorage.getItem('user_id') || ''

async function request(path: string, init?: RequestInit) {
  const response = await fetch(buildApiUrl(path), { cache: 'no-store', ...init })
  const payload = await response.json().catch(() => null) as unknown
  if (!response.ok) {
    const body = (payload && typeof payload === 'object' ? payload : {}) as Row
    if (response.status === 409 && body.code === 'SHARED_SITE')
      throw new SharedSiteError(text(body.message), Array.isArray(body.account_ids) ? body.account_ids.map(text) : [])
    throw new Error(text(body.message) || '공급사 사업장 요청에 실패했습니다.')
  }
  return payload
}

const post = (path: string, body: Row) => request(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, user_id: userId() }),
})

export async function getMasterSites(): Promise<SupplierMasterSite[]> {
  const rows = await request('/v2/supplier-integration/site-mapping/sites') as Row[]
  return (Array.isArray(rows) ? rows : []).map(row => ({
    supplier_site_id: Number(row.supplier_site_id) || 0,
    supplier_code: text(row.supplier_code) as SupplierCode,
    supplier_name: text(row.supplier_name),
    external_site_code: text(row.external_site_code),
    external_site_name: text(row.external_site_name),
    center_code: text(row.center_code),
    center_name: text(row.center_name),
    representative_site_code: text(row.representative_site_code),
    use_yn: row.use_yn === 'N' ? 'N' : 'Y',
    provider_listed_yn: row.provider_listed_yn === 'N' ? 'N' : 'Y',
    last_seen_at: text(row.last_seen_at),
    assigned_account_ids: text(row.assigned_account_ids).split(',').filter(Boolean),
  }))
}

export async function getSiteMappings(): Promise<SupplierSiteMapping[]> {
  const rows = await request('/v2/supplier-integration/site-mapping/mappings') as Row[]
  return (Array.isArray(rows) ? rows : []).map(row => ({
    supplier_account_site_id: Number(row.supplier_account_site_id) || 0,
    account_id: text(row.account_id),
    supplier_code: text(row.supplier_code),
    external_site_code: text(row.external_site_code),
    external_site_name: text(row.external_site_name),
    mod_at: text(row.mod_at),
    user_id: text(row.user_id),
  }))
}

/** 공급사 API에서 전체 사업장 목록을 받아 마스터만 갱신한다 (거래처 연결은 바꾸지 않음). */
export async function syncMasterSites(supplierCode: SupplierCode) {
  const result = await post('/v2/supplier-integration/site-mapping/sites/sync', { supplier_code: supplierCode }) as Row
  return Number(result.saved_count) || 0
}

export function setMasterSiteUse(supplierSiteId: number, useYn: 'Y' | 'N') {
  return post('/v2/supplier-integration/site-mapping/sites/use', { supplier_site_id: supplierSiteId, use_yn: useYn })
}

/** 거래처의 공급사 사업장 지정/변경. siteCode가 빈 값이면 해제. */
export function assignSite(accountId: string, supplierCode: SupplierCode, siteCode: string, allowShared = false) {
  return post('/v2/supplier-integration/site-mapping/assign', {
    account_id: accountId, supplier_code: supplierCode, external_site_code: siteCode, allow_shared: allowShared ? 'Y' : 'N',
  })
}

// 이름 비교용: 공통 접미사·시설 유형어를 빼고 이름 조각(본명, 괄호 안 지점명 등)으로 나눈다. 추천에만 쓰고 자동 저장하지 않는다.
const NOISE = /_?더채움|\(주\)|주식회사|요양원|요양센터|실버케어|실버홈|실버|케어|재활|시니어타운|주간보호센터|주간재활보호|주간보호|보호센터|센터|빌리지/g
export const nameTokens = (name: string) => name.replace(NOISE, ' ').toLowerCase().split(/[\s()·._-]+/).filter(Boolean)

function dice(a: string, b: string) {
  if (a === b) return 1
  const grams = (value: string) => value.length < 2 ? [value] : Array.from({ length: value.length - 1 }, (_, i) => value.slice(i, i + 2))
  const left = grams(a), pool = grams(b), total = left.length + pool.length
  let hit = 0
  for (const gram of left) { const index = pool.indexOf(gram); if (index >= 0) { hit += 1; pool.splice(index, 1) } }
  return (2 * hit) / total
}

/**
 * 0~1. 이름 조각끼리 가장 닮은 짝을 맞춘 뒤, 짝이 없는 조각(다른 지점명 등)은 0으로 친다.
 * 예: 늘사랑(부천) ↔ 부천 늘사랑 = 1, 스텔라(북수원) ↔ 스텔라(영통) = 0.5, 한결 ↔ 한결(소래) = 0.67
 */
export function nameScore(accountName: string, siteName: string) {
  const a = nameTokens(accountName), b = nameTokens(siteName)
  if (!a.length || !b.length) return 0
  const unused = [...b]
  let sum = 0
  for (const token of a) {
    let best = -1, bestScore = 0
    unused.forEach((other, index) => { const score = dice(token, other); if (score > bestScore) { best = index; bestScore = score } })
    if (best >= 0) { sum += bestScore; unused.splice(best, 1) }
  }
  // 붙여 쓴 이름(한결소래 ↔ 한결(소래))도 맞도록 조각을 이은 전체 이름끼리도 비교한다.
  return Math.max((2 * sum) / (a.length + b.length), dice(a.join(''), b.join('')))
}
