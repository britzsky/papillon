// 메뉴명·식사로 메뉴유형·구분·음식 분류를 미리 고른다(PDF 메뉴 등록 창·미등록 메뉴 한꺼번에 정리 공용)

const SNACK_SLOTS = [1, 3, 4, 6, 7, 8]

/** 메뉴명으로 메뉴유형·구분·음식 분류를 미리 고른다. 사용자가 확인·수정한다 */
export function guessKinds(name: string, slotCode: number | null) {
  const text = name.replace(/\s+/g, '')
  if (/(주스|쥬스|식혜|음료|우유|쿨|에이드|차)$/.test(text)) return { menuType: '3', gubun: '16', category: '간식' }
  if (slotCode !== null && SNACK_SLOTS.includes(slotCode)) return { menuType: '2', gubun: '13', category: '간식' }
  const rules: Array<[RegExp, string, string]> = [
    [/(밥|죽|덮밥|비빔밥|볶음밥|카레라이스|라이스)$/, '0', '0'],
    [/(국|탕|찌개|전골|장)$/, '0', '1'],
    [/(우동|국수|면|수제비|쫄면|파스타|스파게티)$/, '0', '7'],
    [/(무침|생채|겉절이)$/, '1', '2'],
    [/(튀김|까스|강정|커틀릿)/, '1', '3'],
    [/구이$/, '1', '4'],
    [/(찜|수육)$/, '1', '5'],
    [/(전|부침|계란말이|스크램블)$/, '1', '6'],
    [/조림$/, '1', '8'],
    [/볶음$/, '1', '9'],
    [/나물$/, '1', '10'],
    [/샐러드$/, '1', '11'],
    [/(김치|깍두기|피클|장아찌|지)$/, '1', '14'],
  ]
  const hit = rules.find(([pattern]) => pattern.test(text))
  return hit ? { menuType: hit[1], gubun: hit[2], category: '한식' } : { menuType: '1', gubun: '17', category: '한식' }
}
