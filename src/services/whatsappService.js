const logger = require('../utils/logger');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

/**
 * Normalize a phone number to Meta format (digits only, no +).
 * e.g. "0523385554" → "972523385554"
 *      "+972523385554" → "972523385554"
 *      "whatsapp:+972523385554" → "972523385554"
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let num = raw.replace('whatsapp:', '').replace(/\s|-/g, '');
  if (num.startsWith('+')) num = num.slice(1);
  if (num.startsWith('05')) num = '972' + num.slice(1);
  return num;
}

/**
 * Send a WhatsApp text message via Meta Cloud API.
 * @param {string} to   - phone number (any format)
 * @param {string} body - message text
 */
async function sendMessage(to, body) {
  const phone = normalizePhone(to);
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const res = await fetch(`${GRAPH_URL}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body }
    })
  });

  const data = await res.json();

  if (!res.ok) {
    logger.error('Meta API error', { to: phone, error: data });
    throw new Error(data.error?.message || 'Meta API error');
  }

  logger.info('WhatsApp message sent', { to: phone, messageId: data.messages?.[0]?.id });
  return data;
}

/**
 * Notify the barber about a new appointment.
 * @param {object} appointment
 * @param {boolean} [fromWeb=false]
 */
async function notifyBarber(appointment, fromWeb = false) {
  const source = fromWeb ? ' 🌐' : '';
  const phone = appointment.phone;
  const msg =
    `✂️ *תור חדש במספרת בבאני*${source}\n\n` +
    `👤 שם: ${appointment.customerName}\n` +
    `📅 תאריך: ${appointment.dateDisplay}\n` +
    `🕐 שעה: ${appointment.timeDisplay}\n` +
    `💈 שירות: ${appointment.serviceName}\n` +
    `💰 מחיר: ₪${appointment.servicePrice}\n` +
    `📱 טלפון: ${normalizePhone(phone)}`;

  await sendMessage(process.env.BARBER_PHONE, msg);
}

/**
 * Notify the barber that an appointment was cancelled.
 */
async function notifyBarberCancellation(appointment) {
  const msg =
    `🗑️ *תור בוטל*\n\n` +
    `👤 שם: ${appointment.customerName}\n` +
    `💈 שירות: ${appointment.serviceName}\n` +
    `📅 תאריך: ${appointment.dateDisplay} | 🕐 ${appointment.timeDisplay}\n` +
    `📱 טלפון: ${normalizePhone(appointment.phone)}`;

  await sendMessage(process.env.BARBER_PHONE, msg);
}

module.exports = { sendMessage, notifyBarber, notifyBarberCancellation, normalizePhone };
