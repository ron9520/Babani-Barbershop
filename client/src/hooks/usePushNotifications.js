import { useEffect } from 'react';
import { requestPushPermission, onForegroundMessage } from '../firebase.js';

/**
 * Register push notifications for the ADMIN.
 * Sends FCM token to /api/admin/fcm-token.
 * Call this inside any protected admin page.
 */
export function useAdminPush(adminToken) {
  useEffect(() => {
    if (!adminToken) return;

    (async () => {
      try {
        const token = await requestPushPermission();
        if (!token) return;

        await fetch('/api/admin/fcm-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`
          },
          body: JSON.stringify({ token })
        });

        // Handle foreground notifications (app is open)
        onForegroundMessage(payload => {
          const { title, body } = payload.notification || {};
          if (title && Notification.permission === 'granted') {
            new Notification(title, {
              body: body || '',
              icon: '/icons/admin-icon.svg',
              dir: 'rtl',
              lang: 'he'
            });
          }
        });
      } catch (err) {
        console.warn('[FCM] Admin push setup failed:', err.message);
      }
    })();
  }, [adminToken]);
}

/**
 * Register push notifications for the CUSTOMER.
 * Sends FCM token to /api/customer/fcm-token.
 * Call this inside any protected customer page.
 */
export function useCustomerPush(customerToken) {
  useEffect(() => {
    if (!customerToken) return;

    (async () => {
      try {
        const token = await requestPushPermission();
        if (!token) return;

        await fetch('/api/customer/fcm-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${customerToken}`
          },
          body: JSON.stringify({ token })
        });

        // Handle foreground notifications (app is open)
        onForegroundMessage(payload => {
          const { title, body } = payload.notification || {};
          if (title && Notification.permission === 'granted') {
            new Notification(title, {
              body: body || '',
              icon: '/icons/icon.svg',
              dir: 'rtl',
              lang: 'he'
            });
          }
        });
      } catch (err) {
        console.warn('[FCM] Customer push setup failed:', err.message);
      }
    })();
  }, [customerToken]);
}
