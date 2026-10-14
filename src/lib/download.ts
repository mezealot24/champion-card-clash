function save(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, rows: object[]) {
  save(filename, JSON.stringify(rows, null, 2), 'application/json')
}

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// BOM so Excel opens Thai text as UTF-8
export function downloadCsv(filename: string, rows: object[]) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const lines = [keys.join(','), ...rows.map((r) => keys.map((k) => cell((r as Record<string, unknown>)[k])).join(','))]
  save(filename, '﻿' + lines.join('\n'), 'text/csv;charset=utf-8')
}
