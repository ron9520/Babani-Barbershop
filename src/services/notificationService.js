const admin = require('firebase-admin');
const firebaseService = require('./firebaseService');
const logger = require('../utils/logger');

/**
 * Send a push notification to the admin (barber).
 * Silently skips if no FCM token is registered.
 */
async function sendToAdmin(title, body, data = {}) {
  try {
    const cfg = await firebaseService.getAdminConfig();
    const token = cfg?.fcmToken;
    if (!token) return; // not yet registered — silently skip

    // FCM data values must all be strings
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = String(v);
    }

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: stringData,
      webpush: {
        notification: {
          icon: '/icons/icon.svg',
          requireInteraction: true,
          dir: 'rtl',
          lang: 'he'
        },
        fcm_options: { link: '/admin.html' }
      }
    });

    logger.info('Push notification sent to admin', { title });
  } catch (err) {
    // Token may be expired — log but don't crash
    logger.warn('Push notification failed', { error: err.message });
  }
}

module.exports = { sendToAdmin };
