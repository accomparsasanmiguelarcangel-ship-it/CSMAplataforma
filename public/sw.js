/* Service worker — Asociación Cultural Comparsa San Miguel Arcángel 2004
 * Usa la carpeta real de instalación para funcionar también bajo GitHub Pages.
 */
const BASE = new URL('./', self.registration.scope).pathname
const VERSION = 'arcangel-ios-pwa-v3'
const INDEX_URL = new URL('index.html', self.registration.scope).pathname

const SHELL = [
  BASE,
  INDEX_URL,
  new URL('manifest.webmanifest', self.registration.scope).pathname,
  new URL('icons/icon-192.png', self.registration.scope).pathname,
  new URL('icons/icon-512.png', self.registration.scope).pathname,
  new URL('icons/apple-touch-icon-180.png', self.registration.scope).pathname,
  new URL('img/logo.png', self.registration.scope).pathname,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('arcangel-') && key !== VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return

  // Los datos y archivos privados siempre se consultan en sus servicios de origen.
  if (
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/storage/') ||
    url.pathname.includes('/functions/')
  ) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((cache) => cache.put(INDEX_URL, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match(INDEX_URL).then((cached) => cached || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (
          res.ok &&
          (
            url.pathname.includes('/assets/') ||
            url.pathname.includes('/icons/') ||
            url.pathname.includes('/img/')
          )
        ) {
          const copy = res.clone()
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {})
        }
        return res
      })
    }),
  )
})
