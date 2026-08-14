import { buildApiUrl } from '../config/api'

export type Workplace = {
  solTo: string
  soldToNm: string
  logisCd: string
  repSoldtoYn: string
  nextPGCycle: string
  payerCode: string
  payerNm: string
  pricingCode: string
}

type RawRecord = Record<string, unknown>

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''

function normalize(item: RawRecord): Workplace {
  return {
    // 제공 명세의 예시는 solTo, 필드 표는 soldTo로 표기가 달라 둘 다 지원합니다.
    solTo: text(item.solTo ?? item.soldTo),
    soldToNm: text(item.soldToNm),
    logisCd: text(item.logisCd),
    repSoldtoYn: text(item.repSoldtoYn),
    nextPGCycle: text(item.nextPGCycle),
    payerCode: text(item.payerCode),
    payerNm: text(item.payerNm ?? item.payerDesc),
    pricingCode: text(item.pricingCode),
  }
}

export async function lookupWorkplaces(signal?: AbortSignal): Promise<Workplace[]> {
  const configured = import.meta.env.VITE_WORKPLACE_LOOKUP_API_URL?.trim()
  const endpoint = configured || buildApiUrl('/Order/Welstory/SoldToList')
  const workplaces: Workplace[] = []
  let contYn = 'N'
  let nextKey = ''

  do {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataHeader: { pageRow: 10000, contYn, nextKey } }),
      signal,
    })
    if (!response.ok) throw new Error(`사업장 조회 통신에 실패했습니다. (${response.status})`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) throw new Error('사업장 조회 응답 형식이 올바르지 않습니다.')

    const payload = (await response.json()) as RawRecord
    const header = (payload.dataHeader ?? {}) as RawRecord
    const body = (payload.dataBody ?? payload) as RawRecord
    if (text(body.resCd) && text(body.resCd) !== 'S0000') {
      throw new Error(text(body.resMsg) || `사업장 조회 오류 (${text(body.resCd)})`)
    }
    const data = body.data
    const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : []
    workplaces.push(...rows.map((row) => normalize(row as RawRecord)).filter((row) => row.solTo))
    contYn = text(header.contYn)
    nextKey = text(header.nextKey)
  } while (contYn === 'Y' && nextKey)

  return workplaces
}
