// Kamizo PWA Service Worker
// Version: 3.7.12 — cache suffix bumped to v66 to evict every v65 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident "Оплата" page (09-oplata) full Claude Design port at
//     /finance/charges (resident roles only — staff keep the existing
//     filter page). Sticky header (Кв./ЖК + Оплата), dark balance card
//     with state-aware gradient (clear/due/overdue), charges accordion
//     wired to real financeApi.getCharges, inline payments history
//     via financeApi.getPayments (both auto-filtered by user.id on the
//     server). Empty state, skeleton, error fallback.
//   • LOCKED actions (no backend yet; tap shows info toast — no fake
//     success): "Оплатить {N} сум" (no online gateway) and "Акт сверки"
//     (server returns JSON only, no PDF renderer).
//   • Sections omitted because no resident endpoint exists yet: per-
//     charge sub-item breakdown and "Куда идут средства дома" expense
//     pie.
//   • Layout: /finance/charges added to isResidentFullBleed only for
//     resident-family roles so the page paints its own 16-px sides and
//     hides the global MobileHeader. Staff still see the original
//     chrome.
//
// Previous notes (v65) preserved below:
// Version: 3.7.11 — cache suffix bumped to v65 to evict every v64 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Sidebar: drop the hardcoded "ТСЖ «...»" prefix; use the real УК
//     name from /api/tenant/config; render the УК logo (when present)
//     as the avatar chip; resolve the resident's ЖК name + address
//     from useBuildingStore (lazy-loaded fetchBuildingById) instead of
//     the bare user.building number.
//   • Profile: new "Управляющая компания" card under the action tiles
//     showing real УК logo + name, with a "Жилой комплекс" sub-row
//     bound to the real building name + address. Tap navigates to
//     /contract.
//   • No new endpoints; existing tenantStore + buildingStore reads only.
//     Backend gaps documented in commit message (legal-form prefix,
//     УК physical address, resident-readable УК rating).
//
// Previous notes (v64) preserved below:
// Version: 3.7.10 — cache suffix bumped to v64 to evict every v63 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident /contract page (14-dogovor) full Claude Design port:
//     sticky in-page header (back + "Договор"), dark amber-stone hero
//     with Действует/На подписании badge + Номер/Дата stats, "Условия"
//     accordion (4 condensed RU/UZ sections), two-column "Реквизиты
//     сторон" (UK + Собственник cards). Sticky bottom action bar:
//     "Скачать договор" wires to existing generateContractDocx; the
//     "Подписать" CTA is shipped visually but locked (no self-serve
//     signing endpoint yet — tap shows an info toast).
//   • Layout: /contract added to isResidentFullBleed (page paints its
//     own 16-px sides, global MobileHeader hidden on this route).
//
// Previous notes (v63) preserved below:
// Version: 3.7.9 — cache suffix bumped to v63 to evict every v62 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident request-details bottom sheet (02d-detali-zayavki) full
//     Claude Design port: dim backdrop + 2-px blur, warm-beige sheet,
//     orange-gradient status card (56-px category chip + #UK-S-{N} +
//     centred status title + 4-step icon progress with brand-orange
//     halo + connector fill + submitted timestamp), contextual action
//     button (Принять работу / Отменить заявку). Details card with
//     description Ещё/Свернуть toggle, priority pill, scrollable photo
//     thumbs (open in new tab), rating + feedback for completed,
//     executor row with tel: phone button. Active-reschedule banner +
//     amber "Перенести на другое время" button preserved.
//   • Modal-presence: BottomBar hides while sheet is open (existing
//     useModalPresence kept).
//   • Wiring unchanged: onApprove / onCancel / onReschedule still emit
//     to the parent which opens existing ApproveModal /
//     CancelRequestModal / RescheduleModal.
//
// Previous notes (v62) preserved below:
// Version: 3.7.8 — cache suffix bumped to v62 to evict every v61 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident "Собрания" list (05-sobraniya) full Claude Design port:
//     sticky in-page header (Собрания собственников eyebrow +
//     Голосование title), legal-weight note (m² → ≥X% quorum), meeting
//     cards with status pill (Идёт / Опрос даты / Предстоит /
//     Завершено), QuorumBar with 50% threshold marker for active
//     meetings and 3-cell За/Против/Возд. result grid for closed
//     family, CTA footer with solid brand pill for voting_open
//     ("Голосовать"/"Изменить голос") and text-link for others
//     ("Протокол"/"Подробнее"). Empty state restyled.
//   • Reconsideration banner + new-request popup + 30 s polling
//     preserved (audio notification kept).
//   • Layout: /meetings added to isResidentFullBleed (page paints its
//     own 16-px sides, global MobileHeader hidden on this route).
//   • Card tap opens the existing MeetingVotingModal (§03) — unchanged.
//
// Previous notes (v61) preserved below:
// Version: 3.7.7 — cache suffix bumped to v61 to evict every v60 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident per-meeting voting flow (03-golosovanie) full Claude
//     Design port: sticky topbar, dark amber-stone hero with
//     Кворум/Осталось/Бюджет stats + quorum bar, agenda cards with
//     live За/Против/Воздерж buttons + result bar, objection +
//     counter-proposal reveal on Against (≥ 20 chars), optional
//     comment on For/Abstain, sticky bottom summary card with
//     "Подписать и отправить все голоса", post-vote ballot receipt,
//     and "Как считают голоса" bottom sheet. OTP card from the
//     prototype is intentionally NOT shipped — chat1 retracted it;
//     verification stays on the existing QRSignatureModal.
//   • Modal-presence: voting overlay now registers with
//     useModalPresence(true) so the global BottomBar hides while it's
//     open and is restored on close.
//
// Previous notes (v60) preserved below:
// Version: 3.7.6 — cache suffix bumped to v60 to evict every v59 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • Resident "Объявления" (06-obyavleniya) full Claude Design port:
//     sticky in-page header (building eyebrow + Объявления title +
//     ink/surface filter chips), feed of cards with brand-tint unread
//     bg + 8px brand-orange dot, urgent variant (4px red stripe + cover
//     + Важно badge), priority-mapped category pill, line-clamp
//     preview that expands in-card with attachments + Читать/Свернуть
//     chevron toggle. Wiring kept (fetchAnnouncements,
//     getAnnouncementsForResidents, markAnnouncementAsViewed).
//   • Layout: /announcements added to isResidentFullBleed (page paints
//     its own 16-px sides, global MobileHeader hidden on this route).
//
// Previous notes (v59) preserved below:
// Version: 3.7.5 — cache suffix bumped to v59 to evict every v58 (and
// older) cache on the next SW lifecycle update. This release ships:
//   • BottomBar active-tab fix: on secondary resident pages opened
//     from the sidebar (/useful-contacts, /rate-employees, /meetings,
//     /announcements, /guest-access, /vehicles, /contract, /finance/*,
//     /marketplace, …) the "Главная" tab now lights up via a fallback
//     in BottomBar.isActive. Strict matches still win first
//     (Заявки/Чат/Профиль keep their own active state on their owned
//     routes, including sub-routes via prefix match), so two tabs are
//     never active at once.
//
// Caching strategy unchanged:
//   • HTML / navigation requests   → network-first, cache on success
//     for offline fallback.
//   • /assets/<hash>.(js|css|woff) → cache-first, MIME-validated on
//     read AND write.
//   • images / fonts / icons       → stale-while-revalidate.
//   • /api/*  /events*  /ws*       → passthrough, never cached.
//   • activate                     → delete every cache not in the
//     current valid-list, then clients.claim().
// Combined with skipWaiting() on install + clients.claim() + the
// controllerchange auto-reload + chunk-load guard (v55) in index.html,
// every device transitions seamlessly to the new version.

const SW_VERSION = '3.7.12';
const STATIC_CACHE = 'kamizo-static-v66';
const ASSET_CACHE = 'kamizo-assets-v66';
const DYNAMIC_CACHE = 'kamizo-dynamic-v66';
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
  // These are immutable — once cached, always serve from cache.
  //
  // Hard rule: never trust a cached response whose Content-Type doesn't
  // match the URL extension. A prior broken deploy could have cached
  // text/html under a .js / .css URL (the worker's old SPA fallback did
  // exactly this). Such a cached entry permanently breaks the page —
  // browsers refuse to apply text/html as CSS or execute it as a module.
  // Detect on read, evict, and refetch from the network. Same gate on
  // write so we never poison the cache in the first place.
  if (url.pathname.startsWith('/assets/') && /\-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname)) {
    const expectsJs = /\.js$/.test(url.pathname);
    const expectsCss = /\.css$/.test(url.pathname);
    const expectsWoff = /\.woff2?$/.test(url.pathname);
    const mimeOk = (ct) => {
      const c = (ct || '').toLowerCase();
      if (c.includes('text/html')) return false;
      if (expectsJs)  return c.includes('javascript') || c.includes('ecmascript');
      if (expectsCss) return c.includes('css');
      if (expectsWoff) return c.includes('font') || c.includes('woff');
      return true;
    };

    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached && mimeOk(cached.headers.get('Content-Type'))) {
        return cached;
      }
      if (cached) {
        // Poisoned entry — drop it and fall through to network.
        await cache.delete(request);
      }
      try {
        const response = await fetch(request);
        if (response.ok && mimeOk(response.headers.get('Content-Type'))) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Network failed and we have no usable cache — let the page see
        // the failure rather than handing back a stale/wrong response.
        return new Response('Asset fetch failed', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        });
      }
    })());
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
