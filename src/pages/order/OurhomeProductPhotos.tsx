import { useState } from 'react'
import type { OurhomeProduct } from '../../api/ourhome'

function validImage(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !/noimg/i.test(url.pathname) ? url.href : ''
  } catch { return '' }
}
function Photo({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false)
  return <figure style={{ margin: 0 }}><figcaption>{label}</figcaption>{failed ? <p>사진을 불러오지 못했습니다.</p> : <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ maxWidth: '100%', width: 220, height: 180, objectFit: 'contain' }} /></a>}</figure>
}
export default function OurhomeProductPhotos({ product }: { product: OurhomeProduct }) {
  const main = validImage(product.img1) || validImage(product.imageRoute)
  const label = validImage(product.img2)
  return <div aria-label="상품 사진" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBlock: 16 }}>
    {main ? <Photo key={main} url={main} label={`${product.goodnm} 상품 사진`} /> : <p>상품 사진 미제공</p>}
    {label && label !== main && <Photo key={label} url={label} label={`${product.goodnm} 라벨 사진`} />}
  </div>
}
