import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyStoredThemeAttribute } from './theme/ThemeProvider'
import './index.css'

// Paint the last-known theme before first render to avoid a flash of the wrong theme.
applyStoredThemeAttribute()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
