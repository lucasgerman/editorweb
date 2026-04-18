import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Package2, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <Package2 size={32} className="text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-white">MaxCargo</h1>
          <p className="text-primary-200 text-sm mt-1">MBK Management</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="email@ejemplo.com" required autoFocus
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="input pr-10" placeholder="••••••••" required
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : 'Entrar'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 font-medium mb-2">Accesos de prueba:</p>
            <div className="space-y-1">
              <button onClick={() => { setEmail('admin@maxcargo.com'); setPassword('admin123') }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Admin</span>
                <span className="text-xs text-gray-400 ml-2">admin@maxcargo.com / admin123</span>
              </button>
              <button onClick={() => { setEmail('empleado@maxcargo.com'); setPassword('empleado123') }}
                className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Empleado</span>
                <span className="text-xs text-gray-400 ml-2">empleado@maxcargo.com / empleado123</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
