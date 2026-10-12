import { buildApiUrl } from '../config/api'

export type LoginRequest = {
  user_id: string
  password: string
}

export type LoginResponse = {
  user_type?: string
  user_id: string
  account_id?: string
  account_name?: string
  position?: string
  department?: string
  user_name?: string
  code?: string
}

/*
const BLOCKED_SUBSCRIPTION_MESSAGES = {
  EMPTY: '내역이 없는 거래처입니다. 결제를 진행 하시겠습니까?',
  EXPIRED: '기간만료된 거래처입니다. 결제를 진행 하시겠습니까?',
  PAUSED: '일시정지 거래처입니다. 담당자에게 문의하세요.',
  CANCELED: '해지된 거래처입니다. 결제를 진행 하시겠습니까?',
} as const

type BlockedSubscriptionStatus = keyof typeof BLOCKED_SUBSCRIPTION_MESSAGES
export type PaymentRequiredSubscriptionStatus = 'EMPTY' | 'EXPIRED' | 'CANCELED'
type RawRecord = Record<string, unknown>

function isBlockedSubscriptionStatus(status: string): status is BlockedSubscriptionStatus {
  return status in BLOCKED_SUBSCRIPTION_MESSAGES
}

function isPaymentRequiredSubscriptionStatus(
  status: string,
): status is PaymentRequiredSubscriptionStatus {
  return status === 'EMPTY' || status === 'EXPIRED' || status === 'CANCELED'
}
*/

export type PaymentRequiredSubscriptionStatus = 'EMPTY' | 'EXPIRED' | 'CANCELED'
type RawRecord = Record<string, unknown>

export class SubscriptionActionRequiredError extends Error {
  status: PaymentRequiredSubscriptionStatus
  accountId: string

  constructor(message: string, status: PaymentRequiredSubscriptionStatus, accountId: string) {
    super(message)
    this.name = 'SubscriptionActionRequiredError'
    this.status = status
    this.accountId = accountId
  }
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function readRecord(value: unknown): RawRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as RawRecord
  }

  return null
}

/*
function readFirstRecord(value: unknown): RawRecord | null {
  if (Array.isArray(value)) {
    return readRecord(value[0])
  }

  return readRecord(value)
}
*/

function extractAccountId(payload: unknown): string {
  const record = readRecord(payload)

  if (!record) {
    return ''
  }

  const directAccountId = asText(record.account_id ?? record.accountId)
  if (directAccountId !== '') {
    return directAccountId
  }

  const data = readRecord(record.data)
  return data ? asText(data.account_id ?? data.accountId) : ''
}

function extractAccountName(payload: unknown): string {
  const record = readRecord(payload)
  if (!record) return ''

  const accountName = asText(record.account_name ?? record.accountName)
  if (accountName !== '') return accountName

  const data = readRecord(record.data)
  return data ? asText(data.account_name ?? data.accountName) : ''
}

function extractUserId(payload: unknown): string {
  const record = readRecord(payload)

  if (!record) {
    return ''
  }

  const directUserId = asText(record.user_id ?? record.userId)
  if (directUserId !== '') {
    return directUserId
  }

  const data = readRecord(record.data)
  return data ? asText(data.user_id ?? data.userId) : ''
}

function extractUserName(payload: unknown): string {
  const record = readRecord(payload)

  if (!record) {
    return ''
  }

  const directUserName = asText(record.user_name ?? record.userName)
  if (directUserName !== '') {
    return directUserName
  }

  const data = readRecord(record.data)
  return data ? asText(data.user_name ?? data.userName) : ''
}

function extractCode(payload: unknown): string {
  const record = readRecord(payload)

  if (!record) {
    return ''
  }

  const directCode = asText(record.code)
  if (directCode !== '') {
    return directCode
  }

  const data = readRecord(record.data)
  return data ? asText(data.code) : ''
}

/*
function extractSubscriptionStatus(payload: unknown): string {
  const record = readFirstRecord(payload)

  if (!record) {
    return ''
  }

  const directStatus = asText(record.subscription_status ?? record.subscriptionStatus).toUpperCase()
  if (directStatus !== '') {
    return directStatus
  }

  const data = readRecord(record.data)
  return data ? asText(data.subscription_status ?? data.subscriptionStatus).toUpperCase() : ''
}
*/

/*
async function getSubscriptionStatus(accountId: string) {
  const searchParams = new URLSearchParams({
    account_id: accountId,
  })

  const response = await fetch(`${buildApiUrl('/Payment/SubscriptionStatus')}?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('결제 상태를 확인하지 못했습니다. 다시 시도해주세요.')
  }

  const payload = (await response.json()) as unknown
  const status = extractSubscriptionStatus(payload)

  if (status === '') {
    throw new Error('구독 상태를 확인할 수 없습니다. 관리자에게 문의해주세요.')
  }

  return status
}
*/

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(buildApiUrl('/User/Login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('Invalid ID or password.')
  }

  const rawData = (await response.json()) as unknown
  const record = readRecord(rawData)
  if (String(record?.code) !== "200") throw new Error(String(record?.msg || "로그인 정보를 확인해주세요."))
  const userType = String(record?.user_type || "")
  if (!["2", "3"].includes(userType)) throw new Error("본사 또는 현장 계정인지 확인해주세요.")
  const data: LoginResponse = {
    user_id: extractUserId(rawData),
    user_name: extractUserName(rawData),
    account_id: extractAccountId(rawData),
    account_name: extractAccountName(rawData),
    code: extractCode(rawData),
    user_type: userType,
  }
  
  const accountId = data.account_id ?? ''
  const accountName = data.account_name ?? ''
  /*
  if (accountId === '') {
    window.location.assign('/home')
    //throw new Error('거래처 정보가 없어 로그인할 수 없습니다.')
  }
  
  const subscriptionStatus = await getSubscriptionStatus(accountId)
  if (isPaymentRequiredSubscriptionStatus(subscriptionStatus)) {
    
    throw new SubscriptionActionRequiredError(
      BLOCKED_SUBSCRIPTION_MESSAGES[subscriptionStatus],
      subscriptionStatus,
      accountId,
    )
      
  }
  
  if (isBlockedSubscriptionStatus(subscriptionStatus)) {
    throw new Error(BLOCKED_SUBSCRIPTION_MESSAGES[subscriptionStatus])
  }

  if (subscriptionStatus !== 'ACTIVE' && subscriptionStatus !== 'TRIAL') {
    throw new Error('허용되지 않은 구독 상태입니다. 관리자에게 문의해주세요.')
  }

  const accessToken = data.code
  if (accessToken !== '200') {
    throw new Error('로그인 응답이 올바르지 않습니다.')
  }
  */
  const user_name = data.user_name ?? ''
  const user_id = data.user_id ?? ''

  if (typeof window !== 'undefined') {
    if (localStorage.getItem('user_id') !== user_id) sessionStorage.clear()
    localStorage.setItem('user_type', userType)
    localStorage.setItem('user_name', user_name)
    localStorage.setItem('user_id', user_id)
    localStorage.setItem('account_id', accountId)
    localStorage.setItem('account_name', accountName);
    window.location.assign('/home')
  }

  return data
}

export function logout(): void {
  if (typeof window === 'undefined') return

  for (const key of [
    'user_type',
    'user_name',
    'user_id',
    'account_id',
    'account_name',
    'pending_payment_account_id',
    'pending_payment_status',
  ]) {
    localStorage.removeItem(key)
  }

  sessionStorage.clear()
  void fetch(buildApiUrl('/User/Logout'), { method: 'POST', credentials: 'include' }).finally(() => window.location.replace('/'))
}
