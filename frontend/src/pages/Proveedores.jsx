import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, CheckCircle, ChevronDown, ChevronRight, Banknote } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { formatDate } from '../utils/format'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const emptyProv = { nombre: '', email: '', telefono: '', pais: '', notas: '', dias_pago: 0 }
const emptyFact = { proveedor_id: '', numero_factura: '', fecha: new Date().toISOString().slice(0, 10), fecha_vencimiento: '', monto: '', moneda: 'ARS', concepto: '', notas: '' }
const emptyPago = { proveedor_id: '', factura_id: '', fecha: new Date().toISOString().slice(0, 10), monto: '', moneda: 'ARS', concepto: '', notas: '' }

function sumarDias(fechaISO, dias) {
  if (!fechaISO || !dias) return ''
  const d = new Date(fechaISO + 'T00:00:00')
  d.setDate(d.getDate() + Number(dias))
  return d.toISOString().slice(0, 10)
}

export default function Proveedores() {
  const { isAdmin } = useAuth()
  const [proveedores, setProveedores] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [facturas, setFacturas] = useState({})
  const [pagos, setPagos] = useState({})

  const [modalProv, setModalProv] = useState(false)
  const [editingProv, setEditingProv] = useState(null)
  const [formProv, setFormProv] = useState(emptyProv)

  const [modalFact, setModalFact] = useState(false)
  const [editingFact, setEditingFact] = useState(null)
  const [formFact, setFormFact] = useState(emptyFact)

  const [modalPago, setModalPago] = useState(false)
  const [formPago, setFormPago] = useState(emptyPago)

  const loadProveedores = useCallback(async () => {
    const r = await axios.get('/api/proveedores')
    setProveedores(r.data)
  }, [])

  useEffect(() => { loadProveedores() }, [loadProveedores])

  const loadFacturasYPagos = async (id) => {
    const r = await axios.get(`/api/proveedores/${id}`)
    setFacturas(prev => ({ ...prev, [id]: r.data.facturas }))
    setPagos(prev => ({ ...prev, [id]: r.data.pagos }))
  }

  const toggleExpand = (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadFacturasYPagos(id)
  }

  const openCreateProv = () => { setEditingProv(null); setFormProv(emptyProv); setModalProv(true) }
  const openEditProv = (p) => { setEditingProv(p); setFormProv({ nombre: p.nombre, email: p.email || '', telefono: p.telefono || '', pais: p.pais || '', notas: p.notas || '', dias_pago: p.dias_pago || 0 }); setModalProv(true) }

  const saveProv = async (e) => {
    e.preventDefault()
    try {
      if (editingProv) { await axios.put(`/api/proveedores/${editingProv.id}`, { ...formProv, activo: 1 }); toast.success('Proveedor actualizado') }
      else { await axios.post('/api/proveedores', formProv); toast.success('Proveedor creado') }
      setModalProv(false); loadProveedores()
    } catch (e) { toast.error(e.response?.data?.error || 'Error') }
  }

  const openCreateFact = (proveedor_id) => {
    setEditingFact(null)
    const prov = proveedores.find(p => p.id === proveedor_id)
    const hoy = new Date().toISOString().slice(0, 10)
    setFormFact({ ...emptyFact, proveedor_id, fecha: hoy, fecha_vencimiento: sumarDias(hoy, prov?.dias_pago) })
    setModalFact(true)
  }
  const openEditFact = (f) => {
    setEditingFact(f)
    setFormFact({
      proveedor_id: f.proveedor_id, numero_factura: f.numero_factura || '',
      fecha: f.fecha?.slice(0, 10), fecha_vencimiento: f.fecha_vencimiento || '',
      monto: f.monto, moneda: f.moneda, concepto: f.concepto || '',
      estado: f.estado, fecha_pago: f.fecha_pago || '', notas: f.notas || ''
    })
    setModalFact(true)
  }

  const onFechaFactChange = (fecha) => {
    const prov = proveedores.find(p => p.id === Number(formFact.proveedor_id))
    setFormFact(prev => ({ ...prev, fecha, fecha_vencimiento: sumarDias(fecha, prov?.dias_pago) }))
  }

  const saveFact = async (e) => {
    e.preventDefault()
    try {
      if (editingFact) { await axios.put(`/api/proveedores/facturas/${editingFact.id}`, formFact); toast.success('Factura actualizada') }
      else { await axios.post('/api/proveedores/facturas', formFact); toast.success('Factura cargada') }
      setModalFact(false)
      loadProveedores()
      if (formFact.proveedor_id) loadFacturasYPagos(formFact.proveedor_id)
    } catch (e) { toast.error(e.response?.data?.error || 'Error') }
  }

  const marcarAbonada = async (f) => {
    try {
      await axios.put(`/api/proveedores/facturas/${f.id}`, { ...f, estado: 'ABONADA', fecha_pago: new Date().toISOString().slice(0, 10) })
      toast.success('Marcada como abonada')
      loadProveedores()
      loadFacturasYPagos(f.proveedor_id)
    } catch { toast.error('Error') }
  }

  const deleteFact = async (f) => {
    if (!confirm('¿Eliminar esta factura?')) return
    try {
      await axios.delete(`/api/proveedores/facturas/${f.id}`)
      toast.success('Eliminada')
      loadProveedores()
      loadFacturasYPagos(f.proveedor_id)
    } catch { toast.error('Error') }
  }

  const openCreatePago = (proveedor_id) => {
    setFormPago({ ...emptyPago, proveedor_id, fecha: new Date().toISOString().slice(0, 10) })
    setModalPago(true)
  }

  const savePago = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/proveedores/pagos', formPago)
      toast.success('Pago registrado')
      setModalPago(false)
      loadProveedores()
      if (formPago.proveedor_id) loadFacturasYPagos(formPago.proveedor_id)
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const deletePago = async (pago, proveedor_id) => {
    if (!confirm('¿Eliminar este pago?')) return
    try {
      await axios.delete(`/api/proveedores/pagos/${pago.id}`)
      toast.success('Pago eliminado')
      loadProveedores()
      loadFacturasYPagos(proveedor_id)
    } catch { toast.error('Error') }
  }

  const totalDeudaARS = proveedores.reduce((a, p) => a + Number(p.deuda_ars), 0)
  const totalDeudaUSD = proveedores.reduce((a, p) => a + Number(p.deuda_usd), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Proveedores</h1>
          <p className="text-sm text-gray-500">
            {proveedores.length} proveedores · Deuda:
            {totalDeudaARS > 0 && <span className="font-semibold text-red-600 dark:text-red-400 ml-1">{fmt(totalDeudaARS)}</span>}
            {totalDeudaARS > 0 && totalDeudaUSD > 0 && <span className="mx-1 text-gray-400">+</span>}
            {totalDeudaUSD > 0 && <span className="font-semibold text-red-600 dark:text-red-400">u$s {totalDeudaUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
            {totalDeudaARS === 0 && totalDeudaUSD === 0 && <span className="font-semibold text-gray-400 ml-1">Sin deuda</span>}
          </p>
        </div>
        <button onClick={openCreateProv} className="btn-primary"><Plus size={16} />Nuevo proveedor</button>
      </div>

      <div className="space-y-2">
        {proveedores.length === 0 && (
          <div className="card p-10 text-center text-gray-400">No hay proveedores cargados</div>
        )}

        {proveedores.map(p => (
          <div key={p.id} className="card overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              onClick={() => toggleExpand(p.id)}
            >
              <button className="text-gray-400 shrink-0">
                {expanded === p.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{p.nombre}</p>
                <p className="text-xs text-gray-500">{[p.pais, p.email, p.telefono].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-4 text-sm shrink-0">
                {(Number(p.deuda_ars) > 0 || Number(p.deuda_usd) > 0) ? (
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-500">Pendiente</p>
                    {Number(p.deuda_ars) > 0 && <p className="font-bold text-red-600 dark:text-red-400 leading-tight">{fmt(p.deuda_ars)}</p>}
                    {Number(p.deuda_usd) > 0 && <p className="font-bold text-red-600 dark:text-red-400 leading-tight">u$s {Number(p.deuda_usd).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                  </div>
                ) : (
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-500">Pendiente</p>
                    <p className="font-bold text-gray-400">—</p>
                  </div>
                )}
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-gray-500">Facturas</p>
                  <p className="font-medium text-gray-700 dark:text-gray-300">{p.total_facturas}</p>
                </div>
                {Number(p.facturas_pendientes) > 0 && (
                  <span className="badge badge-red">{p.facturas_pendientes} pendiente{p.facturas_pendientes > 1 ? 's' : ''}</span>
                )}
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditProv(p)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil size={14} /></button>
                </div>
              </div>
            </div>

            {expanded === p.id && (
              <div className="border-t border-gray-100 dark:border-gray-800">
                <div className="px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Facturas de {p.nombre}</p>
                  <div className="flex gap-2">
                    <button onClick={() => openCreatePago(p.id)} className="btn-secondary btn-sm"><Banknote size={14} />Registrar pago</button>
                    <button onClick={() => openCreateFact(p.id)} className="btn-primary btn-sm"><Plus size={14} />Nueva factura</button>
                  </div>
                </div>

                {!facturas[p.id] ? (
                  <div className="px-4 pb-4 text-sm text-gray-400">Cargando...</div>
                ) : (facturas[p.id].length === 0 && (!pagos[p.id] || pagos[p.id].length === 0)) ? (
                  <div className="px-4 pb-4 text-sm text-gray-400">Sin movimientos</div>
                ) : (() => {
                  const items = [
                    ...(facturas[p.id] || []).map(f => ({ ...f, _tipo: 'factura' })),
                    ...(pagos[p.id] || []).map(pg => ({ ...pg, _tipo: 'pago' }))
                  ].sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0))

                  const pendARS = (facturas[p.id] || []).filter(f => f.estado === 'PENDIENTE' && f.moneda === 'ARS').reduce((a, f) => a + Number(f.monto), 0)
                    - (pagos[p.id] || []).filter(pg => !pg.factura_id && pg.moneda === 'ARS').reduce((a, pg) => a + Number(pg.monto), 0)
                  const pendUSD = (facturas[p.id] || []).filter(f => f.estado === 'PENDIENTE' && f.moneda === 'USD').reduce((a, f) => a + Number(f.monto), 0)
                    - (pagos[p.id] || []).filter(pg => !pg.factura_id && pg.moneda === 'USD').reduce((a, pg) => a + Number(pg.monto), 0)

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="table-header">Tipo</th>
                            <th className="table-header">Fecha</th>
                            <th className="table-header">Referencia</th>
                            <th className="table-header">Vencimiento</th>
                            <th className="table-header">Concepto</th>
                            <th className="table-header text-right">Pesos</th>
                            <th className="table-header text-right">Dólares</th>
                            <th className="table-header">Estado</th>
                            <th className="table-header"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(item => item._tipo === 'factura' ? (
                            <tr key={`f-${item.id}`} className="table-row">
                              <td className="table-cell"><span className="badge badge-gray">Factura</span></td>
                              <td className="table-cell">{formatDate(item.fecha)}</td>
                              <td className="table-cell font-medium">{item.numero_factura || <span className="text-gray-400">—</span>}</td>
                              <td className="table-cell">
                                {item.fecha_vencimiento ? (() => {
                                  const hoy = new Date(); hoy.setHours(0,0,0,0)
                                  const venc = new Date(item.fecha_vencimiento + 'T00:00:00')
                                  const dias = Math.round((venc - hoy) / 86400000)
                                  const color = item.estado === 'ABONADA' ? 'text-gray-400' : dias < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : dias <= 7 ? 'text-orange-500 font-medium' : 'text-gray-600 dark:text-gray-400'
                                  return <span className={color}>{formatDate(item.fecha_vencimiento)}</span>
                                })() : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="table-cell text-gray-500">{item.concepto || '—'}</td>
                              <td className="table-cell text-right font-semibold">
                                {item.moneda === 'ARS' ? fmt(item.monto) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                              <td className="table-cell text-right font-semibold">
                                {item.moneda === 'USD' ? <span>u$s {Number(item.monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                              <td className="table-cell">
                                {item.estado === 'ABONADA' ? <span className="badge badge-green">Abonada</span> : <span className="badge badge-red">Pendiente</span>}
                              </td>
                              <td className="table-cell">
                                <div className="flex gap-1">
                                  {item.estado === 'PENDIENTE' && (
                                    <button onClick={() => marcarAbonada(item)} className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded" title="Marcar abonada"><CheckCircle size={14} /></button>
                                  )}
                                  <button onClick={() => openEditFact(item)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil size={14} /></button>
                                  {isAdmin && <button onClick={() => deleteFact(item)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded"><Trash2 size={14} /></button>}
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={`pg-${item.id}`} className="table-row bg-green-50/40 dark:bg-green-900/10">
                              <td className="table-cell"><span className="badge badge-green">Pago</span></td>
                              <td className="table-cell">{formatDate(item.fecha)}</td>
                              <td className="table-cell text-gray-500">{item.numero_factura ? <span className="text-xs">→ {item.numero_factura}</span> : <span className="text-gray-400 text-xs">Sin factura</span>}</td>
                              <td className="table-cell"><span className="text-gray-400">—</span></td>
                              <td className="table-cell text-gray-500">{item.concepto || '—'}</td>
                              <td className="table-cell text-right font-semibold text-green-600 dark:text-green-400">
                                {item.moneda === 'ARS' ? fmt(item.monto) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                              <td className="table-cell text-right font-semibold text-green-600 dark:text-green-400">
                                {item.moneda === 'USD' ? `u$s ${Number(item.monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                              <td className="table-cell"><span className="text-gray-400">—</span></td>
                              <td className="table-cell">
                                {isAdmin && <button onClick={() => deletePago(item, p.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded"><Trash2 size={14} /></button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 dark:bg-gray-800/60 font-semibold">
                            <td colSpan={5} className="table-cell">Total pendiente</td>
                            <td className="table-cell text-right text-red-600 dark:text-red-400">
                              {pendARS > 0 ? fmt(pendARS) : <span className="text-gray-400 font-normal">—</span>}
                            </td>
                            <td className="table-cell text-right text-red-600 dark:text-red-400">
                              {pendUSD > 0 ? `u$s ${pendUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-gray-400 font-normal">—</span>}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={modalProv} onClose={() => setModalProv(false)} title={editingProv ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <form onSubmit={saveProv} className="space-y-3">
          <div><label className="label">Nombre *</label>
            <input value={formProv.nombre} onChange={e => setFormProv({ ...formProv, nombre: e.target.value })} className="input" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">País</label>
              <input value={formProv.pais} onChange={e => setFormProv({ ...formProv, pais: e.target.value })} className="input" placeholder="Ej: USA" /></div>
            <div><label className="label">Teléfono</label>
              <input value={formProv.telefono} onChange={e => setFormProv({ ...formProv, telefono: e.target.value })} className="input" /></div>
          </div>
          <div><label className="label">Email</label>
            <input type="email" value={formProv.email} onChange={e => setFormProv({ ...formProv, email: e.target.value })} className="input" /></div>
          <div>
            <label className="label">Días para pagar factura</label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={formProv.dias_pago} onChange={e => setFormProv({ ...formProv, dias_pago: e.target.value })} className="input w-28" placeholder="0" />
              <span className="text-sm text-gray-500 dark:text-gray-400">días desde la fecha de la factura</span>
            </div>
          </div>
          <div><label className="label">Notas</label>
            <textarea value={formProv.notas} onChange={e => setFormProv({ ...formProv, notas: e.target.value })} className="input" rows={2} /></div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editingProv ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModalProv(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal open={modalPago} onClose={() => setModalPago(false)} title="Registrar pago">
        <form onSubmit={savePago} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Fecha *</label>
              <input type="date" value={formPago.fecha} onChange={e => setFormPago({ ...formPago, fecha: e.target.value })} className="input" required /></div>
            <div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Monto *</label>
              <input type="number" step="0.01" min="0" value={formPago.monto} onChange={e => setFormPago({ ...formPago, monto: e.target.value })} className="input" required /></div>
            <div><label className="label">Moneda</label>
              <select value={formPago.moneda} onChange={e => setFormPago({ ...formPago, moneda: e.target.value })} className="select">
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select></div>
          </div>
          <div>
            <label className="label">Factura asociada (opcional)</label>
            <select value={formPago.factura_id} onChange={e => setFormPago({ ...formPago, factura_id: e.target.value })} className="select">
              <option value="">— Sin factura específica —</option>
              {(facturas[formPago.proveedor_id] || [])
                .filter(f => f.estado === 'PENDIENTE' && f.moneda === formPago.moneda)
                .map(f => (
                  <option key={f.id} value={f.id}>
                    {f.numero_factura || `Factura #${f.id}`} — {f.moneda === 'ARS' ? fmt(f.monto) : `u$s ${Number(f.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                  </option>
                ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Si asociás una factura, se marca automáticamente como abonada</p>
          </div>
          <div><label className="label">Concepto</label>
            <input value={formPago.concepto} onChange={e => setFormPago({ ...formPago, concepto: e.target.value })} className="input" placeholder="Ej: Transferencia bancaria" /></div>
          <div><label className="label">Notas</label>
            <textarea value={formPago.notas} onChange={e => setFormPago({ ...formPago, notas: e.target.value })} className="input" rows={2} /></div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">Registrar pago</button>
            <button type="button" onClick={() => setModalPago(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal open={modalFact} onClose={() => setModalFact(false)} title={editingFact ? 'Editar factura' : 'Nueva factura'}>
        <form onSubmit={saveFact} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">N° Factura</label>
              <input value={formFact.numero_factura} onChange={e => setFormFact({ ...formFact, numero_factura: e.target.value })} className="input" placeholder="Ej: 0001-00012345" /></div>
            <div><label className="label">Fecha *</label>
              <input type="date" value={formFact.fecha} onChange={e => onFechaFactChange(e.target.value)} className="input" required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vencimiento</label>
              <input type="date" value={formFact.fecha_vencimiento || ''} onChange={e => setFormFact({ ...formFact, fecha_vencimiento: e.target.value })} className="input" />
              {formFact.fecha_vencimiento && (() => {
                const hoy = new Date(); hoy.setHours(0,0,0,0)
                const venc = new Date(formFact.fecha_vencimiento + 'T00:00:00')
                const dias = Math.round((venc - hoy) / 86400000)
                return <p className={`text-xs mt-1 ${dias < 0 ? 'text-red-500' : dias <= 7 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {dias < 0 ? `Vencida hace ${-dias} día${-dias !== 1 ? 's' : ''}` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias !== 1 ? 's' : ''}`}
                </p>
              })()}
            </div>
            <div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Monto *</label>
              <input type="number" step="0.01" value={formFact.monto} onChange={e => setFormFact({ ...formFact, monto: e.target.value })} className="input" required /></div>
            <div><label className="label">Moneda</label>
              <select value={formFact.moneda} onChange={e => setFormFact({ ...formFact, moneda: e.target.value })} className="select">
                <option value="ARS">ARS $</option>
                <option value="USD">USD u$s</option>
              </select></div>
          </div>
          <div><label className="label">Concepto</label>
            <input value={formFact.concepto} onChange={e => setFormFact({ ...formFact, concepto: e.target.value })} className="input" placeholder="Ej: Envío MBK" /></div>
          {editingFact && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Estado</label>
                <select value={formFact.estado} onChange={e => setFormFact({ ...formFact, estado: e.target.value })} className="select">
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="ABONADA">Abonada</option>
                </select></div>
              <div><label className="label">Fecha de pago</label>
                <input type="date" value={formFact.fecha_pago || ''} onChange={e => setFormFact({ ...formFact, fecha_pago: e.target.value })} className="input" /></div>
            </div>
          )}
          <div><label className="label">Notas</label>
            <textarea value={formFact.notas} onChange={e => setFormFact({ ...formFact, notas: e.target.value })} className="input" rows={2} /></div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editingFact ? 'Guardar' : 'Cargar factura'}</button>
            <button type="button" onClick={() => setModalFact(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
