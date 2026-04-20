import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'

if (import.meta.env.PROD) {
  axios.defaults.baseURL = 'https://illustrious-acceptance-production-0357.up.railway.app'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
