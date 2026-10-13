/**
 * 재시도해도 서버에 한 번만 반영되게 하는 요청키·세션 id(UUID v4, 36자).
 * crypto.randomUUID는 보안 컨텍스트(https·localhost)에서만 있어, http 운영 서버에서는 getRandomValues(보안 컨텍스트 불필요)로
 * 같은 모양의 UUID를 만든다. 서버 컬럼이 36자(search_session_id 등)라 모양·길이를 바꾸지 않는다.
 */
export function newRequestKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
