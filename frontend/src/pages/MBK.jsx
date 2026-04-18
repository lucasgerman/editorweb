import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Search, Package2, MapPin, Users, Eye, Upload, CheckCircle, XCircle, ImageIcon, ClipboardList, AlertCircle, SlidersHorizontal, DollarSign } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

// ── HELPERS DE IMPORTACIÓN ───────────────────────────────────

function parseNum(v) {
  if (v == null || v === '') return ''
  const s = String(v)
    .replace(/[a-zA-Z$]/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(s) || 0
}

function parseDate(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}

const COLS_MBK = ['cliente_nombre', 'mbk_raw', 'kg_real', 'kg_fact', 'vkg', '_costo_total', 'kg_vta', '_venta', '_ganancia']
const COLS_LABELS = ['Cliente', 'MBK', 'KG Real', 'KG Fact', 'KG Costo', 'Costo Total', 'KG Vta', 'Venta', 'Ganancia']

const HEADER_WORDS = /^(cliente|mbk|kg|vkg|venta|ganancia|costo|real|fact)$/i
const DEFAULT_FECHA = '2026-01-01'

function parseMBKExcel(texto) {
  const lines = texto.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ','
  const firstCols = lines[0].split(sep).map(c => c.trim())
  const firstIsHeader = firstCols.some(c => HEADER_WORDS.test(c))
  const dataLines = firstIsHeader ? lines.slice(1) : lines

  return dataLines.map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''))
    const row = {}
    COLS_MBK.forEach((col, i) => { row[col] = vals[i] ?? '' })
    const raw = (row.mbk_raw || '').trim()
    row.codigo = raw ? (raw.toUpperCase().startsWith('MBK') ? raw.toUpperCase() : `MBK${raw}`) : ''
    return row
  }).filter(r => r.kg_real || r.cliente_nombre)
}

function ImportModal({ open, onClose, onImported }) {
  const [paso, setPaso] = useState('paste')
  const [texto, setTexto] = useState('')
  const [filasParsed, setFilasParsed] = useState([])
  const [clientes, setClientes] = useState([])
  const [resoluciones, setResoluciones] = useState({})
  const [busquedas, setBusquedas] = useState({})
  const [resultados, setResultados] = useState({})
  const [preview, setPreview] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!open) { setPaso('paste'); setTexto(''); setFilasParsed([]); setResoluciones({}); setBusquedas({}); setResultados({}); setPreview([]) }
    else { axios.get('/api/mbk/clientes').then(r => setClientes(r.data)) }
  }, [open])

  const analizar = () => {
    if (!texto.trim()) { toast.error('Pegá el contenido primero'); return }
    const rows = parseMBKExcel(texto)
    if (rows.length === 0) { toast.error('No se detectaron filas'); return }
    setFilasParsed(rows)

    const clienteMap = {}
    clientes.forEach(c => { clienteMap[c.nombre.toLowerCase().trim()] = c })

    const nombresRaw = [...new Set(rows.map(r => (r.cliente_nombre || '').trim()).filter(Boolean))]
    const noResueltos = nombresRaw.filter(n => !clienteMap[n.toLowerCase()])

    if (noResueltos.length > 0) {
      const init = {}
      noResueltos.forEach(n => { init[n] = { cliente: null, skip: false } })
      setResoluciones(init)
      setPaso('resolve')
    } else {
      construirPreview(rows, {}, clienteMap)
      setPaso('preview')
    }
  }

  const construirPreview = (rows, resols, clienteMap) => {
    const map = clienteMap || {}
    clientes.forEach(c => { map[c.nombre.toLowerCase().trim()] = c })

    const parsed = rows.map((r, i) => {
      const vkg = parseNum(r.vkg) || 0
      const kg_real = parseNum(r.kg_real) || 0
      const kg_fact = parseNum(r.kg_fact) || 0
      const kg_vta = parseNum(r.kg_vta) || 60
      const costo_total = parseFloat((kg_real * vkg).toFixed(2))
      const venta = parseFloat((kg_fact * kg_vta).toFixed(2))
      const ganancia = parseFloat((venta - costo_total).toFixed(2))

      const nombreRaw = (r.cliente_nombre || '').trim()
      const cliente = map[nombreRaw.toLowerCase()] || resols[nombreRaw]?.cliente || null

      return {
        _fila: i + 1,
        codigo: r.codigo,
        fecha: DEFAULT_FECHA,
        origen_nombre: 'Pendiente',
        kg_real, kg_fact, vkg, kg_vta,
        costo_total, venta, ganancia,
        cliente_nombre: nombreRaw,
        cliente_id: cliente?.id || null,
        cliente_label: cliente ? cliente.nombre : (nombreRaw || '—'),
        monto_pagado: 0,
        notas: null
      }
    })
    setPreview(parsed)
  }

  const buscarCliente = async (nombreRaw, q) => {
    setBusquedas(prev => ({ ...prev, [nombreRaw]: q }))
    if (q.length < 2) { setResultados(prev => ({ ...prev, [nombreRaw]: [] })); return }
    const r = await axios.get('/api/mbk/clientes')
    const filtered = r.data.filter(c => c.nombre.toLowerCase().includes(q.toLowerCase()))
    setResultados(prev => ({ ...prev, [nombreRaw]: filtered }))
  }

  const asignarCliente = (nombreRaw, cliente) => {
    setResoluciones(prev => ({ ...prev, [nombreRaw]: { cliente, skip: false } }))
    setBusquedas(prev => ({ ...prev, [nombreRaw]: cliente.nombre }))
    setResultados(prev => ({ ...prev, [nombreRaw]: [] }))
  }

  const confirmarResoluciones = () => {
    const sinResolver = Object.entries(resoluciones).filter(([, v]) => !v.cliente && !v.skip)
    if (sinResolver.length > 0) {
      toast.error(`Falta resolver: ${sinResolver.map(([k]) => k).join(', ')}`)
      return
    }
    const clienteMap = {}
    clientes.forEach(c => { clienteMap[c.nombre.toLowerCase().trim()] = c })
    construirPreview(filasParsed, resoluciones, clienteMap)
    setPaso('preview')
  }

  const importar = async () => {
    if (preview.length === 0) { toast.error('Sin filas para importar'); return }
    setCargando(true)
    try {
      const payload = preview.map(r => ({
        codigo: r.codigo,
        fecha: r.fecha,
        origen_nombre: r.origen_nombre,
        kg_real: r.kg_real,
        kg_fact: r.kg_fact,
        vkg: r.vkg,
        kg_vta: r.kg_vta,
        cliente_id: r.cliente_id,
        monto_pagado: 0,
        notas: null
      }))
      const res = await axios.post('/api/mbk/envios/bulk', payload)
      toast.success(`${res.data.importados} envíos importados${res.data.errores > 0 ? ` (${res.data.errores} errores)` : ''}`)
      onImported()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al importar')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar envíos desde Excel" size="xl">
      {paso === 'paste' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Orden de columnas esperado:</p>
            <div className="flex flex-wrap gap-1">
              {COLS_LABELS.map((l, i) => (
                <span key={i} className={`text-xs px-2 py-0.5 rounded font-mono
                  ${['_costo_total','_venta','_ganancia','_mbk'].includes(COLS_MBK[i])
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 line-through'
                    : 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'}`}>
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Pegá el contenido del Excel</label>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              className="input font-mono text-xs"
              rows={14}
              placeholder="Juan Pérez	MBK00001	10.5	11	15	157.50	25	275	117.50"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={analizar} className="btn-primary">Analizar</button>
          </div>
        </div>
      )}

      {paso === 'resolve' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Los siguientes clientes no existen. Asignales uno existente o marcalos para dejar sin asignar.
          </p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {Object.keys(resoluciones).map(nombreRaw => {
              const res = resoluciones[nombreRaw]
              return (
                <div key={nombreRaw} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">"{nombreRaw}"</span>
                    {res.cliente && <span className="badge badge-green">{res.cliente.nombre}</span>}
                    {res.skip && <span className="badge badge-gray">Sin asignar</span>}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={busquedas[nombreRaw] || ''}
                        onChange={e => buscarCliente(nombreRaw, e.target.value)}
                        placeholder="Buscar cliente..."
                        className="input pl-8 text-sm"
                      />
                      {(resultados[nombreRaw] || []).length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {resultados[nombreRaw].map(c => (
                            <button key={c.id} type="button" onClick={() => asignarCliente(nombreRaw, c)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                              {c.nombre}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setResoluciones(prev => ({ ...prev, [nombreRaw]: { cliente: null, skip: true } }))}
                      className="btn-secondary text-xs px-3"
                    >
                      Sin asignar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPaso('paste')} className="btn-secondary">Volver</button>
            <button onClick={confirmarResoluciones} className="btn-primary">Continuar</button>
          </div>
        </div>
      )}

      {paso === 'preview' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <CheckCircle size={16} className="text-green-500" />
            <span>{preview.length} envíos listos para importar</span>
          </div>
          <div className="overflow-auto max-h-96 border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Código</th>
                  <th className="table-header">Cliente</th>
                  <th className="table-header text-right">KG Real/Fact</th>
                  <th className="table-header text-right">KG Costo</th>
                  <th className="table-header text-right">KG Vta</th>
                  <th className="table-header text-right">Costo Total</th>
                  <th className="table-header text-right">Venta</th>
                  <th className="table-header text-right">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(r => (
                  <tr key={r._fila} className="table-row">
                    <td className="table-cell text-gray-400">{r._fila}</td>
                    <td className="table-cell font-mono text-primary-600 dark:text-primary-400">{r.codigo || '—'}</td>
                    <td className="table-cell">{r.cliente_label}</td>
                    <td className="table-cell text-right">{fmtNum(r.kg_real)} / {fmtNum(r.kg_fact)}</td>
                    <td className="table-cell text-right">{fmt(r.vkg)}</td>
                    <td className="table-cell text-right">{fmt(r.kg_vta)}</td>
                    <td className="table-cell text-right">{fmt(r.costo_total)}</td>
                    <td className="table-cell text-right">{fmt(r.venta)}</td>
                    <td className={`table-cell text-right font-semibold ${r.ganancia >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(r.ganancia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPaso(Object.keys(resoluciones).length > 0 ? 'resolve' : 'paste')} className="btn-secondary">Volver</button>
            <button onClick={importar} disabled={cargando} className="btn-primary">
              {cargando ? 'Importando...' : `Importar ${preview.length} envío${preview.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtNum = (n) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtUSD = (n) =>
  `u$s ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

function estadoPagoBadge(monto_pagado, venta) {
  if (venta <= 0 || monto_pagado >= venta) return { label: 'Cobrado', cls: 'badge-green' }
  if (!monto_pagado || monto_pagado <= 0) return { label: 'No cobrado', cls: 'badge-red' }
  return { label: 'Parcial', cls: 'badge-yellow' }
}

// ── CLIENTES ────────────────────────────────────────────────

function ClientesTab() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState([])
  const [modal, setModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [detailCliente, setDetailCliente] = useState(null)
  const [detailEnvios, setDetailEnvios] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '' })

  const load = async () => {
    const r = await axios.get('/api/mbk/clientes')
    setData(r.data)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm({ nombre: '' }); setModal(true) }
  const openEdit = (c) => { setEditing(c); setForm({ nombre: c.nombre }); setModal(true) }

  const openDetail = async (c) => {
    setDetailCliente(c)
    const r = await axios.get(`/api/mbk/clientes/${c.id}/envios`)
    setDetailEnvios(r.data)
    setDetailModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        await axios.put(`/api/mbk/clientes/${editing.id}`, form)
        toast.success('Cliente actualizado')
      } else {
        await axios.post('/api/mbk/clientes', form)
        toast.success('Cliente creado')
      }
      setModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este cliente?')) return
    try {
      await axios.delete(`/api/mbk/clientes/${id}`)
      toast.success('Eliminado')
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'No se puede eliminar') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm text-gray-500">Clientes y su estado de cuenta</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo cliente</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Nombre</th>
              <th className="table-header text-right">Envíos</th>
              <th className="table-header text-right">Total Venta</th>
              <th className="table-header text-right">Pagado</th>
              <th className="table-header text-right">Saldo</th>
              <th className="table-header">Estado</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin clientes</td></tr>
            )}
            {data.map(c => {
              const saldo = (c.total_venta || 0) - (c.total_pagado || 0)
              const badge = estadoPagoBadge(c.total_pagado, c.total_venta)
              return (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium">{c.nombre}</td>
                  <td className="table-cell text-right">{c.total_envios}</td>
                  <td className="table-cell text-right font-mono">{fmt(c.total_venta)}</td>
                  <td className="table-cell text-right font-mono text-green-600 dark:text-green-400">{fmt(c.total_pagado)}</td>
                  <td className={`table-cell text-right font-mono font-semibold ${saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmt(saldo)}
                  </td>
                  <td className="table-cell"><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                  <td className="table-cell">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openDetail(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Ver envíos">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar">
                        <Pencil size={14} />
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input value={form.nombre} onChange={e => setForm({ nombre: e.target.value })} className="input" required autoFocus />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal open={detailModal} onClose={() => setDetailModal(false)} title={`Envíos de ${detailCliente?.nombre}`}>
        <div className="space-y-3">
          {detailEnvios.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin envíos asociados</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Código</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header text-right">Venta</th>
                  <th className="table-header text-right">Pagado</th>
                  <th className="table-header text-right">Saldo</th>
                  <th className="table-header">Estado</th>
                </tr>
              </thead>
              <tbody>
                {detailEnvios.map(e => {
                  const saldo = (e.venta || 0) - (e.monto_pagado || 0)
                  const badge = estadoPagoBadge(e.monto_pagado, e.venta)
                  return (
                    <tr key={e.id} className="table-row">
                      <td className="table-cell font-mono font-semibold text-primary-600 dark:text-primary-400">{e.codigo}</td>
                      <td className="table-cell">{e.fecha}</td>
                      <td className="table-cell text-right font-mono">{fmt(e.venta)}</td>
                      <td className="table-cell text-right font-mono text-green-600 dark:text-green-400">{fmt(e.monto_pagado)}</td>
                      <td className={`table-cell text-right font-mono font-semibold ${saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmt(saldo)}</td>
                      <td className="table-cell"><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={() => setDetailModal(false)} className="btn-secondary">Cerrar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── ORÍGENES ABM ────────────────────────────────────────────

function OrigenesTab() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '', precio_kg: '' })

  const load = async () => {
    const r = await axios.get('/api/mbk/origenes')
    setData(r.data)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm({ nombre: '', precio_kg: '' }); setModal(true) }
  const openEdit = (o) => { setEditing(o); setForm({ nombre: o.nombre, precio_kg: o.precio_kg }); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const payload = { nombre: form.nombre, precio_kg: parseFloat(form.precio_kg) || 0 }
      if (editing) {
        await axios.put(`/api/mbk/origenes/${editing.id}`, { ...payload, activo: editing.activo })
        toast.success('Origen actualizado')
      } else {
        await axios.post('/api/mbk/origenes', payload)
        toast.success('Origen creado')
      }
      setModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este origen?')) return
    try {
      await axios.delete(`/api/mbk/origenes/${id}`)
      toast.success('Eliminado')
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'No se puede eliminar') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm text-gray-500">Definí los orígenes y su precio por KG</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo origen</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Nombre</th>
              <th className="table-header text-right">Precio / KG</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={3} className="table-cell text-center text-gray-400 py-8">Sin orígenes cargados</td></tr>
            )}
            {data.map(o => (
              <tr key={o.id} className="table-row">
                <td className="table-cell font-medium">{o.nombre}</td>
                <td className="table-cell text-right font-mono">{fmt(o.precio_kg)}</td>
                <td className="table-cell">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(o)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar">
                      <Pencil size={14} />
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(o.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar origen' : 'Nuevo origen'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="input" required placeholder="Ej: Miami, China, Europa..." />
          </div>
          <div>
            <label className="label">Precio por KG ($)</label>
            <input type="number" step="0.01" min="0" value={form.precio_kg} onChange={e => setForm({ ...form, precio_kg: e.target.value })} className="input" required placeholder="0.00" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── CONSTANTES DE ESTADO ────────────────────────────────────

const ESTADOS = [
  { key: 'pendiente', label: 'Pendiente',           dot: 'bg-gray-400',   ring: 'ring-gray-400'   },
  { key: 'recibido',  label: 'Recibido',             dot: 'bg-yellow-400', ring: 'ring-yellow-400' },
  { key: 'entregado', label: 'Entregado al cliente', dot: 'bg-green-500',  ring: 'ring-green-500'  },
]

function EstadoCircles({ estado, onCambiar }) {
  const current = estado || 'pendiente'
  return (
    <div className="flex gap-1.5 items-center">
      {ESTADOS.map(e => (
        <button
          key={e.key}
          title={e.label}
          type="button"
          onClick={() => onCambiar && e.key !== current && onCambiar(e.key)}
          className={`w-3.5 h-3.5 rounded-full transition-all ${e.dot} ${
            e.key === current
              ? `ring-2 ring-offset-1 ${e.ring} scale-125`
              : 'opacity-30 hover:opacity-70 cursor-pointer'
          }`}
        />
      ))}
    </div>
  )
}

// ── CLIENTE COMBO (select registrados + texto libre) ─────────

function ClienteCombo({ clienteId, cliente, clientes, onChange }) {
  return (
    <div className="space-y-1.5">
      <select
        value={clienteId != null ? String(clienteId) : ''}
        onChange={e => {
          if (!e.target.value) {
            onChange({ cliente_id: null })
          } else {
            const c = clientes.find(c => String(c.id) === e.target.value)
            if (c) onChange({ cliente_id: c.id, cliente: c.nombre })
          }
        }}
        className="select text-sm"
      >
        <option value="">— Seleccionar cliente registrado —</option>
        {clientes.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
      </select>
      <input
        value={cliente || ''}
        onChange={e => onChange({ cliente: e.target.value, cliente_id: null })}
        className="input text-sm"
        placeholder="O escribí el nombre libremente..."
      />
    </div>
  )
}

// ── COTEJAR MANIFIESTO MODAL ────────────────────────────────

function CotejarManifiestoModal({ open, onClose, onConfirmado }) {
  const fileRef = useRef(null)
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [analizando, setAnalizando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [rowEdits, setRowEdits] = useState({})   // { [pendienteId]: { editando, cliente, cliente_id, peso, usd } }
  const [clientes, setClientes] = useState([])

  useEffect(() => {
    if (!open) {
      setArchivo(null); setPreview(null); setResultado(null)
      setSeleccionados(new Set()); setRowEdits({})
    } else {
      axios.get('/api/mbk/clientes').then(r => setClientes(r.data))
    }
  }, [open])

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setArchivo(f); setPreview(URL.createObjectURL(f)); setResultado(null); setRowEdits({})
  }

  const analizar = async () => {
    if (!archivo) { toast.error('Seleccioná una imagen'); return }
    setAnalizando(true)
    try {
      const fd = new FormData()
      fd.append('imagen', archivo)
      const r = await axios.post('/api/manifiesto/cotejar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResultado(r.data)
      setSeleccionados(new Set(r.data.encontrados.filter(e => e.diferencias.length === 0).map(e => e.pendiente.id)))
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al cotejar')
    } finally { setAnalizando(false) }
  }

  const toggleSel = (id) => setSeleccionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const startEdit = (p) => setRowEdits(prev => ({
    ...prev,
    [p.id]: { editando: true, cliente: p.cliente || '', cliente_id: p.cliente_id || null, peso: p.peso, usd: p.usd }
  }))

  const closeEdit = (id) => setRowEdits(prev => ({ ...prev, [id]: { ...prev[id], editando: false } }))

  const updateRowEdit = (id, changes) => setRowEdits(prev => ({
    ...prev, [id]: { ...prev[id], ...changes }
  }))

  const getEfectivo = (p) => {
    const ed = rowEdits[p.id]
    if (!ed) return p
    const peso = parseFloat(ed.peso) || p.peso
    const usd  = parseFloat(ed.usd)  || p.usd
    return { ...p, ...ed, peso, usd, precio_kg: peso && usd ? parseFloat((usd / peso).toFixed(4)) : p.precio_kg }
  }

  const confirmar = async () => {
    if (seleccionados.size === 0) { toast.error('Seleccioná al menos uno'); return }
    setConfirmando(true)
    const edits = {}
    for (const [id, ed] of Object.entries(rowEdits)) {
      edits[id] = { cliente: ed.cliente, cliente_id: ed.cliente_id, peso: ed.peso, usd: ed.usd }
    }
    try {
      const r = await axios.post('/api/manifiesto/confirmar', { ids: [...seleccionados], edits })
      toast.success(`${r.data.confirmados} envío${r.data.confirmados !== 1 ? 's' : ''} movidos a Envíos`)
      onConfirmado(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al confirmar')
    } finally { setConfirmando(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cotejar imagen con Manifiesto" size="xl">
      <div className="space-y-4">
        {/* Upload */}
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-3">
            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center cursor-pointer hover:border-primary-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={28} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{archivo ? archivo.name : 'Subí la imagen con los envíos a cotejar'}</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP (máx. 15 MB)</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
            {archivo && (
              <button onClick={analizar} disabled={analizando} className="btn-primary w-full justify-center">
                {analizando ? <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Cotejando...</> : <><Search size={16} />Cotejar con Manifiesto</>}
              </button>
            )}
          </div>
          {preview && <div className="w-52 shrink-0"><img src={preview} alt="preview" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 object-contain max-h-40" /></div>}
        </div>

        {resultado && (
          <>
            {/* Coincidencias con edición inline */}
            {resultado.encontrados.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Coincidencias en Manifiesto ({resultado.encontrados.length})</p>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="table-header w-8"></th>
                        <th className="table-header">Cód. SH</th>
                        <th className="table-header">Cliente</th>
                        <th className="table-header text-right">Peso (kg)</th>
                        <th className="table-header text-right">u$s</th>
                        <th className="table-header text-right">Precio/kg</th>
                        <th className="table-header">Estado</th>
                        <th className="table-header w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.encontrados.map(({ pendiente: p, diferencias }) => {
                        const hasDiff = diferencias.length > 0
                        const ed = rowEdits[p.id]
                        const ef = getEfectivo(p)
                        const isEditing = ed?.editando
                        return (
                          <tr key={p.id} className={`table-row ${hasDiff && !ed ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                            <td className="table-cell text-center">
                              <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggleSel(p.id)} />
                            </td>
                            {isEditing ? (
                              <>
                                <td className="table-cell font-mono font-semibold">{p.codigo_sh}</td>
                                <td className="table-cell" colSpan={1}>
                                  <ClienteCombo
                                    clienteId={ed.cliente_id}
                                    cliente={ed.cliente}
                                    clientes={clientes}
                                    onChange={v => updateRowEdit(p.id, v)}
                                  />
                                </td>
                                <td className="table-cell">
                                  <input type="number" step="0.01" value={ed.peso} onChange={e => updateRowEdit(p.id, { peso: e.target.value })} className="input text-xs py-1 px-2 h-auto w-20 text-right" />
                                </td>
                                <td className="table-cell">
                                  <input type="number" step="0.01" value={ed.usd} onChange={e => updateRowEdit(p.id, { usd: e.target.value })} className="input text-xs py-1 px-2 h-auto w-24 text-right" />
                                </td>
                                <td className="table-cell text-right text-gray-400">
                                  {ef.precio_kg ? fmtUSD(ef.precio_kg) : '—'}
                                </td>
                                <td className="table-cell"><span className="badge badge-blue">Editado</span></td>
                                <td className="table-cell">
                                  <button onClick={() => closeEdit(p.id)} className="p-1 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded" title="Guardar edición">
                                    <CheckCircle size={13} />
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="table-cell font-mono font-semibold">{p.codigo_sh}</td>
                                <td className="table-cell">{ef.cliente || <span className="text-gray-400">—</span>}</td>
                                <td className="table-cell text-right">
                                  {hasDiff && diferencias.find(x => x.campo === 'peso') && !ed
                                    ? <span className="text-yellow-700 dark:text-yellow-400 font-semibold">{p.peso} <span className="text-gray-400">→ {diferencias.find(x => x.campo === 'peso').imagen}</span></span>
                                    : ef.peso}
                                </td>
                                <td className="table-cell text-right">{fmtUSD(ef.usd)}</td>
                                <td className="table-cell text-right">
                                  {hasDiff && diferencias.find(x => x.campo === 'precio_kg') && !ed
                                    ? <span className="text-yellow-700 dark:text-yellow-400 font-semibold">{fmtUSD(p.precio_kg)} <span className="text-gray-400">→ {fmtUSD(diferencias.find(x => x.campo === 'precio_kg').imagen)}</span></span>
                                    : fmtUSD(ef.precio_kg)}
                                </td>
                                <td className="table-cell">
                                  {ed ? <span className="badge badge-blue">Editado</span>
                                    : hasDiff ? <span className="badge badge-yellow">Diferencias</span>
                                    : <span className="badge badge-green">OK</span>}
                                </td>
                                <td className="table-cell">
                                  <button onClick={() => startEdit(ef)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar">
                                    <Pencil size={13} />
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* En imagen pero no en manifiesto */}
            {resultado.noEncontrados.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">En imagen pero NO en Manifiesto ({resultado.noEncontrados.length})</p>
                <div className="border border-orange-200 dark:border-orange-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr><th className="table-header">Cód. SH</th><th className="table-header">Cliente</th><th className="table-header text-right">Peso</th><th className="table-header text-right">u$s</th><th className="table-header text-right">Precio/kg</th></tr></thead>
                    <tbody>
                      {resultado.noEncontrados.map((d, i) => (
                        <tr key={i} className="table-row">
                          <td className="table-cell font-mono font-semibold text-orange-600 dark:text-orange-400">{d.codigo_sh}</td>
                          <td className="table-cell">{d.cliente || <span className="text-gray-400">—</span>}</td>
                          <td className="table-cell text-right">{d.peso}</td>
                          <td className="table-cell text-right">{fmtUSD(d.usd)}</td>
                          <td className="table-cell text-right">{fmtUSD(d.precio_kg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* En manifiesto pero no en imagen */}
            {resultado.sinDetectar.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">En Manifiesto pero NO detectados en imagen ({resultado.sinDetectar.length})</p>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr><th className="table-header">Cód. SH</th><th className="table-header">Cliente</th><th className="table-header text-right">Peso</th><th className="table-header text-right">u$s</th></tr></thead>
                    <tbody>
                      {resultado.sinDetectar.map(p => (
                        <tr key={p.id} className="table-row opacity-60">
                          <td className="table-cell font-mono">{p.codigo_sh}</td>
                          <td className="table-cell">{p.cliente || <span className="text-gray-400">—</span>}</td>
                          <td className="table-cell text-right">{p.peso}</td>
                          <td className="table-cell text-right">{fmtUSD(p.usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {resultado.encontrados.length === 0 && resultado.noEncontrados.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No se encontraron coincidencias con el Manifiesto.</p>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">{seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''} para mover a Envíos</p>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary">Cerrar</button>
                <button onClick={confirmar} disabled={confirmando || seleccionados.size === 0} className="btn-primary">
                  <CheckCircle size={16} />
                  {confirmando ? 'Moviendo...' : `Confirmar ${seleccionados.size} → Envíos`}
                </button>
              </div>
            </div>
          </>
        )}

        {!resultado && <div className="flex justify-end"><button onClick={onClose} className="btn-secondary">Cancelar</button></div>}
      </div>
    </Modal>
  )
}

// ── ENVÍOS ──────────────────────────────────────────────

const COL_DEFS = [
  { key: 'fecha',       label: 'Fecha',       def: true },
  { key: 'cliente',     label: 'Cliente',     def: true },
  { key: 'origen',      label: 'Origen',      def: true },
  { key: 'kg_real',     label: 'KG Real',     def: true },
  { key: 'kg_fact',     label: 'KG Fact',     def: true },
  { key: 'volumetrico', label: 'VKg',         def: false },
  { key: 'vkg',         label: 'KG Costo',    def: true },
  { key: 'kg_vta',      label: 'KG Vta',      def: true },
  { key: 'costo_total', label: 'Costo Total', def: true },
  { key: 'venta',       label: 'Venta',       def: true },
  { key: 'ganancia',    label: 'Ganancia',    def: true },
  { key: 'pago',        label: 'Pago',        def: true },
]

const COL_STORAGE_KEY = 'mbk_cols_v1'
const loadColVis = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_STORAGE_KEY) || '{}')
    return COL_DEFS.reduce((acc, c) => ({ ...acc, [c.key]: saved[c.key] !== undefined ? saved[c.key] : c.def }), {})
  } catch { return COL_DEFS.reduce((acc, c) => ({ ...acc, [c.key]: c.def }), {}) }
}

const EMPTY_FORM = {
  origen_id: '', origen_nombre: '', vkg: 0,
  kg_real: '', kg_fact: '', volumetrico: '', kg_vta: 60,
  costo_total: 0, venta: 0, ganancia: 0,
  cliente_id: '', monto_pagado: '',
  fecha: new Date().toISOString().slice(0, 10), notas: ''
}

function EnviosTab() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState([])
  const [origenes, setOrigenes] = useState([])
  const [clientes, setClientes] = useState([])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [cotejarModal, setCotejarModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [inlineEdit, setInlineEdit] = useState(null) // { id, field, value }
  const [quickPago, setQuickPago] = useState(null)   // envío para pago rápido
  const [colVis, setColVis] = useState(loadColVis)
  const [colPicker, setColPicker] = useState(false)

  const toggleCol = (key) => {
    const next = { ...colVis, [key]: !colVis[key] }
    setColVis(next)
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(next))
  }
  const vis = (key) => colVis[key] !== false

  useEffect(() => {
    if (!colPicker) return
    const close = (e) => { if (!e.target.closest('[data-colpicker]')) setColPicker(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [colPicker])

  const load = async () => {
    const [envR, origR, cliR] = await Promise.all([
      axios.get('/api/mbk/envios', { params: { q: q || undefined } }),
      axios.get('/api/mbk/origenes'),
      axios.get('/api/mbk/clientes')
    ])
    setData(envR.data)
    setOrigenes(origR.data)
    setClientes(cliR.data)
  }

  useEffect(() => { load() }, [q])

  const recalc = (f) => {
    const costo_total = parseFloat(((parseFloat(f.kg_real) || 0) * (parseFloat(f.vkg) || 0)).toFixed(2))
    const venta = parseFloat(((parseFloat(f.kg_fact) || 0) * (parseFloat(f.kg_vta) || 0)).toFixed(2))
    const ganancia = parseFloat((venta - costo_total).toFixed(2))
    return { ...f, costo_total, venta, ganancia }
  }

  const setField = (key, val) => setForm(prev => recalc({ ...prev, [key]: val }))

  const handleOrigenChange = (origenId) => {
    const origen = origenes.find(o => o.id === parseInt(origenId))
    if (!origen) { setForm(prev => recalc({ ...prev, origen_id: '', origen_nombre: '', vkg: 0 })); return }
    setForm(prev => recalc({ ...prev, origen_id: origen.id, origen_nombre: origen.nombre, vkg: origen.precio_kg }))
  }

  const saveInline = async () => {
    if (!inlineEdit) return
    const { id, field, value } = inlineEdit
    setInlineEdit(null)
    const envio = data.find(e => e.id === id)
    if (!envio) return

    let updated = { ...envio }
    if (field === 'origen') {
      // value = { id, nombre, precio_kg }
      updated = { ...updated, origen_id: value.id, origen_nombre: value.nombre, vkg: value.precio_kg }
    } else if (field === 'costo_total') {
      updated = { ...updated, costo_total: parseFloat(value) || 0 }
    } else {
      updated = { ...updated, [field]: parseFloat(value) || 0 }
    }

    const kg_real = parseFloat(updated.kg_real) || 0
    const kg_fact = parseFloat(updated.kg_fact) || 0
    const vkg = parseFloat(updated.vkg) || 0
    const kg_vta = parseFloat(updated.kg_vta) || 0
    const venta = parseFloat((kg_fact * kg_vta).toFixed(2))

    const payload = {
      origen_id: updated.origen_id, origen_nombre: updated.origen_nombre,
      vkg, kg_real, kg_fact, kg_vta,
      volumetrico: updated.volumetrico ?? null,
      cliente_id: updated.cliente_id || null,
      monto_pagado: updated.monto_pagado || 0,
      fecha: updated.fecha, notas: updated.notas || null,
    }
    if (field === 'costo_total') payload.costo_total = updated.costo_total
    if (field === 'venta') payload.venta = updated.venta

    try {
      await axios.put(`/api/mbk/envios/${id}`, payload)
      load()
    } catch { toast.error('Error al guardar') }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(recalc({ ...EMPTY_FORM, fecha: new Date().toISOString().slice(0, 10) }))
    setModal(true)
  }

  const openEdit = (e) => {
    setEditing(e)
    setForm(recalc({
      origen_id: e.origen_id, origen_nombre: e.origen_nombre, vkg: e.vkg,
      kg_real: e.kg_real, kg_fact: e.kg_fact, volumetrico: e.volumetrico ?? '',
      kg_vta: e.kg_vta, costo_total: e.costo_total, venta: e.venta, ganancia: e.ganancia,
      cliente_id: e.cliente_id ?? '', monto_pagado: e.monto_pagado ?? '',
      fecha: e.fecha, notas: e.notas || ''
    }))
    setModal(true)
  }

  const handleSave = async (ev) => {
    ev.preventDefault()
    if (!form.origen_id) { toast.error('Seleccioná un origen'); return }
    try {
      const payload = {
        origen_id: form.origen_id, origen_nombre: form.origen_nombre,
        vkg: parseFloat(form.vkg) || 0, kg_real: parseFloat(form.kg_real) || 0,
        kg_fact: parseFloat(form.kg_fact) || 0, kg_vta: parseFloat(form.kg_vta) || 0,
        volumetrico: form.volumetrico !== '' ? parseFloat(form.volumetrico) : null,
        cliente_id: form.cliente_id || null,
        monto_pagado: parseFloat(form.monto_pagado) || 0,
        fecha: form.fecha, notas: form.notas || null
      }
      if (editing) {
        await axios.put(`/api/mbk/envios/${editing.id}`, payload)
        toast.success('Envío actualizado')
      } else {
        await axios.post('/api/mbk/envios', payload)
        toast.success('Envío creado')
      }
      setModal(false)
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este envío?')) return
    try {
      await axios.delete(`/api/mbk/envios/${id}`)
      toast.success('Eliminado')
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const gananciaColor = (g) => g >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por código u origen..." className="input pl-9" />
        </div>
        <button onClick={() => setImportModal(true)} className="btn-secondary"><Upload size={16} />Importar Excel</button>
        <button onClick={() => setCotejarModal(true)} className="btn-secondary"><ClipboardList size={16} />Cotejar Manifiesto</button>
        <div className="relative">
          <button onClick={() => setColPicker(p => !p)} className="btn-secondary"><SlidersHorizontal size={16} />Columnas</button>
          {colPicker && (
            <div data-colpicker className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 min-w-40">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Columnas visibles</p>
              {COL_DEFS.map(c => (
                <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                  <input type="checkbox" checked={!!colVis[c.key]} onChange={() => toggleCol(c.key)} className="accent-primary-600" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo envío</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Código</th>
              {vis('fecha')       && <th className="table-header">Fecha</th>}
              {vis('cliente')     && <th className="table-header">Cliente</th>}
              {vis('origen')      && <th className="table-header">Origen</th>}
              {vis('kg_real')     && <th className="table-header text-right">KG Real</th>}
              {vis('kg_fact')     && <th className="table-header text-right">KG Fact</th>}
              {vis('volumetrico') && <th className="table-header text-right">VKg</th>}
              {vis('vkg')         && <th className="table-header text-right">KG Costo</th>}
              {vis('kg_vta')      && <th className="table-header text-right">KG Vta</th>}
              {vis('costo_total') && <th className="table-header text-right">Costo Total</th>}
              {vis('venta')       && <th className="table-header text-right">Venta</th>}
              {vis('ganancia')    && <th className="table-header text-right">Ganancia</th>}
              {vis('pago')        && <th className="table-header">Pago</th>}
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={20} className="table-cell text-center text-gray-400 py-8">Sin envíos registrados</td></tr>
            )}
            {data.map(e => {
              const badge = estadoPagoBadge(e.monto_pagado, e.venta)
              const clienteNombre = clientes.find(c => c.id === e.cliente_id)?.nombre
              return (
                <tr key={e.id} className="table-row">
                  <td className="table-cell font-mono font-semibold text-primary-600 dark:text-primary-400">
                    <div className="flex items-center gap-1">
                      {e.ganancia < 0 && <AlertCircle size={14} className="text-yellow-500 shrink-0" title="Ganancia negativa" />}
                      {e.codigo}
                    </div>
                  </td>
                  {vis('fecha')   && <td className="table-cell">{e.fecha}</td>}
                  {vis('cliente') && <td className="table-cell">{clienteNombre || <span className="text-gray-400">—</span>}</td>}
                  {/* Origen — inline edit (select) */}
                  {vis('origen') && (
                    <td className="table-cell p-0.5">
                      {inlineEdit?.id === e.id && inlineEdit?.field === 'origen' ? (
                        <select
                          autoFocus
                          className="w-full bg-white dark:bg-gray-700 border border-primary-400 rounded px-1 py-0.5 text-xs outline-none"
                          value={inlineEdit.value?.id || ''}
                          onChange={ev => {
                            const o = origenes.find(o => o.id === parseInt(ev.target.value))
                            if (o) setInlineEdit(p => ({ ...p, value: o }))
                          }}
                          onBlur={saveInline}
                          onKeyDown={ev => { if (ev.key === 'Escape') setInlineEdit(null) }}
                        >
                          <option value="">— Seleccionar —</option>
                          {origenes.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                        </select>
                      ) : (
                        <span
                          onDoubleClick={() => setInlineEdit({ id: e.id, field: 'origen', value: { id: e.origen_id, nombre: e.origen_nombre, precio_kg: e.vkg } })}
                          className="cursor-text hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded px-1 py-0.5 block"
                          title="Doble clic para editar"
                        >{e.origen_nombre}</span>
                      )}
                    </td>
                  )}
                  {/* KG Real / KG Fact — inline edit */}
                  {(['kg_real','kg_fact']).map(field => !vis(field) ? null : (
                    <td key={field} className="table-cell text-right p-0.5">
                      {inlineEdit?.id === e.id && inlineEdit?.field === field ? (
                        <input autoFocus type="number" step="0.01" value={inlineEdit.value}
                          onChange={ev => setInlineEdit(p => ({ ...p, value: ev.target.value }))}
                          onBlur={saveInline}
                          onKeyDown={ev => { if (ev.key === 'Enter') saveInline(); if (ev.key === 'Escape') setInlineEdit(null) }}
                          className="w-20 text-right bg-white dark:bg-gray-700 border border-primary-400 rounded px-1 py-0.5 text-xs outline-none"
                        />
                      ) : (
                        <span onDoubleClick={() => setInlineEdit({ id: e.id, field, value: e[field] })}
                          className="cursor-text hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded px-1 py-0.5 block text-right"
                          title="Doble clic para editar"
                        >{fmtNum(e[field])}</span>
                      )}
                    </td>
                  ))}
                  {vis('volumetrico') && <td className="table-cell text-right">{e.volumetrico != null ? fmtNum(e.volumetrico) : '—'}</td>}
                  {/* VKG (costo) y KG Vta — inline edit */}
                  {(['vkg','kg_vta']).map(field => !vis(field) ? null : (
                    <td key={field} className="table-cell text-right p-0.5">
                      {inlineEdit?.id === e.id && inlineEdit?.field === field ? (
                        <input autoFocus type="number" step="0.01" value={inlineEdit.value}
                          onChange={ev => setInlineEdit(p => ({ ...p, value: ev.target.value }))}
                          onBlur={saveInline}
                          onKeyDown={ev => { if (ev.key === 'Enter') saveInline(); if (ev.key === 'Escape') setInlineEdit(null) }}
                          className="w-20 text-right bg-white dark:bg-gray-700 border border-primary-400 rounded px-1 py-0.5 text-xs outline-none font-mono"
                        />
                      ) : (
                        <span onDoubleClick={() => setInlineEdit({ id: e.id, field, value: e[field] })}
                          className="cursor-text hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded px-1 py-0.5 block text-right font-mono"
                          title="Doble clic para editar"
                        >{fmt(e[field])}</span>
                      )}
                    </td>
                  ))}
                  {vis('costo_total') && <td className="table-cell text-right font-mono">{fmt(e.costo_total)}</td>}
                  {/* Venta — inline edit */}
                  {vis('venta') && (
                    <td className="table-cell text-right p-0.5">
                      {inlineEdit?.id === e.id && inlineEdit?.field === 'venta' ? (
                        <input autoFocus type="number" step="0.01" value={inlineEdit.value}
                          onChange={ev => setInlineEdit(p => ({ ...p, value: ev.target.value }))}
                          onBlur={saveInline}
                          onKeyDown={ev => { if (ev.key === 'Enter') saveInline(); if (ev.key === 'Escape') setInlineEdit(null) }}
                          className="w-24 text-right bg-white dark:bg-gray-700 border border-primary-400 rounded px-1 py-0.5 text-xs outline-none font-mono"
                        />
                      ) : (
                        <span onDoubleClick={() => setInlineEdit({ id: e.id, field: 'venta', value: e.venta })}
                          className="cursor-text hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded px-1 py-0.5 block text-right font-mono"
                          title="Doble clic para editar"
                        >{fmt(e.venta)}</span>
                      )}
                    </td>
                  )}
                  {vis('ganancia') && <td className={`table-cell text-right font-mono font-semibold ${gananciaColor(e.ganancia)}`}>{fmt(e.ganancia)}</td>}
                  {vis('pago') && (
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        {e.cliente_id && (
                          <button
                            onClick={() => setQuickPago(e)}
                            className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400"
                            title="Registrar pago"
                          >
                            <DollarSign size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="table-cell">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(e)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar"><Pencil size={14} /></button>
                      {isAdmin && <button onClick={() => handleDelete(e.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded" title="Eliminar"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ImportModal open={importModal} onClose={() => setImportModal(false)} onImported={load} />
      <CotejarManifiestoModal open={cotejarModal} onClose={() => setCotejarModal(false)} onConfirmado={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? `Editar ${editing.codigo}` : 'Nuevo envío'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Origen</label>
              <select value={form.origen_id} onChange={e => handleOrigenChange(e.target.value)} className="select" required>
                <option value="">— Seleccionar origen —</option>
                {origenes.map(o => <option key={o.id} value={o.id}>{o.nombre} ({fmt(o.precio_kg)}/kg)</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Cliente (opcional)</label>
              <select value={form.cliente_id} onChange={e => setField('cliente_id', e.target.value)} className="select">
                <option value="">— Sin cliente —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setField('fecha', e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">KG Costo (snapshot origen)</label>
              <input type="number" step="0.01" min="0" value={form.vkg} onChange={e => setField('vkg', e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">KG Real</label>
              <input type="number" step="0.01" min="0" value={form.kg_real} onChange={e => setField('kg_real', e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">KG Fact</label>
              <input type="number" step="0.01" min="0" value={form.kg_fact} onChange={e => setField('kg_fact', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">VKg — Volumétrico (opcional)</label>
              <input type="number" step="0.01" min="0" value={form.volumetrico} onChange={e => setField('volumetrico', e.target.value)} className="input" placeholder="—" />
            </div>
            <div>
              <label className="label">KG Vta</label>
              <input type="number" step="0.01" min="0" value={form.kg_vta} onChange={e => setField('kg_vta', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Costo Total</label>
              <input value={fmt(form.costo_total)} readOnly className="input bg-gray-50 dark:bg-gray-800 text-gray-500 cursor-default" tabIndex={-1} />
              <p className="text-xs text-gray-400 mt-0.5">KG Real × KG Costo</p>
            </div>
            <div>
              <label className="label">Venta</label>
              <input value={fmt(form.venta)} readOnly className="input bg-gray-50 dark:bg-gray-800 text-gray-500 cursor-default" tabIndex={-1} />
              <p className="text-xs text-gray-400 mt-0.5">KG Fact × KG Vta</p>
            </div>
            <div>
              <label className="label">Ganancia</label>
              <input value={fmt(form.ganancia)} readOnly className={`input cursor-default ${form.ganancia >= 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`} tabIndex={-1} />
              <p className="text-xs text-gray-400 mt-0.5">Venta − Costo Total</p>
            </div>
            <div>
              <label className="label">Monto Pagado</label>
              <input type="number" step="0.01" min="0" value={form.monto_pagado} onChange={e => setField('monto_pagado', e.target.value)} className="input" placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <label className="label">Notas (opcional)</label>
              <textarea value={form.notas} onChange={e => setField('notas', e.target.value)} className="input" rows={2} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>

      {quickPago && <QuickPagoModal envio={quickPago} onClose={() => setQuickPago(null)} onPago={() => { setQuickPago(null); load() }} />}
    </div>
  )
}

// ── QUICK PAGO MODAL ─────────────────────────────────────

function QuickPagoModal({ envio, onClose, onPago }) {
  const saldoMax = Math.max(0, (envio.venta || 0) - (envio.monto_pagado || 0))
  const [form, setForm] = useState({
    monto: String(saldoMax),
    fecha: new Date().toISOString().slice(0, 10),
    concepto: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    const monto = parseFloat(form.monto)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    setSaving(true)
    try {
      await axios.post('/api/cobros/pago', {
        cliente_id: envio.cliente_id,
        envio_id: envio.id,
        monto, fecha: form.fecha, concepto: form.concepto || null
      })
      toast.success('Pago registrado')
      onPago()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Pago — ${envio.codigo}`}>
      <form onSubmit={handleSave} className="space-y-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Total envío</span><span className="font-mono">{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2}).format(envio.venta||0)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Ya pagado</span><span className="font-mono text-green-600 dark:text-green-400">{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2}).format(envio.monto_pagado||0)}</span></div>
          <div className="flex justify-between font-semibold"><span className="text-gray-700 dark:text-gray-300">Saldo pendiente</span><span className="text-red-600 dark:text-red-400">{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2}).format(saldoMax)}</span></div>
        </div>
        <div>
          <label className="label">Monto</label>
          <input type="number" step="0.01" min="0.01" value={form.monto} onChange={e => setForm(p=>({...p,monto:e.target.value}))} className="input" required autoFocus />
        </div>
        <div>
          <label className="label">Fecha</label>
          <input type="date" value={form.fecha} onChange={e => setForm(p=>({...p,fecha:e.target.value}))} className="input" required />
        </div>
        <div>
          <label className="label">Concepto (opcional)</label>
          <input value={form.concepto} onChange={e => setForm(p=>({...p,concepto:e.target.value}))} className="input" placeholder="Transferencia, Efectivo..." />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Guardando...' : 'Registrar pago'}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

// ── MANIFIESTO ──────────────────────────────────────────────

function ManifiestoTab({ onConfirmed }) {
  const fileRef = useRef(null)
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [filas, setFilas] = useState([])
  const [analizando, setAnalizando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setArchivo(f)
    setPreview(URL.createObjectURL(f))
    setFilas([])
  }

  const analizar = async () => {
    if (!archivo) { toast.error('Seleccioná una imagen'); return }
    setAnalizando(true)
    try {
      const formData = new FormData()
      formData.append('imagen', archivo)
      const r = await axios.post('/api/manifiesto/analizar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      if (r.data.length === 0) { toast.error('No se detectaron filas en la imagen'); return }
      setFilas(r.data.map((row, i) => ({ ...row, _id: i })))
      toast.success(`${r.data.length} filas detectadas`)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al analizar la imagen')
    } finally {
      setAnalizando(false)
    }
  }

  const updateFila = (id, field, value) => {
    setFilas(prev => prev.map(f => {
      if (f._id !== id) return f
      const updated = { ...f, [field]: value }
      updated.precio_kg = (updated.peso && updated.usd)
        ? parseFloat((updated.usd / updated.peso).toFixed(4)) : 0
      return updated
    }))
  }

  const deleteFila = (id) => setFilas(prev => prev.filter(f => f._id !== id))

  const confirmar = async () => {
    if (filas.length === 0) { toast.error('Sin filas para confirmar'); return }
    setGuardando(true)
    try {
      await axios.post('/api/manifiesto/pendientes', filas)
      toast.success(`${filas.length} envíos movidos a Envíos Pendientes`)
      setFilas([])
      setArchivo(null)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      onConfirmed()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Upload area */}
        <div className="flex-1 space-y-3">
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <ImageIcon size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {archivo ? archivo.name : 'Hacé clic para subir una captura del manifiesto'}
            </p>
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP (máx. 15 MB)</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          {archivo && (
            <button
              onClick={analizar}
              disabled={analizando}
              className="btn-primary w-full justify-center"
            >
              {analizando
                ? <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Analizando con IA...</>
                : <><Search size={16} />Analizar imagen</>
              }
            </button>
          )}
        </div>

        {/* Image preview */}
        {preview && (
          <div className="w-72 shrink-0">
            <img src={preview} alt="preview" className="w-full rounded-lg border border-gray-200 dark:border-gray-700 object-contain max-h-64" />
          </div>
        )}
      </div>

      {/* Validation table */}
      {filas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Validar {filas.length} envío{filas.length !== 1 ? 's' : ''} detectados
            </p>
            <button onClick={confirmar} disabled={guardando} className="btn-primary">
              <CheckCircle size={16} />
              {guardando ? 'Guardando...' : 'Confirmar todos → Envíos Pendientes'}
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header">Cliente</th>
                    <th className="table-header">Código SH</th>
                    <th className="table-header text-right">Peso (kg)</th>
                    <th className="table-header text-right">u$s</th>
                    <th className="table-header text-right">Precio/kg (u$s/kg)</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f._id} className="table-row">
                      <td className="table-cell">
                        <input
                          value={f.cliente}
                          onChange={e => updateFila(f._id, 'cliente', e.target.value)}
                          className="input text-xs py-1 px-2 h-auto"
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          value={f.codigo_sh}
                          onChange={e => updateFila(f._id, 'codigo_sh', e.target.value)}
                          className="input text-xs py-1 px-2 h-auto font-mono"
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          type="number" step="0.01" min="0"
                          value={f.peso}
                          onChange={e => updateFila(f._id, 'peso', parseFloat(e.target.value) || 0)}
                          className="input text-xs py-1 px-2 h-auto text-right w-24"
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          type="number" step="0.01" min="0"
                          value={f.usd}
                          onChange={e => updateFila(f._id, 'usd', parseFloat(e.target.value) || 0)}
                          className="input text-xs py-1 px-2 h-auto text-right w-24"
                        />
                      </td>
                      <td className="table-cell text-right font-mono font-semibold text-primary-600 dark:text-primary-400">
                        {fmtUSD(f.precio_kg)}
                      </td>
                      <td className="table-cell">
                        <button onClick={() => deleteFila(f._id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded">
                          <XCircle size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ENVÍOS PENDIENTES ───────────────────────────────────────

function EnviosPendientesTab() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState([])
  const [clientes, setClientes] = useState([])
  const [origenes, setOrigenes] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())        // bulk selection
  const [bulkEstado, setBulkEstado] = useState('recibido')
  const [aplicandoBulk, setAplicandoBulk] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [estadoModal, setEstadoModal] = useState(null) // { item, nuevoEstado, origen_id, origen_nombre }

  const load = async () => {
    const [pendR, cliR, origR] = await Promise.all([
      axios.get('/api/manifiesto/pendientes'),
      axios.get('/api/mbk/clientes'),
      axios.get('/api/mbk/origenes'),
    ])
    setData(pendR.data); setClientes(cliR.data); setOrigenes(origR.data)
  }
  useEffect(() => { load() }, [])

  const filtered = data.filter(r =>
    !q ||
    (r.cliente || '').toLowerCase().includes(q.toLowerCase()) ||
    r.codigo_sh.includes(q)
  )

  const [bulkModal, setBulkModal] = useState(false)
  const [bulkEdits, setBulkEdits] = useState({})
  const [editingCell, setEditingCell] = useState(null)
  const [bulkOrigen, setBulkOrigen] = useState({ id: null, nombre: null })

  const toggleOne = (id) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const getBulkVal = (r, field) => bulkEdits[r.id]?.[field] !== undefined ? bulkEdits[r.id][field] : r[field]
  const setBulkEdit = (id, field, value) =>
    setBulkEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }))

  const closeBulkModal = () => { setBulkModal(false); setBulkEdits({}); setEditingCell(null); setBulkOrigen({ id: null, nombre: null }) }

  const aplicarBulk = async () => {
    setAplicandoBulk(true)
    try {
      await Promise.all(
        Object.entries(bulkEdits).map(([sid, edits]) => {
          const original = data.find(r => r.id === parseInt(sid))
          if (!original) return Promise.resolve()
          const peso = edits.peso ?? original.peso
          const usd = edits.usd ?? original.usd
          const precio_kg = peso && usd ? parseFloat((usd / peso).toFixed(4)) : original.precio_kg
          return axios.put(`/api/manifiesto/pendientes/${sid}`, { ...original, ...edits, peso, usd, precio_kg })
        })
      )
      const r = await axios.patch('/api/manifiesto/pendientes/bulk-estado', {
        ids: [...sel], estado: bulkEstado,
        origen_id: bulkOrigen.id || null,
        origen_nombre: bulkOrigen.nombre || null,
      })
      toast.success(`${r.data.ok} envío${r.data.ok !== 1 ? 's' : ''} actualizados`)
      setSel(new Set()); closeBulkModal(); load()
    } catch { toast.error('Error al actualizar') }
    finally { setAplicandoBulk(false) }
  }

  const EditableCell = ({ r, field, display, right = true, type = 'number' }) => {
    const isEditing = editingCell?.id === r.id && editingCell?.field === field
    const val = getBulkVal(r, field)
    if (isEditing) return (
      <input
        autoFocus
        type={type}
        step="0.01"
        min="0"
        value={val ?? ''}
        onChange={e => setBulkEdit(r.id, field, type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)}
        onBlur={() => setEditingCell(null)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingCell(null) }}
        className={`w-full bg-white dark:bg-gray-700 border border-primary-400 rounded px-1 py-0.5 text-xs outline-none ${right ? 'text-right' : ''}`}
      />
    )
    return (
      <span
        onDoubleClick={() => setEditingCell({ id: r.id, field })}
        title="Doble clic para editar"
        className={`block w-full rounded px-1 py-0.5 cursor-text hover:bg-yellow-50 dark:hover:bg-yellow-900/20 select-none ${right ? 'text-right' : ''} ${bulkEdits[r.id]?.[field] !== undefined ? 'text-primary-600 dark:text-primary-400 font-semibold' : ''}`}
      >
        {display}
      </span>
    )
  }

  const openEdit = (item) => { setEditing({ ...item }); setEditModal(true) }

  const handleSave = async () => {
    try {
      const precio_kg = editing.peso && editing.usd ? parseFloat((editing.usd / editing.peso).toFixed(4)) : 0
      await axios.put(`/api/manifiesto/pendientes/${editing.id}`, { ...editing, precio_kg })
      toast.success('Actualizado'); setEditModal(false); load()
    } catch { toast.error('Error al guardar') }
  }

  const handleEstadoClick = (item, nuevoEstado) => {
    if (nuevoEstado === (item.estado || 'pendiente')) return
    setEstadoModal({ item, nuevoEstado })
  }

  const confirmarEstado = async () => {
    try {
      await axios.patch(`/api/manifiesto/pendientes/${estadoModal.item.id}/estado`, {
        estado: estadoModal.nuevoEstado,
        origen_id: estadoModal.origen_id || null,
        origen_nombre: estadoModal.origen_nombre || null,
      })
      toast.success(`Estado → "${ESTADOS.find(e => e.key === estadoModal.nuevoEstado)?.label}"`)
      setEstadoModal(null); load()
    } catch { toast.error('Error al actualizar estado') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este envío pendiente?')) return
    try { await axios.delete(`/api/manifiesto/pendientes/${id}`); toast.success('Eliminado'); load() }
    catch { toast.error('Error') }
  }

  const handleLimpiar = async () => {
    if (!confirm('¿Limpiar todos los envíos pendientes?')) return
    try { await axios.delete('/api/manifiesto/pendientes'); toast.success('Lista limpiada'); load() }
    catch { toast.error('Error') }
  }

  return (
    <div className="space-y-3">
      {/* Barra superior */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por cliente o código SH..." className="input pl-9 text-sm" />
        </div>
        <p className="text-sm text-gray-500 shrink-0">{filtered.length} envío{filtered.length !== 1 ? 's' : ''}</p>
        {isAdmin && data.length > 0 && (
          <button onClick={handleLimpiar} className="btn-secondary text-red-600 dark:text-red-400 text-xs shrink-0">
            <Trash2 size={14} />Limpiar todo
          </button>
        )}
      </div>

      {/* Barra bulk (aparece cuando hay selección) */}
      {sel.size > 0 && (
        <div className="flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">{sel.size} seleccionado{sel.size !== 1 ? 's' : ''}</span>
          <span className="text-gray-400">→</span>
          <select value={bulkEstado} onChange={e => setBulkEstado(e.target.value)} className="select text-sm py-1 h-auto">
            {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
          <button onClick={() => setBulkModal(true)} className="btn-primary py-1 text-sm">Aplicar</button>
          <button onClick={() => setSel(new Set())} className="btn-secondary py-1 text-sm">Cancelar</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Estado</th>
              <th className="table-header">Cliente</th>
              <th className="table-header">Código SH</th>
              <th className="table-header text-right">Peso (kg)</th>
              <th className="table-header text-right">u$s</th>
              <th className="table-header text-right">Precio/kg</th>
              <th className="table-header">Cargado</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-gray-400 py-10">{q ? 'Sin resultados' : 'No hay envíos. Subí un manifiesto.'}</td></tr>
            )}
            {filtered.map(r => {
              const selected = sel.has(r.id)
              return (
                <tr
                  key={r.id}
                  onClick={() => toggleOne(r.id)}
                  className={`cursor-pointer transition-colors ${selected ? 'bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/30' : 'table-row'}`}
                >
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    <EstadoCircles estado={r.estado || 'pendiente'} onCambiar={e => handleEstadoClick(r, e)} />
                  </td>
                  <td className="table-cell font-medium">{r.cliente || <span className="text-gray-400">—</span>}</td>
                  <td className="table-cell font-mono text-primary-600 dark:text-primary-400">{r.codigo_sh}</td>
                  <td className="table-cell text-right">{Number(r.peso).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                  <td className="table-cell text-right font-semibold">{fmtUSD(r.usd)}</td>
                  <td className="table-cell text-right font-mono text-primary-600 dark:text-primary-400">{fmtUSD(r.precio_kg)}</td>
                  <td className="table-cell text-xs text-gray-400">{r.created_at?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal edición */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Editar envío pendiente">
        {editing && (
          <div className="space-y-3">
            <div>
              <label className="label">Cliente</label>
              <ClienteCombo clienteId={editing.cliente_id} cliente={editing.cliente} clientes={clientes} onChange={v => setEditing(prev => ({ ...prev, ...v }))} />
            </div>
            <div>
              <label className="label">Código SH</label>
              <input value={editing.codigo_sh} onChange={e => setEditing(prev => ({ ...prev, codigo_sh: e.target.value }))} className="input font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Peso (kg)</label>
                <input type="number" step="0.01" min="0" value={editing.peso} onChange={e => setEditing(prev => ({ ...prev, peso: parseFloat(e.target.value) || 0 }))} className="input" />
              </div>
              <div>
                <label className="label">u$s</label>
                <input type="number" step="0.01" min="0" value={editing.usd} onChange={e => setEditing(prev => ({ ...prev, usd: parseFloat(e.target.value) || 0 }))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Precio/kg (calculado)</label>
              <input value={fmtUSD(editing.peso && editing.usd ? editing.usd / editing.peso : 0)} readOnly className="input bg-gray-50 dark:bg-gray-800 text-gray-500 cursor-default" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} className="btn-primary flex-1 justify-center">Guardar</button>
              <button onClick={() => setEditModal(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal validación bulk */}
      <Modal open={bulkModal} onClose={closeBulkModal} title={`Cambiar estado — ${sel.size} envío${sel.size !== 1 ? 's' : ''}`} size="lg">
        {(() => {
          const est = ESTADOS.find(e => e.key === bulkEstado)
          const items = data.filter(r => sel.has(r.id))
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Vas a cambiar los siguientes envíos a{' '}
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className={`w-3 h-3 rounded-full ${est?.dot}`} />{est?.label}
                </span>.{' '}
                Hacé <span className="font-semibold">doble clic</span> en cualquier dato para editarlo.
              </p>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="table-header">Código SH</th>
                      <th className="table-header">Cliente</th>
                      <th className="table-header text-right">Peso (kg)</th>
                      <th className="table-header text-right">Precio/kg</th>
                      <th className="table-header text-right">Total u$s</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(r => {
                      const peso = getBulkVal(r, 'peso')
                      const usd = getBulkVal(r, 'usd')
                      const precio_kg = peso && usd ? usd / peso : r.precio_kg
                      return (
                        <tr key={r.id} className="table-row">
                          <td className="table-cell font-mono font-semibold text-primary-600 dark:text-primary-400">{r.codigo_sh}</td>
                          <td className="table-cell p-0.5">
                            <EditableCell r={r} field="cliente" display={getBulkVal(r, 'cliente') || '—'} right={false} type="text" />
                          </td>
                          <td className="table-cell p-0.5">
                            <EditableCell r={r} field="peso" display={Number(peso).toLocaleString('es-AR', { minimumFractionDigits: 2 })} />
                          </td>
                          <td className="table-cell text-right font-mono text-gray-500">{fmtUSD(precio_kg)}</td>
                          <td className="table-cell p-0.5">
                            <EditableCell r={r} field="usd" display={fmtUSD(usd)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {bulkEstado !== 'pendiente' && (
                <div>
                  <label className="label">Origen (opcional)</label>
                  <select
                    className="select text-sm"
                    value={bulkOrigen.id || ''}
                    onChange={ev => {
                      const o = origenes.find(o => o.id === parseInt(ev.target.value))
                      setBulkOrigen({ id: o?.id || null, nombre: o?.nombre || null })
                    }}
                  >
                    <option value="">— Sin origen —</option>
                    {origenes.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                </div>
              )}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">¿Los datos son correctos?</p>
              <div className="flex gap-2">
                <button onClick={closeBulkModal} className="btn-secondary flex-1 justify-center">Cancelar</button>
                <button onClick={aplicarBulk} disabled={aplicandoBulk} className="btn-primary flex-1 justify-center">
                  <CheckCircle size={14} />{aplicandoBulk ? 'Aplicando...' : 'Sí, confirmar todos'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal confirmación de estado individual */}
      <Modal open={!!estadoModal} onClose={() => setEstadoModal(null)} title="Cambiar estado">
        {estadoModal && (() => {
          const est = ESTADOS.find(e => e.key === estadoModal.nuevoEstado)
          return (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Vas a cambiar <span className="font-mono font-semibold text-primary-600 dark:text-primary-400">{estadoModal.item.codigo_sh}</span> a{' '}
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className={`w-3 h-3 rounded-full ${est?.dot}`} />{est?.label}
                </span>
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span className="font-medium">{estadoModal.item.cliente || '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Peso</span><span className="font-semibold">{estadoModal.item.peso} kg</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Precio/kg</span><span className="font-semibold">{fmtUSD(estadoModal.item.precio_kg)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total u$s</span><span className="font-semibold">{fmtUSD(estadoModal.item.usd)}</span></div>
              </div>
              {estadoModal.nuevoEstado !== 'pendiente' && (
                <div>
                  <label className="label">Origen</label>
                  <select
                    className="select text-sm"
                    value={estadoModal.origen_id || ''}
                    onChange={ev => {
                      const o = origenes.find(o => o.id === parseInt(ev.target.value))
                      setEstadoModal(p => ({ ...p, origen_id: o?.id || null, origen_nombre: o?.nombre || null }))
                    }}
                  >
                    <option value="">— Sin origen —</option>
                    {origenes.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                </div>
              )}
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">¿El peso y precio/kg son correctos?</p>
              <div className="flex gap-2">
                <button onClick={() => { openEdit(estadoModal.item); setEstadoModal(null) }} className="btn-secondary flex-1 justify-center">
                  <Pencil size={14} />Editar primero
                </button>
                <button onClick={confirmarEstado} className="btn-primary flex-1 justify-center">
                  <CheckCircle size={14} />Sí, confirmar
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function MBK() {
  const [tab, setTab] = useState('envios')

  const tabs = [
    { key: 'envios',     icon: Package2,     label: 'Envíos' },
    { key: 'clientes',   icon: Users,        label: 'Clientes' },
    { key: 'origenes',   icon: MapPin,       label: 'Orígenes' },
    { key: 'manifiesto', icon: ImageIcon,    label: 'Manifiesto' },
    { key: 'pendientes', icon: ClipboardList,label: 'Envíos Pendientes' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Envios (SH)</h1>
          <p className="text-sm text-gray-500">Gestión de envíos por precio por kg según origen</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'envios' && <EnviosTab />}
      {tab === 'clientes' && <ClientesTab />}
      {tab === 'origenes' && <OrigenesTab />}
      {tab === 'manifiesto' && <ManifiestoTab onConfirmed={() => setTab('pendientes')} />}
      {tab === 'pendientes' && <EnviosPendientesTab />}

    </div>
  )
}
