import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Modal from '../components/Modal'

const PRIORIDADES = ['alta', 'media', 'baja']
const ESTADOS = ['pendiente', 'en progreso', 'resuelto']

const prioridadBadge = { alta: 'badge-red', media: 'badge-yellow', baja: 'badge-green' }
const estadoBadge = { pendiente: 'badge-gray', 'en progreso': 'badge-blue', resuelto: 'badge-green' }

const emptyForm = { titulo: '', descripcion: '', prioridad: 'media', estado: 'pendiente' }

export default function Bugs() {
  const [data, setData] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [inlineEdit, setInlineEdit] = useState(null)

  const load = async () => {
    const r = await axios.get('/api/bugs')
    setData(r.data)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModal(true) }
  const openEdit = (b) => {
    setEditing(b)
    setForm({ titulo: b.titulo, descripcion: b.descripcion || '', prioridad: b.prioridad, estado: b.estado })
    setModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        await axios.put(`/api/bugs/${editing.id}`, form)
        toast.success('Actualizado')
      } else {
        await axios.post('/api/bugs', form)
        toast.success('Agregado')
      }
      setModal(false)
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este ítem?')) return
    try { await axios.delete(`/api/bugs/${id}`); load() }
    catch { toast.error('Error') }
  }

  const startInline = (b) => setInlineEdit({ id: b.id, prioridad: b.prioridad, estado: b.estado })

  const saveInline = async () => {
    try {
      const bug = data.find(b => b.id === inlineEdit.id)
      await axios.put(`/api/bugs/${inlineEdit.id}`, { ...bug, ...inlineEdit })
      toast.success('Guardado')
      setInlineEdit(null)
      load()
    } catch { toast.error('Error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bugs / Mejoras</h1>
          <p className="text-sm text-gray-500">Cosas pendientes para agregar al sistema</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo ítem</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Título</th>
              <th className="table-header">Descripción</th>
              <th className="table-header">Prioridad</th>
              <th className="table-header">Estado</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">Sin ítems cargados</td></tr>
            )}
            {data.map(b => (
              <tr key={b.id} className="table-row">
                <td className="table-cell font-medium max-w-[200px]">{b.titulo}</td>
                <td className="table-cell text-gray-500 max-w-[280px]">{b.descripcion || '—'}</td>

                {/* Prioridad inline */}
                <td className="table-cell">
                  {inlineEdit?.id === b.id ? (
                    <select
                      value={inlineEdit.prioridad}
                      onChange={e => setInlineEdit({ ...inlineEdit, prioridad: e.target.value })}
                      className="select py-0.5 text-xs"
                    >
                      {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span className={`badge ${prioridadBadge[b.prioridad]}`}>{b.prioridad}</span>
                  )}
                </td>

                {/* Estado inline */}
                <td className="table-cell">
                  {inlineEdit?.id === b.id ? (
                    <select
                      value={inlineEdit.estado}
                      onChange={e => setInlineEdit({ ...inlineEdit, estado: e.target.value })}
                      className="select py-0.5 text-xs"
                    >
                      {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className={`badge ${estadoBadge[b.estado]}`}>{b.estado}</span>
                  )}
                </td>

                <td className="table-cell">
                  <div className="flex gap-1">
                    {inlineEdit?.id === b.id ? (
                      <>
                        <button onClick={saveInline} className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 rounded" title="Guardar">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setInlineEdit(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 rounded" title="Cancelar">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startInline(b)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded" title="Editar prioridad/estado">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" title="Editar completo">
                          <Pencil size={14} className="opacity-50" />
                        </button>
                        <button onClick={() => handleDelete(b.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar ítem' : 'Nuevo ítem'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="label">Título</label>
            <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="label">Descripción (opcional)</label>
            <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="input" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} className="select">
                {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="select">
                {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Agregar'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
