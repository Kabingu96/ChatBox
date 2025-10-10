// Service Worker for ChatBox push notifications
const CACHE_NAME = 'chatbox-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'chatbox-message',
    requireInteraction: data.requireInteraction || false,
    vibrate: data.vibrate || [100],
    actions: [
      {
        action: 'open',
        title: 'Open ChatBox'
      },
      {
        action: 'close',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        // Check if ChatBox is already open
        for (const client of clients) {
          if (client.url.includes('chatbox') && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if not found
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
    );
  }
});

// Background sync for offline messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Placeholder for offline message sync
  console.log('Syncing messages...');
}