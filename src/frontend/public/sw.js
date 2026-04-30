// Kamizo PWA Service Worker
// Version: 2.3.0 — cache suffix bumped to v5 so the activate handler
// deletes every v4 cache on the next SW lifecycle update. This forces
// every tenant's PWA users to re-fetch HTML + assets after a backend
// deploy instead of serving stale UI from the old SW cache. Bump this
// suffix any time a release needs to propagate urgently to existing
// installs.

const SW_VERSION = '2.3.0';
const STATIC_CACHE = 'kamizo-static-v5';
const ASSET_CACHE = 'kamizo-assets-v5';
const DYNAMIC_CACHE = 'kamizo-dynamic-v5';
const MAX_DYNAMIC_CACHE_SIZE = 50;

// Static shell to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// Install event - cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches, claim clients
self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, ASSET_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !validCaches.includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients about the update
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
          });
        });
      })
  );
});

// Trim cache to max size
async function trimCache(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    // Delete oldest entries (FIFO)
    const toDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// Fetch event - smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip API requests, WebSocket, SSE
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/events') || url.pathname.includes('/ws')) return;

  // Strategy 1: Cache-first for hashed assets (JS, CSS with hash in filename)
  // These are immutable - once cached, always serve from cache
  if (url.pathname.startsWith('/assets/') && /\-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Strategy 2: Stale-while-revalidate for images, fonts, icons
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, clone);
              trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_CACHE_SIZE);
            });
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Strategy 3: Network-first for HTML (app shell) and everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && (url.pathname === '/' || url.pathname.endsWith('.html'))) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, show offline page (better UX than blank screen)
          if (request.mode === 'navigate') {
            return caches.match('/offline.html') || caches.match('/index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Kamizo',
    body: 'Новое уведомление',
    icon: '/icons/favicon-192x192.png',
    badge: '/icons/favicon-192x192.png',
    tag: 'default',
    requireInteraction: false,
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/icons/favicon-192x192.png',
    badge: notificationData.badge || '/icons/favicon-192x192.png',
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    vibrate: [100, 50, 100, 50, 100],
    data: notificationData.data,
    actions: notificationData.actions || []
  };

  // Add default actions based on notification type
  if (notificationData.type === 'request_completed') {
    options.actions = [
      { action: 'approve', title: '✅ Подтвердить' },
      { action: 'view', title: '👁 Посмотреть' }
    ];
    options.requireInteraction = true;
  } else if (notificationData.type === 'request_assigned') {
    options.actions = [
      { action: 'accept', title: '✅ Принять' },
      { action: 'view', title: '👁 Детали' }
    ];
    options.requireInteraction = true;
  } else if (notificationData.type === 'announcement') {
    const isUrgent = notificationData.priority === 'urgent' || notificationData.data?.priority === 'urgent';
    options.actions = [
      { action: 'view', title: '📖 Читать' },
      { action: 'dismiss', title: '✓ Прочитано' }
    ];
    if (isUrgent) {
      options.requireInteraction = true;
      options.vibrate = [200, 100, 200, 100, 200];
    }
  } else if (notificationData.type === 'chat_message') {
    options.actions = [
      { action: 'reply', title: '💬 Ответить' }
    ];
  } else if (notificationData.type === 'meeting') {
    options.actions = [
      { action: 'vote', title: '🗳 Голосовать' },
      { action: 'view', title: '📋 Подробнее' }
    ];
    options.requireInteraction = true;
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  let urlToOpen = data.url || '/';

  if (action === 'approve' && data.requestId) {
    urlToOpen = `/?action=approve&requestId=${data.requestId}`;
  } else if (action === 'accept' && data.requestId) {
    urlToOpen = `/?action=accept&requestId=${data.requestId}`;
  } else if (action === 'view' && data.requestId) {
    urlToOpen = `/?requestId=${data.requestId}`;
  } else if (action === 'view' && data.announcementId) {
    urlToOpen = `/announcements?id=${data.announcementId}`;
  } else if (action === 'dismiss') {
    urlToOpen = null;
  } else if (action === 'reply' && data.channelId) {
    urlToOpen = `/chat?channelId=${data.channelId}`;
  } else if (action === 'vote' && data.meetingId) {
    urlToOpen = `/meetings?meetingId=${data.meetingId}&action=vote`;
  }

  if (urlToOpen) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          for (const client of windowClients) {
            if ('focus' in client) {
              client.focus();
              client.navigate(urlToOpen);
              return;
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-requests') {
    event.waitUntil(syncPendingRequests());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingRequests() {
  try {
    const db = await openIndexedDB();
    const pendingRequests = await db.getAll('pending_requests');
    for (const request of pendingRequests) {
      try {
        await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body
        });
        await db.delete('pending_requests', request.id);
      } catch (e) {
        // Will retry on next sync
      }
    }
  } catch (e) {
    // DB not available
  }
}

async function syncPendingMessages() {
  try {
    const db = await openIndexedDB();
    const pendingMessages = await db.getAll('pending_messages');
    for (const message of pendingMessages) {
      try {
        await fetch('/api/chat/channels/' + message.channelId + '/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${message.token}`
          },
          body: JSON.stringify({ content: message.content })
        });
        await db.delete('pending_messages', message.id);
      } catch (e) {
        // Will retry on next sync
      }
    }
  } catch (e) {
    // DB not available
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kamizo-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        getAll: (store) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        }),
        delete: (store, id) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          const req = tx.objectStore(store).delete(id);
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
        })
      });
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_requests')) {
        db.createObjectStore('pending_requests', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_messages')) {
        db.createObjectStore('pending_messages', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Message handler
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
});
