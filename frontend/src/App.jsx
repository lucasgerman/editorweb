import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MBK from './pages/MBK'
import Servicios from './pages/Servicios'
import Usuarios from './pages/Usuarios'
import Proveedores from './pages/Proveedores'
import Bugs from './pages/Bugs'
import Cobros from './pages/Cobros'
import Clientes from './pages/Clientes'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.rol !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="mbk" element={<MBK />} />
        <Route path="cobros" element={<Cobros />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="bugs" element={<Bugs />} />
        <Route path="servicios" element={<ProtectedRoute adminOnly><Servicios /></ProtectedRoute>} />
        <Route path="usuarios" element={<ProtectedRoute adminOnly><Usuarios /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
