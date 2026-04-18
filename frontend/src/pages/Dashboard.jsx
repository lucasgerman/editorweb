import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { TrendingUp, TrendingDown, Package2, DollarSign, Weight, Bug } from 'lucide-react'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtN = (n) => new Intl.NumberFormat('es-AR').format(n || 0)

function KPICard({ title, value, sub, icon: Icon, color }) {
  return (
    <div className="card p-4 lg:p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{title}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600 dark:text-gray-400">{p.name}:</span>
          <span className="font-medium dark:text-gray-200">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = { anio, ...(mes ? { mes } : {}) }
        const r = await axios.get('/api/dashboard', { params })
        setData(r.data)
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [anio, mes])

  const kpis = data?.kpis
  const porMes = data?.porMes || []
  const porOrigen = data?.porOrigen || []

  const pieData = porOrigen.filter(o => o.ganancia > 0).slice(0, 8).map(o => ({
    name: o.origen_nombre, value: Number(o.ganancia)
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500">Resumen MBK</p>
        </div>
        <div className="flex gap-2">
          <select value={mes} onChange={e => setMes(e.target.value)} className="select w-auto text-sm">
            <option value="">Todo el año</option>
            {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m,i) => (
              <option key={i} value={i+1}>{m}</option>
            ))}
          </select>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))} className="select w-auto text-sm">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <KPICard title="Ganancia Total" value={fmt(kpis?.total_ganancia)}
              icon={kpis?.total_ganancia >= 0 ? TrendingUp : TrendingDown}
              color={kpis?.total_ganancia >= 0 ? 'bg-green-500' : 'bg-red-500'} />
            <KPICard title="Venta Total" value={fmt(kpis?.total_venta)} icon={DollarSign} color="bg-blue-500" />
            <KPICard title="Total Envíos" value={fmtN(kpis?.total_envios)} icon={Package2} color="bg-violet-500"
              sub={`${fmtN(Math.round(kpis?.total_kg_real || 0))} kg reales`} />
            <KPICard title="Deuda Maxi" value={fmt(data?.deuda_maxi)} icon={Weight} color="bg-orange-500"
              sub={`${data?.bugs_pendientes || 0} bugs pendientes`} />
          </div>

          <div className="card p-4 lg:p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Evolución mensual {anio}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={porMes.filter(m => anio < new Date().getFullYear() || m.num <= new Date().getMonth() + 1)}
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="venta" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="ganancia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="venta" name="Venta" stroke="#3b82f6" fill="url(#venta)" strokeWidth={2} />
                <Area type="monotone" dataKey="ganancia" name="Ganancia" stroke="#10b981" fill="url(#ganancia)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4 lg:p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Ganancia por origen</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porOrigen} margin={{ top: 0, right: 10, left: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="origen_nombre" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} width={50} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ganancia" name="Ganancia" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-4 lg:p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Distribución de ganancia</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      dataKey="value" nameKey="name" paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">Sin datos</div>
              )}
            </div>
          </div>

          {porOrigen.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Detalle por origen</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header">Origen</th>
                      <th className="table-header">Envíos</th>
                      <th className="table-header">Venta</th>
                      <th className="table-header">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porOrigen.map(o => (
                      <tr key={o.origen_nombre} className="table-row">
                        <td className="table-cell font-medium text-primary-700 dark:text-primary-400">{o.origen_nombre}</td>
                        <td className="table-cell">{fmtN(o.total)}</td>
                        <td className="table-cell">{fmt(o.venta)}</td>
                        <td className={`table-cell font-medium ${Number(o.ganancia) >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmt(o.ganancia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
