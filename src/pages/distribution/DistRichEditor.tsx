import { useEffect, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import { descriptionHtml } from '../../features/dist/productInfo'

type ImageOption = { url: string; label: string }

/**
 * 상품 상세 설명 편집기(2026-11-04, TipTap). 굵게·제목·목록·정렬·표·이미지(주소 또는 등록된 상품 이미지)·링크.
 * 저장 값은 HTML — 서버(jsoup)·더채움몰(DOMPurify)이 허용 태그만 남긴다. 상품을 바꾸면 key로 새로 만든다(처음 값만 읽음).
 */
export default function DistRichEditor({ id, value, onChange, disabled, images }: {
  id: string; value: unknown; onChange: (html: string) => void; disabled?: boolean; images: ImageOption[]
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto', 'tel'] },
      }),
      Image.configure({ allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: descriptionHtml(value),
    editable: !disabled,
    editorProps: { attributes: { id, class: 'dist-rte__content', 'aria-label': '상세 설명', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? '' : current.getHTML()),
  })
  useEffect(() => { editor?.setEditable(!disabled, false) }, [editor, disabled])
  if (!editor) return null
  return <div className={`dist-rte${disabled ? ' is-disabled' : ''}`}>
    <Toolbar editor={editor} images={images} disabled={disabled} />
    <EditorContent editor={editor} />
  </div>
}

function Toolbar({ editor, images, disabled }: { editor: Editor; images: ImageOption[]; disabled?: boolean }) {
  const [imagePanel, setImagePanel] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : e.isActive('heading', { level: 4 }) ? 'h4' : 'p',
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'), link: e.isActive('link'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }),
      table: e.isActive('table'), undo: e.can().undo(), redo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()
  const setBlock = (block: string) => {
    if (block === 'p') chain().setParagraph().run()
    else chain().setHeading({ level: Number(block.slice(1)) as 2 | 3 | 4 }).run()
  }
  const link = () => {
    const current = String(editor.getAttributes('link').href ?? '')
    const href = window.prompt('링크 주소(https://…). 비우면 링크를 뺍니다.', current)
    if (href === null) return
    if (!href.trim()) chain().extendMarkRange('link').unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: href.trim() }).run()
  }
  const insertImage = (src: string) => {
    if (!src.trim()) return
    // setImage는 넣은 이미지를 선택한 채로 둬서 다음 글자·표가 이미지를 덮어쓴다 — 빈 문단을 같이 넣고 커서를 거기로
    chain().insertContent([{ type: 'image', attrs: { src: src.trim(), alt: '' } }, { type: 'paragraph' }]).run()
    setImageUrl(''); setImagePanel(false)
  }
  const button = (label: string, onClick: () => void, active = false, title = label, enabled = true) =>
    <button type="button" className={`dist-rte__btn${active ? ' is-active' : ''}`} aria-pressed={active} title={title} aria-label={title} disabled={disabled || !enabled} onClick={onClick}>{label}</button>

  return <div className="dist-rte__toolbar" role="toolbar" aria-label="상세 설명 서식">
    <select className="rd-input dist-rte__block" aria-label="문단 종류" value={state.block} disabled={disabled} onChange={event => setBlock(event.target.value)}>
      <option value="p">본문</option><option value="h2">큰 제목</option><option value="h3">중간 제목</option><option value="h4">작은 제목</option>
    </select>
    <span className="dist-rte__group">
      {button('B', () => chain().toggleBold().run(), state.bold, '굵게')}
      {button('I', () => chain().toggleItalic().run(), state.italic, '기울임')}
      {button('U', () => chain().toggleUnderline().run(), state.underline, '밑줄')}
      {button('S', () => chain().toggleStrike().run(), state.strike, '취소선')}
    </span>
    <span className="dist-rte__group">
      {button('• 목록', () => chain().toggleBulletList().run(), state.bullet, '글머리 목록')}
      {button('1. 목록', () => chain().toggleOrderedList().run(), state.ordered, '번호 목록')}
      {button('인용', () => chain().toggleBlockquote().run(), state.quote, '인용·강조 상자')}
      {button('구분선', () => chain().setHorizontalRule().run(), false, '구분선')}
    </span>
    <span className="dist-rte__group">
      {button('왼쪽', () => chain().setTextAlign('left').run(), state.left, '왼쪽 정렬')}
      {button('가운데', () => chain().setTextAlign('center').run(), state.center, '가운데 정렬')}
      {button('오른쪽', () => chain().setTextAlign('right').run(), state.right, '오른쪽 정렬')}
    </span>
    <span className="dist-rte__group">
      {button('링크', link, state.link, '링크 넣기·빼기')}
      {button('이미지', () => setImagePanel(open => !open), imagePanel, '이미지 넣기')}
      {button('표', () => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run(), false, '표 넣기(3줄 2칸)')}
    </span>
    <span className="dist-rte__group">
      {button('↶', () => chain().undo().run(), false, '되돌리기', state.undo)}
      {button('↷', () => chain().redo().run(), false, '다시 하기', state.redo)}
    </span>
    {state.table ? <span className="dist-rte__group dist-rte__table" aria-label="표 편집">
      {button('줄 추가', () => chain().addRowAfter().run(), false, '아래에 줄 추가')}
      {button('칸 추가', () => chain().addColumnAfter().run(), false, '오른쪽에 칸 추가')}
      {button('줄 삭제', () => chain().deleteRow().run(), false, '이 줄 삭제')}
      {button('칸 삭제', () => chain().deleteColumn().run(), false, '이 칸 삭제')}
      {button('제목 칸', () => chain().toggleHeaderColumn().run(), false, '첫 칸을 제목 칸으로')}
      {button('표 삭제', () => chain().deleteTable().run(), false, '표 삭제')}
    </span> : null}
    {imagePanel ? <div className="dist-rte__images">
      {images.length ? <>
        <p className="rd-muted">등록된 상품 이미지에서 고르기(이미지 탭에서 추가)</p>
        <ul>{images.map(image => <li key={image.url}>
          <button type="button" className="dist-rte__pick" onClick={() => insertImage(image.url)} aria-label={`${image.label} 넣기`}><img src={image.url} alt="" /></button>
        </li>)}</ul>
      </> : null}
      {/* 상품 저장 form 안이라 form을 겹치지 않는다 — Enter는 직접 처리 */}
      <div className="dist-inline">
        <input className="rd-input dist-url" type="url" aria-label="이미지 주소" placeholder="이미지 주소 https://" value={imageUrl} onChange={event => setImageUrl(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); insertImage(imageUrl) } }} />
        <button type="button" className="rd-btn is-primary" disabled={!imageUrl.trim()} onClick={() => insertImage(imageUrl)}>넣기</button>
        <button type="button" className="rd-btn" onClick={() => setImagePanel(false)}>닫기</button>
      </div>
    </div> : null}
  </div>
}
