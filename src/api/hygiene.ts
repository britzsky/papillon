import { buildApiUrl } from '../config/api'

/**
 * 위생관리(2026-10-26) — 서버 /v2/hygiene/*가 기존 ERP 위생관리(thefull.kr Operate/Hygiene*)를 그대로 읽고 쓴다.
 * 점검 기록 1건 = 부적합 사진·내용(problem) + 조치 사진·내용(clean) + 비고(note). 사진은 한 칸에 1장(ERP 구조).
 */
export type HygieneCategory = {
  category_key: string
  category_name: string
  description: string
  manage_point: string
  sort_no?: number
  use_yn?: 'Y' | 'N'
  main_yn?: 'Y' | 'N'
  status_yn?: 'Y' | 'N'
  /** 'Y'면 거래처에 저장된 카테고리가 없어 서버가 준 ERP 기본 목록(카테고리 편집에서 저장하면 ERP에 저장) */
  default_yn?: 'Y' | 'N'
}

export type HygieneRecord = {
  idx?: number
  category_key: string
  problem_image: string
  problem_note: string
  clean_image: string
  clean_note: string
  note: string
  reg_dt?: string
  mod_dt?: string
  reg_user_name?: string
  mod_user_name?: string
}

type Failure = { message?: string } | null

async function readJson<T>(response: Response, failure: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & Failure) | null
  if (!response.ok || body === null) throw new Error((body as Failure)?.message || failure)
  return body as T
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

export async function getHygieneCategories(accountId: string): Promise<HygieneCategory[]> {
  const body = await readJson<{ categories: Array<Record<string, unknown>> }>(
    await fetch(buildApiUrl(`/v2/hygiene/categories?${new URLSearchParams({ account_id: accountId })}`)), '위생 카테고리를 불러오지 못했습니다.')
  return (body.categories ?? []).map(row => ({
    category_key: text(row.category_key), category_name: text(row.category_name), description: text(row.description),
    manage_point: text(row.manage_point), sort_no: Number(row.sort_no) || undefined,
    use_yn: row.use_yn === 'N' ? 'N' : 'Y', main_yn: row.main_yn === 'Y' ? 'Y' : 'N', status_yn: row.status_yn === 'N' ? 'N' : 'Y',
  }))
}

/** month('YYYY-MM')가 비면 누적 전체 */
export async function getHygieneRecords(accountId: string, month: string): Promise<{ imageBase: string; records: HygieneRecord[] }> {
  const [year, mm] = month ? month.split('-') : ['', '']
  const body = await readJson<{ image_base: string; records: Array<Record<string, unknown>> }>(
    await fetch(buildApiUrl(`/v2/hygiene/records?${new URLSearchParams({ account_id: accountId, year: year ?? '', month: mm ?? '' })}`)), '위생 점검 기록을 불러오지 못했습니다.')
  const records = (body.records ?? []).map(row => ({
    idx: Number(row.idx) || undefined, category_key: text(row.category_key),
    problem_image: text(row.problem_image), problem_note: text(row.problem_note), clean_image: text(row.clean_image), clean_note: text(row.clean_note),
    note: text(row.note), reg_dt: text(row.reg_dt), mod_dt: text(row.mod_dt), reg_user_name: text(row.reg_user_name), mod_user_name: text(row.mod_user_name),
  }))
  // 최근 등록 먼저
  records.sort((a, b) => (b.reg_dt || '').localeCompare(a.reg_dt || '') || (b.idx ?? 0) - (a.idx ?? 0))
  return { imageBase: text(body.image_base), records }
}

export async function saveHygieneRecord(accountId: string, record: HygieneRecord & { del_yn?: 'Y' | 'N' }) {
  return readJson<{ message: string }>(await fetch(buildApiUrl('/v2/hygiene/records'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, records: [record] }),
  }), '위생 점검 기록을 저장하지 못했습니다.')
}

export async function saveHygieneCategories(accountId: string, categories: HygieneCategory[]): Promise<HygieneCategory[]> {
  await readJson<{ message: string }>(await fetch(buildApiUrl('/v2/hygiene/categories'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, categories }),
  }), '위생 카테고리를 저장하지 못했습니다.')
  return getHygieneCategories(accountId)
}

/** 사진을 ERP에 올리고 저장 경로(/image/hygiene/…)를 받는다. 기록은 따로 저장해야 반영된다 */
export async function uploadHygienePhoto(accountId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('account_id', accountId)
  form.append('file', file)
  const body = await readJson<{ image_path: string }>(await fetch(buildApiUrl('/v2/hygiene/photos'), { method: 'POST', body: form }), '사진을 올리지 못했습니다.')
  return body.image_path
}

/** ERP 저장 경로 → 보기 주소(한글·공백 파일명은 주소용으로 바꾼다) */
export function hygienePhotoUrl(imageBase: string, path: string) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${imageBase.replace(/\/+$/, '')}${path.split('/').map(part => encodeURIComponent(part)).join('/')}`
}
