import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Search, DollarSign, CreditCard, Trash2, Plus } from 'lucide-react'
import Modal from '../components/Modal'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n || 0)

function estadoPagoBadge(monto_pagado, venta) {
  if (venta <= 0 || monto_pagado >= venta) return { label: 'Cobrado', cls: 'badge-green' }
  if (!monto_pagado || monto_pagado <= 0) return { label: 'No cobrado', cls: 'badge-red' }
  return { label: 'Parcial', cls: 'badge-yellow' }
}

// ── PAGO MODAL ───────────────────────────────────────────────

function PagoModal({ clienteId, envio, onClose, onPago }) {
  const saldoMax = envio ? Math.max(0, (envio.venta || 0) - (envio.monto_pagado || 0)) : null
  const [form, setForm] = useState({
    monto: saldoMax != null ? String(saldoMax) : '',
    fecha: new Date().toISOString().slice(0, 10),
    concepto: ''
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async (e) => {
    e.preventDefault()
    const monto = parseFloat(form.monto)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    setSaving(true)
    try {
      await axios.post('/api/cobros/pago', {
        cliente_id: clienteId,
        envio_id: envio?.id || null,
        monto, fecha: form.fecha, concepto: form.concepto || null
      })
      toast.success('Pago registrado')
      onPago()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={envio ? `Pago — ${envio.codigo}` : 'Pago a cuenta corriente'}>
      <form onSubmit={handleSave} className="space-y-3">
        {envio ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Total envío</span><span className="font-mono">{fmt(envio.venta)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Ya pagado</span><span className="font-mono text-green-600 dark:text-green-400">{fmt(envio.monto_pagado)}</span></div>
            <div className="flex justify-between font-semibold"><span className="text-gray-700 dark:text-gray-300">Saldo pendiente</span><span className="text-red-600 dark:text-red-400">{fmt(saldoMax)}</span></div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            El pago se acreditará en la cuenta corriente del cliente, sin asignarse a un envío específico.
          </p>
        )}
        <div>
          <label className="label">Monto</label>
          <input type="number" step="0.01" min="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} className="input" required autoFocus />
        </div>
        <div>
          <label className="label">Fecha</label>
          <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">Concepto (opcional)</label>
          <input value={form.concepto} onChange={e => set('concepto', e.target.value)} className="input" placeholder="Ej: Transferencia, Efectivo..." />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Guardando...' : 'Registrar pago'}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

// ── CUENTA CLIENTE MODAL ─────────────────────────────────────

function CuentaClienteModal({ clienteId, onClose }) {
  const [detalle, setDetalle] = useState(null)
  const [pagoModal, setPagoModal] = useState(null)

  const load = async () => {
    const r = await axios.get(`/api/cobros/clientes/${clienteId}`)
    setDetalle(r.data)
  }
  useEffect(() => { load() }, [clienteId])

  const handleDeletePago = async (id) => {
    if (!confirm('¿Eliminar este pago?')) return
    try { await axios.delete(`/api/cobros/pago/${id}`); toast.success('Pago eliminado'); load() }
    catch { toast.error('Error') }
  }

  if (!detalle) return (
    <Modal open onClose={onClose} title="Cargando...">
      <p className="text-center text-gray-400 py-8">Cargando cuenta...</p>
    </Modal>
  )

  const { cliente, envios, pagos } = detalle
  const totalPagado = (cliente.total_pagado_envios || 0) + (cliente.total_cc || 0)
  const saldo = cliente.saldo || 0

  return (
    <Modal open onClose={onClose} title={`Cuenta corriente — ${cliente.nombre}`} size="xl">
      <div className="space-y-4">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Facturado</p>
            <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">{fmt(cliente.total_facturado)}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Total pagado</p>
            <p className="font-bold text-green-700 dark:text-green-400 text-sm">{fmt(totalPagado)}</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${saldo > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
            <p className="text-xs text-gray-500 mb-1">Saldo deudor</p>
            <p className={`font-bold text-sm ${saldo > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{fmt(saldo)}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={() => setPagoModal({ cc: true })} className="btn-primary text-sm">
            <CreditCard size={15} />Pago a cuenta corriente
          </button>
        </div>

        {/* Envíos */}
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Envíos ({envios.length})</p>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="table-header">Código</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Origen</th>
                  <th className="table-header text-right">Venta</th>
                  <th className="table-header text-right">Pagado</th>
                  <th className="table-header text-right">Saldo</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {envios.length === 0 && (
                  <tr><td colSpan={8} className="table-cell text-center text-gray-400 py-6">Sin envíos registrados</td></tr>
                )}
                {envios.map(e => {
                  const saldoE = (e.venta || 0) - (e.monto_pagado || 0)
                  const badge = estadoPagoBadge(e.monto_pagado, e.venta)
                  return (
                    <tr key={e.id} className="table-row">
                      <td className="table-cell font-mono font-semibold text-primary-600 dark:text-primary-400">{e.codigo}</td>
                      <td className="table-cell">{e.fecha}</td>
                      <td className="table-cell text-gray-500">{e.origen_nombre}</td>
                      <td className="table-cell text-right font-mono">{fmt(e.venta)}</td>
                      <td className="table-cell text-right font-mono text-green-600 dark:text-green-400">{fmt(e.monto_pagado)}</td>
                      <td className={`table-cell text-right font-mono font-semibold ${saldoE > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmt(saldoE)}</td>
                      <td className="table-cell"><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                      <td className="table-cell">
                        {saldoE > 0 && (
                          <button onClick={() => setPagoModal({ envio: e })} className="btn-secondary text-xs px-2 py-0.5">Pagar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Historial de pagos */}
        {pagos.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Historial de pagos ({pagos.length})</p>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="table-header">Fecha</th>
                    <th className="table-header">Tipo</th>
                    <th className="table-header">Envío</th>
                    <th className="table-header">Concepto</th>
                    <th className="table-header text-right">Monto</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map(p => (
                    <tr key={p.id} className="table-row">
                      <td className="table-cell">{p.fecha}</td>
                      <td className="table-cell">
                        <span className={`badge ${p.tipo === 'envio' ? 'badge-green' : 'badge-gray'}`}>
                          {p.tipo === 'envio' ? 'Envío' : 'Cta. Cte.'}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-primary-600 dark:text-primary-400">{p.envio_codigo || <span className="text-gray-400">—</span>}</td>
                      <td className="table-cell text-gray-500">{p.concepto || <span className="text-gray-400">—</span>}</td>
                      <td className="table-cell text-right font-mono font-semibold text-green-600 dark:text-green-400">{fmt(p.monto)}</td>
                      <td className="table-cell">
                        <button onClick={() => handleDeletePago(p.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 rounded">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {pagoModal && (
        <PagoModal
          clienteId={clienteId}
          envio={pagoModal.envio || null}
          onClose={() => setPagoModal(null)}
          onPago={() => { setPagoModal(null); load() }}
        />
      )}
    </Modal>
  )
}

// ── NUEVO COBRO MODAL ────────────────────────────────────────

function NuevoCobroModal({ clientes, onClose, onGuardado }) {
  const [clienteId, setClienteId] = useState('')
  const [envios, setEnvios] = useState([])
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [concepto, setConcepto] = useState('')
  const [montos, setMontos] = useState({}) // { envio_id: monto_string }
  const [ccMonto, setCcMonto] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingEnvios, setLoadingEnvios] = useState(false)

  const loadEnvios = async (id) => {
    if (!id) { setEnvios([]); return }
    setLoadingEnvios(true)
    try {
      const r = await axios.get(`/api/cobros/clientes/${id}`)
      setEnvios(r.data.envios.filter(e => e.saldo_envio > 0))
    } catch { setEnvios([]) }
    finally { setLoadingEnvios(false) }
  }

  const handleClienteChange = (id) => {
    setClienteId(id); setMontos({}); setCcMonto(''); loadEnvios(id)
  }

  const setMonto = (envioId, val) => setMontos(p => ({ ...p, [envioId]: val }))
  const pagarTodo = (e) => setMonto(e.id, String(Math.max(0, e.saldo_envio).toFixed(2)))

  const totalDistribuido = Object.values(montos).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    + (parseFloat(ccMonto) || 0)

  const handleSave = async (ev) => {
    ev.preventDefault()
    if (!clienteId) { toast.error('Seleccioná un cliente'); return }
    const distribuciones = []
    for (const [envioId, monto] of Object.entries(montos)) {
      const m = parseFloat(monto) || 0
      if (m > 0) distribuciones.push({ envio_id: parseInt(envioId), monto: m })
    }
    const cc = parseFloat(ccMonto) || 0
    if (cc > 0) distribuciones.push({ envio_id: null, monto: cc })
    if (distribuciones.length === 0) { toast.error('Ingresá al menos un monto'); return }
    setSaving(true)
    try {
      await axios.post('/api/cobros/nuevo-cobro', { cliente_id: clienteId, fecha, concepto, distribuciones })
      toast.success('Cobro registrado')
      onGuardado()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Nuevo cobro" size="xl">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Cliente</label>
            <select value={clienteId} onChange={e => handleClienteChange(e.target.value)} className="select" required>
              <option value="">— Seleccionar cliente —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="label">Concepto (opcional)</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} className="input" placeholder="Transferencia, efectivo..." />
          </div>
        </div>

        {clienteId && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Asignar a facturas pendientes</p>
            {loadingEnvios ? (
              <p className="text-sm text-gray-400 py-3 text-center">Cargando envíos...</p>
            ) : envios.length === 0 ? (
              <p className="text-sm text-gray-400 py-3 text-center">No hay envíos con saldo pendiente</p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="table-header">Código</th>
                      <th className="table-header text-right">Saldo</th>
                      <th className="table-header text-right">Monto a aplicar</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {envios.map(e => (
                      <tr key={e.id} className="table-row">
                        <td className="table-cell font-mono font-semibold text-primary-600 dark:text-primary-400">{e.codigo}</td>
                        <td className="table-cell text-right font-mono text-red-600 dark:text-red-400">{fmt(e.saldo_envio)}</td>
                        <td className="table-cell text-right p-1">
                          <input
                            type="number" step="0.01" min="0" max={e.saldo_envio}
                            value={montos[e.id] || ''}
                            onChange={ev => setMonto(e.id, ev.target.value)}
                            placeholder="0.00"
                            className="w-28 text-right bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs outline-none focus:border-primary-400"
                          />
                        </td>
                        <td className="table-cell">
                          <button type="button" onClick={() => pagarTodo(e)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap">
                            Pagar todo
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">Pago a cuenta corriente (sin factura)</span>
              <input
                type="number" step="0.01" min="0"
                value={ccMonto}
                onChange={e => setCcMonto(e.target.value)}
                placeholder="0.00"
                className="w-28 text-right bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs outline-none focus:border-primary-400"
              />
            </div>

            {totalDistribuido > 0 && (
              <div className="flex justify-end">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Total a registrar: <span className="text-primary-600 dark:text-primary-400 font-mono">{fmt(totalDistribuido)}</span>
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving || !clienteId} className="btn-primary flex-1 justify-center">
            {saving ? 'Guardando...' : 'Registrar cobro'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

// ── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function Cobros() {
  const [clientes, setClientes] = useState([])
  const [q, setQ] = useState('')
  const [cuentaId, setCuentaId] = useState(null)
  const [nuevoCobroModal, setNuevoCobroModal] = useState(false)

  const load = async () => {
    const r = await axios.get('/api/cobros/clientes')
    setClientes(r.data)
  }
  useEffect(() => { load() }, [])

  const filtered = clientes.filter(c => !q || c.nombre.toLowerCase().includes(q.toLowerCase()))
  const totalDeuda = clientes.reduce((s, c) => s + Math.max(0, c.saldo || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Cobros</h1>
          <p className="text-sm text-gray-500">Cuenta corriente y pagos por cliente</p>
        </div>
        {totalDeuda > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-right">
            <p className="text-xs text-red-500">Deuda total</p>
            <p className="font-bold text-red-700 dark:text-red-400">{fmt(totalDeuda)}</p>
          </div>
        )}
        <button onClick={() => setNuevoCobroModal(true)} className="btn-primary">
          <Plus size={16} />Nuevo cobro
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente..." className="input pl-9" />
        </div>
        <p className="text-sm text-gray-500">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Cliente</th>
              <th className="table-header text-right">Facturado</th>
              <th className="table-header text-right">Pagado</th>
              <th className="table-header text-right">Saldo</th>
              <th className="table-header">Estado</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Sin clientes registrados</td></tr>
            )}
            {filtered.map(c => {
              const totalPagado = (c.total_pagado_envios || 0) + (c.total_cc || 0)
              const saldo = c.saldo || 0
              const badge = estadoPagoBadge(totalPagado, c.total_facturado)
              return (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium">{c.nombre}</td>
                  <td className="table-cell text-right font-mono">{fmt(c.total_facturado)}</td>
                  <td className="table-cell text-right font-mono text-green-600 dark:text-green-400">{fmt(totalPagado)}</td>
                  <td className={`table-cell text-right font-mono font-semibold ${saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmt(saldo)}
                  </td>
                  <td className="table-cell"><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                  <td className="table-cell text-right">
                    <button onClick={() => setCuentaId(c.id)} className="btn-secondary text-xs px-3 py-1">
                      <DollarSign size={13} />Ver cuenta
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {cuentaId && (
        <CuentaClienteModal
          clienteId={cuentaId}
          onClose={() => { setCuentaId(null); load() }}
        />
      )}

      {nuevoCobroModal && (
        <NuevoCobroModal
          clientes={clientes}
          onClose={() => setNuevoCobroModal(false)}
          onGuardado={() => { setNuevoCobroModal(false); load() }}
        />
      )}
    </div>
  )
}
