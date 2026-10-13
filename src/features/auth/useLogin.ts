import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, SubscriptionActionRequiredError, type PaymentRequiredSubscriptionStatus } from '../../api/auth'

export type LoginAlertState =
  | { kind: 'info'; message: string }
  | { kind: 'payment'; message: string; accountId: string; status: PaymentRequiredSubscriptionStatus }

/** 로그인(PC·터치 공용): 아이디·비밀번호 로그인, 구독 결제가 필요하면 결제 안내, 결제 테스트 화면 바로가기 */
export function useLogin() {
  const navigate = useNavigate()
  const [user_id, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [alertState, setAlertState] = useState<LoginAlertState | null>(null)

  const closeAlert = () => setAlertState(null)

  const navigateToPayment = (accountId: string, status: PaymentRequiredSubscriptionStatus) => {
    localStorage.setItem('pending_payment_account_id', accountId)
    localStorage.setItem('pending_payment_status', status)

    if (!localStorage.getItem('user_name')) {
      localStorage.setItem('user_name', 'Test User')
    }

    if (!localStorage.getItem('user_id')) {
      localStorage.setItem('user_id', 'tester01')
    }

    navigate('/payment', { state: { accountId, status } })
  }

  const handleMoveToPayment = () => {
    if (!alertState || alertState.kind !== 'payment') return
    closeAlert()
    navigateToPayment(alertState.accountId, alertState.status)
  }

  const handleOpenPaymentSandbox = () => {
    navigateToPayment('TEST_ACCOUNT_001', 'EMPTY')
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      setIsLoading(true)
      await login({ user_id, password })
    } catch (error) {
      if (error instanceof SubscriptionActionRequiredError) {
        setAlertState({ kind: 'payment', message: error.message, accountId: error.accountId, status: error.status })
      } else {
        setAlertState({ kind: 'info', message: error instanceof Error ? error.message : 'Login failed.' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return { user_id, setUserId, password, setPassword, isLoading, alertState, closeAlert, handleMoveToPayment, handleOpenPaymentSandbox, handleSubmit }
}
