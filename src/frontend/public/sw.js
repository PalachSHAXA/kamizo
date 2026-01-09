// Kamizo PWA Service Worker
// Version: 1.0.0

const CACHE_NAME = 'kamizo-v1';
const STATIC_CACHE = 'kamizo-static-v1';
const DYNAMIC_CACHE = 'kamizo-dynamic-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests (don't cache)
  if (event.request.url.includes('/api/')) return;

  // Skip SSE events
  if (event.request.url.includes('/events')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);

  let notificationData = {
    title: 'Kamizo',
    body: 'Новое уведомление',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'default',
    requireInteraction: false,
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/favicon.ico',
    badge: notificationData.badge || '/favicon.ico',
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    vibrate: [100, 50, 100, 50, 100], // Vibration pattern
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
      // Add stronger vibration for urgent
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
  console.log('[SW] Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  let urlToOpen = data.url || '/';

  // Handle specific actions
  if (action === 'approve' && data.requestId) {
    urlToOpen = `/?action=approve&requestId=${data.requestId}`;
  } else if (action === 'accept' && data.requestId) {
    urlToOpen = `/?action=accept&requestId=${data.requestId}`;
  } else if (action === 'view' && data.requestId) {
    urlToOpen = `/?requestId=${data.requestId}`;
  } else if (action === 'view' && data.announcementId) {
    urlToOpen = `/announcements?id=${data.announcementId}`;
  } else if (action === 'dismiss' && data.announcementId) {
    // Just close notification, mark as read in background
    urlToOpen = null;
  } else if (action === 'reply' && data.channelId) {
    urlToOpen = `/chat?channelId=${data.channelId}`;
  } else if (action === 'vote' && data.meetingId) {
    urlToOpen = `/meetings?meetingId=${data.meetingId}&action=vote`;
  }

  // Only navigate if we have a URL to open
  if (urlToOpen) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          // If app is already open, focus it and navigate
          for (const client of windowClients) {
            if ('focus' in client) {
              client.focus();
              client.navigate(urlToOpen);
              return;
            }
          }
          // Otherwise open new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// Notification close handler
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-requests') {
    event.waitUntil(syncPendingRequests());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

// Sync pending requests when back online
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
        console.error('[SW] Failed to sync request:', e);
      }
    }
  } catch (e) {
    console.error('[SW] Sync failed:', e);
  }
}

// Sync pending chat messages
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
        console.error('[SW] Failed to sync message:', e);
      }
    }
  } catch (e) {
    console.error('[SW] Message sync failed:', e);
  }
}

// IndexedDB helper
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

// Periodic sync for checking updates (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync:', event.tag);

  if (event.tag === 'check-updates') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    // Notify all clients to check for updates
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'CHECK_UPDATES'
      });
    });
  } catch (e) {
    console.error('[SW] Check updates failed:', e);
  }
}

// Message handler for communication with main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: '1.0.0' });
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key));
    });
  }
});

console.log('[SW] Service Worker loaded');
