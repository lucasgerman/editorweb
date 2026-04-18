import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  LayoutDashboard, Package2, Truck, Wrench, ShieldCheck,
  Bug, LogOut, Menu, X, Sun, Moon, DollarSign, Users, ChevronLeft, ChevronRight
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/mbk', icon: Package2, label: 'Envios (SH)' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/cobros', icon: DollarSign, label: 'Cobros' },
  { to: '/proveedores', icon: Truck, label: 'Proveedores' },
  { label: 'divider' },
  { to: '/bugs', icon: Bug, label: 'Bugs / Mejoras' },
  { label: 'divider' },
  { to: '/servicios', icon: Wrench, label: 'Servicios', adminOnly: true },
  { to: '/usuarios', icon: ShieldCheck, label: 'Usuarios', adminOnly: true },
]

function NavItem({ item, onClick, collapsed }) {
  const { isAdmin } = useAuth()
  if (item.label === 'divider') return <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
  if (item.adminOnly && !isAdmin) return null
  return (
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${collapsed ? 'justify-center' : ''} ${
          isActive
            ? 'bg-primary-600 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`
      }
    >
      <item.icon size={18} className="shrink-0" />
      {!collapsed && item.label}
    </NavLink>
  )
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }
  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar_collapsed', String(next))
  }

  const Sidebar = ({ mobile = false }) => (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className={`p-4 border-b border-gray-200 dark:border-gray-700 ${collapsed && !mobile ? 'px-2' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
            <Package2 size={20} className="text-white" />
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">MaxCargo</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">MBK Management</p>
            </div>
          )}
          {(!collapsed || mobile) && (
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
              title={dark ? 'Modo claro' : 'Modo nocturno'}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item, i) => (
          <NavItem key={i} item={item} collapsed={collapsed && !mobile} onClick={() => mobile && setSidebarOpen(false)} />
        ))}
      </nav>

      <div className={`p-3 border-t border-gray-200 dark:border-gray-700 space-y-2`}>
        {/* Collapse toggle — solo en desktop */}
        {!mobile && (
          <button
            onClick={toggleCollapse}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={collapsed ? 'Expandir menú' : 'Comprimir menú'}
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Comprimir</span></>}
          </button>
        )}
        {(!collapsed || mobile) ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
            <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center shrink-0">
              <span className="text-primary-700 dark:text-primary-400 text-xs font-bold">{user?.nombre?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{user?.nombre}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.rol}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex justify-center p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <aside className={`hidden lg:flex flex-col border-r border-gray-200 dark:border-gray-700 shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col w-72 h-full shadow-xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 z-10"
            >
              <X size={20} />
            </button>
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Package2 size={20} className="text-primary-600" />
            <span className="font-bold text-gray-900 dark:text-gray-100">MaxCargo</span>
          </div>
          <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
