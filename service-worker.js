const CACHE_NAME = 'evidencias-solara-v3';

const APP_SHELL = [
  '/Evidencias-Solara/',
  '/Evidencias-Solara/index.html',
  '/Evidencias-Solara/app.js',
  '/Evidencias-Solara/manifest.json',
  '/Evidencias-Solara/icono.png'
];

// INSTALL
self.addEventListener('install', event => {
  console.log('SW: Instalando v3');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener('activate', event => {
  console.log('SW: Activado v3');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // API → Network first
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ status: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Navegación → index.html SIEMPRE
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/Evidencias-Solara/index.html')
    );
    return;
  }

  // Estáticos → cache first
  event.respondWith(
    caches.match(req).then(res =>
      res || fetch(req)
    )
  );
});