
/* Service worker — Asociación Cultural Comparsa San Miguel Arcángel 2004 */

const BASE = '/CSMAplataforma/'
const VERSION = 'arcangel-v2'

const SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}img/logo.png`,
]

const INDEX_URL = `${BASE}index.html`

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

  if (url.origin !== self.location.origin) return

  if (!url.pathname.startsWith(BASE)) return

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
            caches.open(VERSION)
              .then((cache) => cache.put(INDEX_URL, copy))
              .catch(() => {})
          }
          return res
        })
        .catch(() =>
          caches.match(INDEX_URL).then((cached) => cached || Response.error()),
        ),
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
          caches.open(VERSION)
            .then((cache) => cache.put(req, copy))
            .catch(() => {})
        }

        return res
      })
    }),
  )
})
