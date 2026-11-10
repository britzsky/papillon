import { useRef, useState } from 'react'

export type HomePhoto = { key: string; src: string; alt: string; /** 카드에서 보일 부분(object-position) */ position: string }

/**
 * PC 홈 D-1~D-3 사진 카드 + 크게 보기(2026-11-10 사용자 요청: 카드는 일부만 보여서, 누르면 원래 비율로 크게).
 * 크게 보기는 <dialog>(Esc·바깥 클릭·닫기로 닫힘, 닫으면 누른 카드로 포커스가 돌아감). ←/→ 또는 화살표 버튼으로 다른 사진.
 */
export default function HomePhotoCards({ photos }: { photos: HomePhoto[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(0)
  const count = photos.length
  const current = photos[index]
  const go = (step: number) => setIndex(value => (value + step + count) % count)

  const open = (i: number) => { setIndex(i); dialogRef.current?.showModal() }
  const close = () => dialogRef.current?.close()

  return <>
    <div className="home-main__cards">
      {photos.map((photo, i) => (
        <button key={photo.key} type="button" className="home-main__card home-main__photo" onClick={() => open(i)}
          aria-label={`${photo.alt} — 크게 보기`} aria-haspopup="dialog">
          <img src={photo.src} alt="" loading="lazy" style={{ objectPosition: photo.position }} />
          <span className="home-main__photo-zoom" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5M11 8v6M8 11h6" /></svg>
          </span>
        </button>
      ))}
    </div>

    <dialog ref={dialogRef} className="photo-viewer" aria-label="사진 크게 보기"
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
      onKeyDown={(event) => {
        if (count < 2) return
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1) }
        if (event.key === 'ArrowRight') { event.preventDefault(); go(1) }
      }}>
      {current ? <figure className="photo-viewer__figure">
        <img src={current.src} alt={current.alt} />
        <figcaption>{current.alt}{count > 1 ? <span className="photo-viewer__count"> · {index + 1} / {count}</span> : null}</figcaption>
      </figure> : null}
      <button type="button" className="photo-viewer__btn is-close" onClick={close} aria-label="닫기" autoFocus>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      {count > 1 ? <>
        <button type="button" className="photo-viewer__btn is-prev" onClick={() => go(-1)} aria-label="이전 사진">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className="photo-viewer__btn is-next" onClick={() => go(1)} aria-label="다음 사진">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </> : null}
    </dialog>
  </>
}
