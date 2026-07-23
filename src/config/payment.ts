export const TOSS_PAYMENTS_CLIENT_KEY = import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY?.trim() ?? ''
export const TOSS_PAYMENTS_STORE_NAME = import.meta.env.VITE_TOSS_PAYMENTS_STORE_NAME?.trim() ?? 'Papillon'
export const DEFAULT_SUBSCRIPTION_AMOUNT = Number(import.meta.env.VITE_SUBSCRIPTION_AMOUNT ?? '49000')

export function getPaymentBaseUrl() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.origin
}
