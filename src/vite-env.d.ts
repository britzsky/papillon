/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string
  readonly VITE_API_PORT?: string
  readonly VITE_TOSS_PAYMENTS_CLIENT_KEY?: string
  readonly VITE_TOSS_PAYMENTS_STORE_NAME?: string
  readonly VITE_SUBSCRIPTION_AMOUNT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type TossPaymentMethod = 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT'
type TossBillingMethod = 'CARD' | 'TRANSFER'

type TossPaymentRequest = {
  method: TossPaymentMethod
  amount: {
    currency: 'KRW'
    value: number
  }
  orderId: string
  orderName: string
  customerName?: string
  customerEmail?: string
  successUrl: string
  failUrl: string
  windowTarget?: 'self' | 'iframe'
  metadata?: Record<string, string>
}

type TossBillingRequest = {
  method: TossBillingMethod
  customerName?: string
  customerEmail?: string
  successUrl: string
  failUrl: string
  windowTarget?: 'self' | 'iframe'
}

interface TossPaymentClient {
  requestPayment(request: TossPaymentRequest): Promise<void> | void
  requestBillingAuth(request: TossBillingRequest): Promise<void> | void
}

interface TossPaymentsInstance {
  payment(params: { customerKey: string }): TossPaymentClient
}

interface Window {
  TossPayments?: (clientKey: string) => TossPaymentsInstance
}
