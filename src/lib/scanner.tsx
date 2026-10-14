// USB / Bluetooth barcode scanners act as a keyboard: they "type" the code very fast, then Enter.
// This provider tells a scan from a person typing by the gap between keys, and hands the code
// to the most recently registered handler (a page or an open dialog), wherever focus is.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const MAX_GAP_MS = 50 // scanners send a key every ~5-30ms; people need 80ms+
const MIN_LENGTH = 4

type Handler = (code: string) => boolean | void // return false to pass the scan to the next handler
type Ctx = { register: (h: { current: Handler }, fallback?: boolean) => () => void;lastScan: { code: string; at: number } | null }

const ScannerCtx = createContext<Ctx>({ register: () => () => {}, lastScan: null })

// Physical key -> character, so scans work even when the keyboard layout is Arabic.
const SHIFTED: Record<string, string> = { Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$', Digit5: '%', Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(', Digit0: ')', Minus: '_', Equal: '+', Slash: '?', Period: '>', Comma: '<', Semicolon: ':', Quote: '"', BracketLeft: '{', BracketRight: '}', Backslash: '|', Backquote: '~' }
const PLAIN: Record<string, string> = { Minus: '-', Equal: '=', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Space: ' ', NumpadDecimal: '.', NumpadSubtract: '-', NumpadAdd: '+', NumpadMultiply: '*', NumpadDivide: '/' }

function charOf(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  if (/^[\x20-\x7e]$/.test(e.key)) return e.key // English layout: the key is already right
  const { code } = e
  let m = /^Key([A-Z])$/.exec(code)
  if (m) return e.shiftKey !== e.getModifierState('CapsLock') ? m[1] : m[1].toLowerCase()
  m = /^(?:Digit|Numpad)(\d)$/.exec(code)
  if (m) return e.shiftKey && code.startsWith('Digit') ? SHIFTED[code] : m[1]
  if (e.shiftKey && SHIFTED[code]) return SHIFTED[code]
  if (PLAIN[code]) return PLAIN[code]
  return e.key.length === 1 ? e.key : null
}

type Field = HTMLInputElement | HTMLTextAreaElement

/** Put a React-controlled field back to a value (React ignores plain .value writes). */
function restoreField(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<{ current: Handler }[]>([])
  const [lastScan, setLastScan] = useState<Ctx['lastScan']>(null)

  useEffect(() => {
    let buf = ''
    let last = 0
    let field: { el: Field; value: string } | null = null

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) { buf = ''; return } // a held-down key, not a scanner
      const now = performance.now()
      const gap = now - last
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buf.length >= MIN_LENGTH && gap < MAX_GAP_MS * 2) {
          e.preventDefault()
          e.stopPropagation()
          // The scanner's characters already landed in the focused field: undo that.
          if (field && document.activeElement === field.el) restoreField(field.el, field.value)
          const code = buf
          setLastScan({ code, at: Date.now() })
          for (const h of [...handlers.current].reverse()) if (h.current(code) !== false) break
        }
        buf = ''; field = null
        return
      }
      const ch = charOf(e)
      if (ch === null) return
      if (gap > MAX_GAP_MS || !buf) {
        // Start of a possible scan: remember the focused field's text before the first key lands.
        buf = ch
        const el = document.activeElement
        field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? { el, value: el.value } : null
      } else {
        buf += ch
      }
      last = now
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const register = useCallback((h: { current: Handler }, fallback = false) => {
    if (fallback) handlers.current.unshift(h)
    else handlers.current.push(h)
    return () => { handlers.current = handlers.current.filter((x) => x !== h) }
  }, [])

  return <ScannerCtx.Provider value={{ register, lastScan }}>{children}</ScannerCtx.Provider>
}

/** Receive scans while `enabled`. The newest registration gets each scan first;
 *  a `fallback` handler only gets scans nobody else took. */
export function useScanner(onScan: Handler, enabled = true, fallback = false) {
  const { register } = useContext(ScannerCtx)
  const ref = useRef(onScan)
  ref.current = onScan
  useEffect(() => (enabled ? register(ref, fallback) : undefined), [enabled, fallback, register])
}

export const useLastScan = () => useContext(ScannerCtx).lastScan
