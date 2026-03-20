const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { DateTime } = require('luxon');
const { webhookHandler } = require('./bot/messageHandler');
const calendarService = require('./services/calendarService');
const firebaseService = require('./services/firebaseService');
const whatsappService = require('./services/whatsappService');
const { generateSlots, getAvailableDates, getWorkingHours, fromISO, formatDate, formatTime, TZ } = require('./utils/timeUtils');
const logger = require('./utils/logger');
const config = require('../config/config.json');

function createServer() {
  const app = express();

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  // Serve booking page
  app.use(express.static(path.join(__dirname, '../public')));

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', shop: 'מספרת בבאני' }));

  // Green-API webhook
  app.post('/webhook', webhookHandler);

  // ─── Admin API ──────────────────────────────────────────────────────────────

  function adminAuth(req, res, next) {
    const pin = req.headers['x-admin-pin'];
    if (!process.env.ADMIN_PIN || pin !== process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // POST /api/admin/login
  app.post('/api/admin/login', (req, res) => {
    const { pin } = req.body;
    if (!process.env.ADMIN_PIN || pin !== process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'קוד שגוי' });
    }
    res.json({ success: true });
  });

  // GET /api/admin/appointments?date=YYYY-MM-DD
  app.get('/api/admin/appointments', adminAuth, async (req, res) => {
    try {
      const { date } = req.query;
      if (!date) return res.status(400).json({ error: 'date required' });

      const start = DateTime.fromISO(date, { zone: TZ }).startOf('day').toISO();
      const end   = DateTime.fromISO(date, { zone: TZ }).endOf('day').toISO();

      const appointments = await firebaseService.getAppointmentsInRange(start, end);
      appointments.sort((a, b) => a.startISO.localeCompare(b.startISO));
      res.json(appointments);
    } catch (err) {
      logger.error('GET /api/admin/appointments error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PATCH /api/admin/appointments/:id/status
  app.patch('/api/admin/appointments/:id/status', adminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!['completed', 'cancelled', 'no_show'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      if (status === 'cancelled') {
        const apt = await firebaseService.getAppointmentById(id);
        if (apt?.calendarEventId) {
          try { await calendarService.deleteAppointment(apt.calendarEventId); } catch (_) {}
        }
      }

      await firebaseService.updateAppointmentStatus(id, status);
      res.json({ success: true });
    } catch (err) {
      logger.error('PATCH /api/admin/appointments status error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Booking API ────────────────────────────────────────────────────────────

  // GET /api/services — list all services
  app.get('/api/services', (req, res) => {
    res.json(config.services);
  });

  // GET /api/slots?date=YYYY-MM-DD — available slots for a date
  app.get('/api/slots', async (req, res) => {
    try {
      const { date } = req.query;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
      }

      const dt = DateTime.fromISO(date, { zone: TZ }).startOf('day');
      if (!dt.isValid) return res.status(400).json({ error: 'Invalid date' });

      const hours = getWorkingHours(dt);
      if (!hours) return res.json({ slots: [], closed: true });

      const allSlots = generateSlots(dt);
      const busyTimes = await calendarService.getBusySlotsForDate(dt);
      const slots = allSlots
        .filter(s => !busyTimes.includes(s.toFormat('HH:mm')))
        .map(s => s.toFormat('HH:mm'));

      res.json({ slots, closed: false });
    } catch (err) {
      logger.error('GET /api/slots error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/book — create a booking
  app.post('/api/book', async (req, res) => {
    try {
      const { serviceId, date, time, customerName, phone } = req.body;

      // Validate inputs
      if (!serviceId || !date || !time || !customerName || !phone) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const service = config.services.find(s => s.id === serviceId);
      if (!service) return res.status(400).json({ error: 'Invalid service' });

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: 'Invalid date or time format' });
      }

      const [hour, minute] = time.split(':').map(Number);
      const start = DateTime.fromISO(date, { zone: TZ }).set({ hour, minute, second: 0, millisecond: 0 });
      const end = start.plus({ minutes: service.durationMinutes });

      if (!start.isValid) return res.status(400).json({ error: 'Invalid date/time' });

      const normalizedPhone = whatsappService.normalizePhone(phone);

      // Create calendar event (includes availability double-check)
      const eventId = await calendarService.createAppointment({
        startISO: start.toISO(),
        endISO: end.toISO(),
        customerName,
        serviceName: service.name,
        phone: normalizedPhone
      });

      if (!eventId) {
        return res.status(409).json({ error: 'slot_taken' });
      }

      const dateDisplay = formatDate(start);
      const timeDisplay = formatTime(start);

      // Save to Firestore
      await firebaseService.saveAppointment({
        phone: normalizedPhone,
        customerName,
        serviceId: service.id,
        serviceName: service.name,
        servicePrice: service.price,
        startISO: start.toISO(),
        endISO: end.toISO(),
        dateDisplay,
        timeDisplay,
        calendarEventId: eventId,
        status: 'confirmed',
        source: 'web'
      });

      // Send WhatsApp to customer
      try {
        const customerMsg =
          `🎉 *התור נקבע בהצלחה!*\n\n` +
          `👤 שם: ${customerName}\n` +
          `💈 שירות: ${service.name}\n` +
          `📅 תאריך: ${dateDisplay}\n` +
          `🕐 שעה: ${timeDisplay}\n` +
          `💰 מחיר: ₪${service.price}\n\n` +
          `📍 ${config.shop.name}\n` +
          `_ביום שלפני התור תקבל תזכורת_\n\n` +
          `כדי לבטל את התור שלח *ביטול* להודעה זו`;
        await whatsappService.sendMessage(normalizedPhone, customerMsg);
      } catch (err) {
        logger.error('Failed to send customer confirmation', { error: err.message });
      }

      // Send WhatsApp to barber
      try {
        await whatsappService.notifyBarber({
          customerName,
          serviceName: service.name,
          servicePrice: service.price,
          dateDisplay,
          timeDisplay,
          phone: normalizedPhone
        }, true);
      } catch (err) {
        logger.error('Failed to notify barber', { error: err.message });
      }

      res.json({ success: true, dateDisplay, timeDisplay, serviceName: service.name });
    } catch (err) {
      logger.error('POST /api/book error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/admin/reset — delete all test data (Firestore + Calendar)
  app.post('/api/admin/reset', async (req, res) => {
    const key = req.query.key || req.body?.key;
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const [appointments, events] = await Promise.all([
        firebaseService.clearAllData(),
        calendarService.deleteAllUpcomingEvents()
      ]);
      logger.info('Admin reset performed', { appointments, events });
      res.json({ success: true, appointments, events });
    } catch (err) {
      logger.error('Admin reset failed', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled express error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createServer };
