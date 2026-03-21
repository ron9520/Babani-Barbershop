import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

let app = null;
let messaging = null;

async function getFirebaseConfig() {
  const res = await fetch('/api/firebase-config');
  if (!res.ok) throw new Error('Failed to fetch Firebase config');
  return res.json();
}

export async function initFirebase() {
  if (app) return { app, messaging };
  const config = await getFirebaseConfig();
  app = initializeApp(config);
  if ('serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
  return { app, messaging };
}

/**
 * Request push notification permission and return FCM token.
 * Returns null if permission denied or browser doesn't support it.
 */
export async function requestPushPermission() {
  try {
    if (!('Notification' in window)) return null;
    if (!('serviceWorker' in navigator)) return null;

    const { messaging: msg } = await initFirebase();
    if (!msg) return null;

    const config = await getFirebaseConfig();

    // Register service worker with Firebase config params
    const swUrl = new URL('/firebase-messaging-sw.js', location.origin);
    swUrl.searchParams.set('apiKey',            config.apiKey);
    swUrl.searchParams.set('authDomain',        config.authDomain);
    swUrl.searchParams.set('projectId',         config.projectId);
    swUrl.searchParams.set('storageBucket',     config.storageBucket || '');
    swUrl.searchParams.set('messagingSenderId', config.messagingSenderId);
    swUrl.searchParams.set('appId',             config.appId);

    const registration = await navigator.serviceWorker.register(swUrl.toString());

    const token = await getToken(msg, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration
    });

    return token || null;
  } catch (err) {
    console.warn('[FCM] Could not get push token:', err.message);
    return null;
  }
}

/**
 * Listen for foreground (in-app) push messages.
 * Call this once after the app mounts.
 */
export async function onForegroundMessage(callback) {
  try {
    const { messaging: msg } = await initFirebase();
    if (!msg) return;
    onMessage(msg, callback);
  } catch (err) {
    console.warn('[FCM] onForegroundMessage error:', err.message);
  }
}
