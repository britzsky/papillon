type ImageRecord = Record<string, unknown>

function imageUrl(value: unknown, base?: string): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim(), base)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

/** Welstory supplies imgDomain + imgURLs[{ thumb, img }]; DB APIs may return image_url. */
export function getProductOriginalImageUrl(record: ImageRecord, base?: string): string {
  const original = imageUrl(record.image_url, base) || imageUrl(record.imageUrl, base)
  if (original) return original
  const domain = imageUrl(record.imgDomain) || base
  const images = Array.isArray(record.imgURLs) ? record.imgURLs : []
  for (const entry of images) {
    if (!entry || typeof entry !== 'object') continue
    const url = imageUrl((entry as ImageRecord).img, domain)
    if (url) return url
  }
  return getProductImageUrl(record, base)
}

export function getProductImageUrl(record: ImageRecord, base?: string): string {
  const direct = imageUrl(record.thumbnail_url, base) || imageUrl(record.image_url, base) || imageUrl(record.imageUrl, base)
  if (direct) return direct
  const domain = imageUrl(record.imgDomain) || base
  const images = Array.isArray(record.imgURLs) ? record.imgURLs : []
  for (const entry of images) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as ImageRecord
    const url = imageUrl(row.thumb, domain) || imageUrl(row.img, domain)
    if (url) return url
  }
  return ''
}
