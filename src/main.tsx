import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// flag-icons' stylesheet is not imported — Flag.tsx pulls the five flags it needs
// as individual SVG modules instead of shipping all 142.
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
