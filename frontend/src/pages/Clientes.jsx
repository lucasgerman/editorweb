import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Eye, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n || 0)
const fmtNum = (n) =>
  Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })

function estadoBadge(saldo) {
  if (saldo > 0) return { label: 'Con deuda', cls: 'badge-red' }
  return { label: 'Al día', cls: 'badge-green' }
}

export default function Clientes() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState([])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [detailCliente, setDetailCliente] = useState(null)
  const [detailEnvios, setDetailEnvios] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '', kg_vta: '' })

  const load = async () => {
    const r = await axios.get('/api/mbk/clientes')
    setData(r.data)
  }
  useEffect(() => { load() }, [])

  const filtered = data.filter(c => !q || c.nombre.toLowerCase().includes(q.toLowerCase()))

  const openCreate = () => { setEditing(null); setForm({ nombre: '', kg_vta: '' }); setModal(true) }
  const openEdit = (c) => { setEditing(c); setForm({ nombre: c.nombre, kg_vta: c.kg_vta ?? '' }); setModal(true) }

  const openDetail = async (c) => {
    setDetailCliente(c)
    const r = await axios.get(`/api/mbk/clientes/${c.id}/envios`)
    setDetailEnvios(r.data)
    setDetailModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const payload = { nombre: form.nombre, kg_vta: parseFloat(form.kg_vta) || 0 }
      if (editing) {
        await axios.put(`/api/mbk/clientes/${editing.id}`, payload)
        toast.success('Cliente actualizado')
      } else {
        await axios.post('/api/mbk/clientes', payload)
        toast.success('Cliente creado')
      }
      setModal(false); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este cliente? Sus envíos se conservarán.')) return
    try {
      await axios.delete(`/api/mbk/clientes/${id}`)
      toast.success('Eliminado')
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Error') }
  }

  const totalDeuda = data.reduce((s, c) => {
    const saldo = (c.total_venta || 0) - (c.total_pagado || 0)
    return s + Math.max(0, saldo)
  }, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Clientes</h1>
          <p className="text-sm text-gray-500">Gestión y estado de cuenta por cliente</p>
        </div>
        {totalDeuda > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-right">
            <p className="text-xs text-red-500">Deuda total</p>
            <p className="font-bold text-red-700 dark:text-red-400">{fmt(totalDeuda)}</p>
          </div>
        )}
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo cliente</button>
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
              <th className="table-header">Nombre</th>
              <th className="table-header text-right">Envíos</th>
              <th className="table-header text-right">KG Total</th>
              <th className="table-header text-right">KG Vta</th>
              <th className="table-header text-right">Total Venta</th>
              <th className="table-header text-right">Pagado</th>
              <th className="table-header text-right">Saldo</th>
              <th className="table-header">Estado</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">Sin clientes</td></tr>
            )}
            {filtered.map(c => {
              const saldo = (c.total_venta || 0) - (c.total_pagado || 0)
              const badge = estadoBadge(saldo)
              return (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium">{c.nombre}</td>
                  <td className="table-cell text-right">{c.total_envios}</td>
                  <td className="table-cell text-right font-mono">{fmtNum(c.total_kg)} kg</td>
                  <td className="table-cell text-right font-mono text-primary-600 dark:text-primary-400">
                    {c.kg_vta > 0 ? fmt(c.kg_vta) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="table-cell text-right font-mono">{fmt(c.total_venta)}</td>
                  <td className="table-cell text-right font-mono text-green-600 dark:text-green-400">{fmt(c.total_pagado)}</td>
                  <td className={`table-cell text-right font-mono font-semibold ${saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {fmt(saldo)}
                  </td>
                  <td className="table-cell"><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                  <td className="table-cell">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openDetail(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Ver envíos"><Eye size={14} /></button>
                      <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar"><Pencil size={14} /></button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded" title="Eliminar"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear/editar */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className="input" required autoFocus />
          </div>
          <div>
            <label className="label">KG Vta por defecto</label>
            <input type="number" step="0.01" min="0" value={form.kg_vta} onChange={e => setForm(p => ({ ...p, kg_vta: e.target.value }))} className="input" placeholder="Ej: 60" />
            <p className="text-xs text-gray-400 mt-0.5">Se usará automáticamente al crear envíos para este cliente</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>

      {/* Modal detalle envíos */}
      <Modal open={detailModal} onClose={() => setDetailModal(false)} title={`Envíos de ${detailCliente?.nombre}`} size="lg">
        <div className="space-y-3">
          {detailEnvios.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin envíos asociados</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header">Código</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header text-right">KG Real</th>
                  <th className="table-header text-right">Venta</th>
                  <th className="table-header text-right">Pagado</th>
                  <th className="table-header text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {detailEnvios.map(e => {
                  const saldo = (e.venta || 0) - (e.monto_pagado || 0)
                  return (
                    <tr key={e.id} className="table-row">
                      <td className="table-cell font-mono font-semibold text-primary-600 dark:text-primary-400">{e.codigo}</td>
                      <td className="table-cell">{e.fecha}</td>
                      <td className="table-cell text-right">{fmtNum(e.kg_real)} kg</td>
                      <td className="table-cell text-right font-mono">{fmt(e.venta)}</td>
                      <td className="table-cell text-right font-mono text-green-600 dark:text-green-400">{fmt(e.monto_pagado)}</td>
                      <td className={`table-cell text-right font-mono font-semibold ${saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{fmt(saldo)}</td>
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
