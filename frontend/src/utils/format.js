// Convierte "2026-04-13" → "13/04/2026"
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = String(dateStr).slice(0, 10)
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return dateStr
  return `${day}/${m}/${y}`
}

export const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

export const fmtN = (n) =>
  new Intl.NumberFormat('es-AR').format(n || 0)
