const admin = require('firebase-admin');
const firebaseService = require('./firebaseService');
const logger = require('../utils/logger');

/**
 * Send a push notification to a single FCM token.
 * @param {string} token - FCM device token
 * @param {string} title
 * @param {string} body
 * @param {object} data  - extra string key-value pairs
 * @param {string} link  - URL to open on click
 * @param {string} type  - 'admin' | 'customer' (controls icon)
 */
async function sendToToken(token, title, body, data = {}, link = '/', type = 'customer') {
  if (!token) return;

  const stringData = { type };
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = String(v);
  }
  stringData.link = link;

  const icon = type === 'admin' ? '/icons/admin-icon.svg' : '/icons/icon.svg';

  await admin.messaging().send({
    token,
    notification: { title, body },
    data: stringData,
    webpush: {
      notification: { icon, dir: 'rtl', lang: 'he', requireInteraction: false },
      fcm_options: { link }
    }
  });
}

/**
 * Send a push notification to the admin (barber).
 */
async function sendToAdmin(title, body, data = {}) {
  try {
    const cfg = await firebaseService.getAdminConfig();
    const token = cfg?.fcmToken;
    if (!token) return;
    await sendToToken(token, title, body, data, '/admin/day', 'admin');
    logger.info('Push sent to admin', { title });
  } catch (err) {
    logger.warn('Admin push failed', { error: err.message });
  }
}

/**
 * Send a push notification to a customer by phone number.
 * Silently skips if they haven't registered a push token.
 */
async function sendToCustomer(phone, title, body, data = {}) {
  try {
    const profile = await firebaseService.getCustomerProfile(phone);
    const token = profile?.fcmToken;
    if (!token) return;
    await sendToToken(token, title, body, data, '/my-appointments', 'customer');
    logger.info('Push sent to customer', { phone, title });
  } catch (err) {
    logger.warn('Customer push failed', { phone, error: err.message });
  }
}

/**
 * Notify customer their booking is confirmed.
 */
async function notifyCustomerBookingConfirmed(phone, { dateDisplay, timeDisplay, serviceName }) {
  await sendToCustomer(
    phone,
    'התור שלך אושר! 💈',
    `${serviceName} — ${dateDisplay} בשעה ${timeDisplay}`
  );
}

/**
 * Notify customer of an appointment reminder (24h before).
 */
async function notifyCustomerReminder(phone, { dateDisplay, timeDisplay, serviceName }) {
  await sendToCustomer(
    phone,
    'תזכורת לתור מחר ✂️',
    `${serviceName} — ${dateDisplay} בשעה ${timeDisplay}`
  );
}

/**
 * Notify customer their appointment was cancelled by the barber.
 */
async function notifyCustomerCancelled(phone, { dateDisplay, timeDisplay }) {
  await sendToCustomer(
    phone,
    'התור בוטל 😔',
    `התור ב-${dateDisplay} בשעה ${timeDisplay} בוטל על ידי המספרה.`
  );
}

/**
 * Notify admin a new appointment was booked.
 */
async function notifyAdminNewBooking({ customerName, serviceName, dateDisplay, timeDisplay }) {
  await sendToAdmin(
    `הזמנה חדשה מ-${customerName} 📅`,
    `${serviceName} — ${dateDisplay} בשעה ${timeDisplay}`
  );
}

/**
 * Notify admin an appointment was cancelled by the customer.
 */
async function notifyAdminCancellation({ customerName, serviceName, dateDisplay, timeDisplay }) {
  await sendToAdmin(
    `ביטול תור של ${customerName} ❌`,
    `${serviceName} — ${dateDisplay} בשעה ${timeDisplay}`
  );
}

/**
 * Send a broadcast push to a list of customer FCM tokens.
 */
async function sendBroadcast(tokens, title, body) {
  if (!tokens || tokens.length === 0) return;
  try {
    const messages = tokens.map(token => ({
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: '/icons/icon.svg', dir: 'rtl', lang: 'he' },
        fcm_options: { link: '/' }
      }
    }));
    const response = await admin.messaging().sendEach(messages);
    logger.info('Broadcast sent', {
      total: tokens.length,
      success: response.successCount,
      failed: response.failureCount
    });
  } catch (err) {
    logger.warn('Broadcast push failed', { error: err.message });
  }
}

module.exports = {
  sendToAdmin,
  sendToCustomer,
  notifyCustomerBookingConfirmed,
  notifyCustomerReminder,
  notifyCustomerCancelled,
  notifyAdminNewBooking,
  notifyAdminCancellation,
  sendBroadcast
};
