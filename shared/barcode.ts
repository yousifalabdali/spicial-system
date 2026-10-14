// Code 128 barcode encoder (no dependencies). Used by the renderer for previews
// and by the main process for printed labels, so both draw the exact same bars.

// Bar/space widths for symbol values 0..105, then the stop symbol.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104, START_C = 105, TO_C = 99, STOP = 106

/** True if the text can be printed as Code 128 (printable ASCII only). */
export function isEncodable(text: string) {
  return text.length > 0 && /^[\x20-\x7e]+$/.test(text)
}

/** Symbol values: Code C for digit runs (half the width), Code B otherwise. */
function symbols(text: string): number[] {
  if (/^\d+$/.test(text) && text.length >= 4) {
    const odd = text.length % 2 === 1
    const out = odd ? [START_B, text.charCodeAt(0) - 32, TO_C] : [START_C]
    for (let i = odd ? 1 : 0; i < text.length; i += 2) out.push(Number(text.slice(i, i + 2)))
    return out
  }
  return [START_B, ...[...text].map((c) => c.charCodeAt(0) - 32)]
}

/** Module string: "1" = bar, "0" = space. */
export function encode128(text: string): string {
  if (!isEncodable(text)) throw new Error('الباركود يقبل الأرقام والحروف الإنجليزية فقط')
  const s = symbols(text)
  const check = s.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103
  return [...s, check, STOP]
    .map((v) => [...PATTERNS[v]].map((w, i) => (i % 2 ? '0' : '1').repeat(Number(w))).join(''))
    .join('')
}

/** SVG of the bars (no text), scaled to fill its box. */
export function barcodeSvg(text: string, opts: { height?: number; quiet?: number } = {}) {
  const modules = encode128(text)
  const quiet = opts.quiet ?? 10
  const height = opts.height ?? 50
  const width = modules.length + quiet * 2
  let rects = ''
  for (let i = 0; i < modules.length;) {
    if (modules[i] === '1') {
      let j = i
      while (modules[j] === '1') j++
      rects += `<rect x="${i + quiet}" y="0" width="${j - i}" height="${height}"/>`
      i = j
    } else i++
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">${rects}</svg>`
}

/** A new in-store EAN-13 number (prefix 2 is reserved for internal use). */
export function generateEan13() {
  const body = '2' + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return body + ((10 - (sum % 10)) % 10)
}
