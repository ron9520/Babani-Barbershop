// Firebase Messaging Service Worker
// Handles background push notifications for both admin and customer PWA

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config injected via query string when the SW is registered
const params = new URL(location.href).searchParams;

firebase.initializeApp({
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId')
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  const icon = data.type === 'admin'
    ? '/icons/admin-icon.svg'
    : '/icons/icon.svg';

  const link = data.link || (data.type === 'admin' ? '/admin/day' : '/my-appointments');

  self.registration.showNotification(title || 'מספרת בבאני 💈', {
    body:    body || '',
    icon,
    badge:   '/icons/icon.svg',
    dir:     'rtl',
    lang:    'he',
    requireInteraction: false,
    data:    { link }
  });
});

// Clicking notification opens the right page
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = e.notification.data?.link || '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Look for an existing open tab
      const existing = list.find(c => c.url.includes(link));
      if (existing) return existing.focus();
      return clients.openWindow(link);
    })
  );
});
