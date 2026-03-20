// Firebase Messaging Service Worker
// Required by FCM for background push notifications on the admin PWA

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config is injected at runtime via the /firebase-config endpoint
// We read it from the SW's query string (set when registering)
const params = new URL(location.href).searchParams;

firebase.initializeApp({
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId')
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'מספרת בבאני', {
    body:    body || '',
    icon:    '/icons/icon.svg',
    badge:   '/icons/icon.svg',
    dir:     'rtl',
    lang:    'he',
    requireInteraction: true,
    data:    payload.data || {}
  });
});

// Clicking notification opens admin panel
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const adminClient = list.find(c => c.url.includes('/admin.html'));
      if (adminClient) return adminClient.focus();
      return clients.openWindow('/admin.html');
    })
  );
});
