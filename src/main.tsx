import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

const isGitHubPages = window.location.pathname.startsWith('/CSMAplataforma')
const routerBase = isGitHubPages ? '/CSMAplataforma' : '/'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBase}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// The service worker is only for the hosted website, not the native Android app.
if (
  'serviceWorker' in navigator &&
  import.meta.env.PROD &&
  window.location.hostname !== 'localhost'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch(() => {
      /* The service worker is optional; the app works without it. */
    })
  })
}
