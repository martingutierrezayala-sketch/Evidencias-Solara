const CACHE_NAME = 'evidencias-solara-v2'; // Cambié la versión
const urlsToCache = [
  '/Evidencias-Solara/',
  '/Evidencias-Solara/index.html',
  '/Evidencias-Solara/app.js',
  '/Evidencias-Solara/manifest.json',
  '/Evidencias-Solara/icono.png',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

// Instalación - Cachear archivos
self.addEventListener('install', (event) => {
  console.log('SW: Instalando v2...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('SW: Cacheando archivos...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('SW: Archivos cacheados correctamente');
        return self.skipWaiting();
      })
      .catch(err => console.error('SW: Error cacheando:', err))
  );
});

// Activación - Limpiar cachés viejos
self.addEventListener('activate', (event) => {
  console.log('SW: Activando v2...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Borrando caché viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('SW: Activado y tomando control');
      return self.clients.claim();
    })
  );
});

// Fetch - Estrategia: Cache First para archivos locales, Network First para API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Si es una petición al Google Apps Script (API), intentar red primero
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({ status: 'error', message: 'Sin conexión. Las fotos se guardarán en cola.' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }
  
  // Para archivos locales: Cache First (usar caché primero)
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('SW: Sirviendo desde caché:', event.request.url);
          return cachedResponse;
        }
        
        // Si no está en caché, intentar red
        return fetch(event.request)
          .then((response) => {
            // Si es una respuesta válida, cachearla
            if (response && response.status === 200 && response.type === 'basic') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Si falla todo y es navegación, devolver index.html en caché
            if (event.request.mode === 'navigate') {
              return caches.match('/Evidencias-Solara/index.html');
            }
          });
      })
  );
});