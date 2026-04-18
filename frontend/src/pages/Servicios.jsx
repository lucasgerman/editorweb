import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Modal from '../components/Modal'

const TIPOS = ['fijo','variable','sueldo','impuesto','otro']
const tipoBadge = { fijo: 'badge-blue', variable: 'badge-yellow', sueldo: 'badge-green', impuesto: 'badge-red', otro: 'badge-gray' }

export default function Servicios() {
  const [data, setData] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'fijo', descripcion: '' })

  const load = async () => { const r = await axios.get('/api/servicios'); setData(r.data) }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm({ nombre: '', tipo: 'fijo', descripcion: '' }); setModal(true) }
  const openEdit = (s) => { setEditing(s); setForm({ nombre: s.nombre, tipo: s.tipo, descripcion: s.descripcion || '' }); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (editing) { await axios.put(`/api/servicios/${editing.id}`, { ...form, activo: 1 }); toast.success('Actualizado') }
      else { await axios.post('/api/servicios', form); toast.success('Servicio creado') }
      setModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Desactivar este servicio?')) return
    try { await axios.delete(`/api/servicios/${id}`); load() }
    catch { toast.error('Error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Servicios / Categorías</h1>
          <p className="text-sm text-gray-500">Categorías de gastos disponibles</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo servicio</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="table-header">Nombre</th>
            <th className="table-header">Tipo</th>
            <th className="table-header">Descripción</th>
            <th className="table-header">Estado</th>
            <th className="table-header"></th>
          </tr></thead>
          <tbody>
            {data.map(s => (
              <tr key={s.id} className={`table-row ${!s.activo ? 'opacity-50' : ''}`}>
                <td className="table-cell font-medium">{s.nombre}</td>
                <td className="table-cell"><span className={`badge ${tipoBadge[s.tipo] || 'badge-gray'}`}>{s.tipo}</span></td>
                <td className="table-cell text-gray-500">{s.descripcion || '—'}</td>
                <td className="table-cell"><span className={`badge ${s.activo ? 'badge-green' : 'badge-gray'}`}>{s.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td className="table-cell">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar servicio' : 'Nuevo servicio'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div><label className="label">Nombre</label>
            <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} className="input" required /></div>
          <div><label className="label">Tipo</label>
            <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})} className="select">
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label className="label">Descripción (opcional)</label>
            <textarea value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} className="input" rows={2} /></div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
