import { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Plus, Pencil, ShieldCheck, User } from 'lucide-react'
import Modal from '../components/Modal'

export default function Usuarios() {
  const [data, setData] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'empleado', activo: 1 })

  const load = async () => { const r = await axios.get('/api/usuarios'); setData(r.data) }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm({ nombre: '', email: '', password: '', rol: 'empleado', activo: 1 }); setModal(true) }
  const openEdit = (u) => { setEditing(u); setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, activo: u.activo }); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (editing) { await axios.put(`/api/usuarios/${editing.id}`, form); toast.success('Usuario actualizado') }
      else {
        if (!form.password) return toast.error('La contraseña es requerida')
        await axios.post('/api/usuarios', form); toast.success('Usuario creado')
      }
      setModal(false); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Error') }
  }

  const toggleActivo = async (u) => {
    await axios.put(`/api/usuarios/${u.id}`, { ...u, activo: u.activo ? 0 : 1 })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Usuarios</h1>
          <p className="text-sm text-gray-500">Gestión de accesos al sistema</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={16} />Nuevo usuario</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map(u => (
          <div key={u.id} className={`card p-4 ${!u.activo ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${u.rol === 'admin' ? 'bg-primary-100 dark:bg-primary-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                {u.rol === 'admin' ? <ShieldCheck size={20} className="text-primary-600" /> : <User size={20} className="text-gray-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{u.nombre}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`badge ${u.rol === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{u.rol}</span>
                  <span className={`badge ${u.activo ? 'badge-green' : 'badge-red'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Pencil size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar usuario' : 'Nuevo usuario'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div><label className="label">Nombre</label>
            <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} className="input" required /></div>
          <div><label className="label">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input" required /></div>
          <div><label className="label">{editing ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
            <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="input" placeholder="••••••••" /></div>
          <div><label className="label">Rol</label>
            <select value={form.rol} onChange={e => setForm({...form, rol: e.target.value})} className="select">
              <option value="empleado">Empleado</option>
              <option value="admin">Administrador</option>
            </select></div>
          {editing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activo" checked={!!form.activo} onChange={e => setForm({...form, activo: e.target.checked ? 1 : 0})} />
              <label htmlFor="activo" className="text-sm text-gray-700 dark:text-gray-300">Usuario activo</label>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
