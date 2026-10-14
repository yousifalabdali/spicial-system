/** CSV text that Excel opens with Arabic intact (UTF-8 BOM, CRLF lines). */
export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
}
