import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/app.css'
import { startLayoutDiagnostics } from './platform/layout-diagnostics'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
startLayoutDiagnostics()
