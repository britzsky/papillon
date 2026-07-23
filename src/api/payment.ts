const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard'

let tossSdkPromise: Promise<TossPaymentsInstance> | null = null

function appendScript() {
  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${TOSS_SDK_URL}"]`)
    if (existingScript) {
      if (window.TossPayments) {
        resolve()
        return
      }

      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('결제 SDK를 불러오지 못했습니다.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = TOSS_SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('결제 SDK를 불러오지 못했습니다.'))
    document.head.appendChild(script)
  })
}

export async function loadTossPayments(clientKey: string) {
  if (!clientKey) {
    throw new Error('토스페이먼츠 클라이언트 키가 설정되지 않았습니다.')
  }

  if (!tossSdkPromise) {
    tossSdkPromise = appendScript().then(() => {
      if (!window.TossPayments) {
        throw new Error('결제 SDK 초기화 함수를 찾을 수 없습니다.')
      }

      return window.TossPayments(clientKey)
    })
  }

  return tossSdkPromise
}
