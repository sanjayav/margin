import React from 'react'
import ReactDOM from 'react-dom/client'
// Order matters: Tailwind's preflight first, then the token layer, so the
// design system's `body`, focus ring and scrollbar rules are the ones that win.
import './app/base.css'
import './app/design/tokens.css'
import AppRoot from './app/index'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
)
