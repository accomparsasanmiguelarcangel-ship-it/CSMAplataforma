import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename="/CSMAplataforma">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// PWA: registro del service worker (solo en producción)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
     scope: import.meta.env.BASE_URL,
    }).catch(() => {
      /* el SW es opcional: la app funciona igual sin conexión parcial */
    })
  })
}
