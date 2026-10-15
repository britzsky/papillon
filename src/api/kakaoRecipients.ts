import { buildApiUrl } from '../config/api'

/** 거래처별 카카오 알림톡 수신자. 서버 KakaoRecipientController(/v2/workspace/kakao-recipients). */
export type KakaoRecipient = {
  kakao_recipient_id: number
  recipient_name: string
  phone: string
  notify_supplier_status: 'Y' | 'N'
  notify_deadline: 'Y' | 'N'
  active_yn: 'Y' | 'N'
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(`/v2/workspace/kakao-recipients${path}`), init)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || '알림톡 수신자 처리에 실패했습니다.')
  return body as T
}
const post = (body: object): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** active=false면 서버에서 알림톡 발송이 꺼져 있거나 설정 전(수신자는 미리 등록 가능). */
export const getKakaoRecipients = (accountId: string) =>
  call<{ active: boolean; recipients: KakaoRecipient[] }>(`?${new URLSearchParams({ account_id: accountId })}`)
export const saveKakaoRecipient = (accountId: string, row: Partial<KakaoRecipient>) =>
  call<KakaoRecipient[]>('', post({ ...row, account_id: accountId }))
export const deactivateKakaoRecipient = (accountId: string, id: number) =>
  call<KakaoRecipient[]>('/deactivate', post({ account_id: accountId, kakao_recipient_id: id }))
export const testKakaoRecipient = (accountId: string, id: number) =>
  call<{ accepted: boolean; code: string; message: string }>('/test', post({ account_id: accountId, kakao_recipient_id: id }))
