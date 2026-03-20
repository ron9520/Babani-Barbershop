const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { DateTime } = require('luxon');
const { webhookHandler } = require('./bot/messageHandler');
const calendarService = require('./services/calendarService');
const firebaseService = require('./services/firebaseService');
const whatsappService = require('./services/whatsappService');
const authService = require('./services/authService');
const { generateSlots, getAvailableDates, getEffectiveWorkingHours, getWorkingHours, fromISO, formatDate, formatTime, TZ } = require('./utils/timeUtils');
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
    // Support both JWT (Bearer) and legacy PIN header
    const auth = req.headers['authorization'];
    const pin  = req.headers['x-admin-pin'];

    if (auth && auth.startsWith('Bearer ')) {
      try {
        const payload = authService.verifyToken(auth.slice(7));
        if (payload.role !== 'admin') return res.status(401).json({ error: 'Unauthorized' });
        return next();
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Legacy PIN fallback (for admin.html v1)
    if (pin && authService.verifyAdminPin(pin)) return next();

    return res.status(401).json({ error: 'Unauthorized' });
  }

  function customerAuth(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const payload = authService.verifyToken(auth.slice(7));
      if (payload.role !== 'customer') return res.status(401).json({ error: 'Unauthorized' });
      req.customerPhone = payload.phone;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  // POST /api/admin/login — returns JWT
  app.post('/api/admin/login', (req, res) => {
    const { pin } = req.body;
    if (!authService.verifyAdminPin(pin)) {
      return res.status(401).json({ error: 'קוד שגוי' });
    }
    const token = authService.signAdminToken();
    res.json({ success: true, token });
  });

  // POST /api/customer/send-otp
  app.post('/api/customer/send-otp', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone required' });

      const normalizedPhone = whatsappService.normalizePhone(phone);
      if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone' });

      const otp = await authService.createOTP(normalizedPhone);

      try {
        await whatsappService.sendMessage(normalizedPhone,
          `✂️ *מספרת בבאני — קוד אימות*\n\nקוד הכניסה שלך: *${otp}*\n\nתוקף: 5 דקות\n_אם לא ביקשת קוד, התעלם מהודעה זו_`
        );
      } catch (e) {
        logger.warn('Failed to send OTP via WhatsApp', { phone: normalizedPhone, error: e.message });
      }

      res.json({ success: true, expiresIn: 300 });
    } catch (err) {
      if (err.message.startsWith('LOCKED:')) {
        const mins = err.message.split(':')[1];
        return res.status(429).json({ error: `נעול. נסה שוב בעוד ${mins} דקות` });
      }
      logger.error('send-otp error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/customer/verify-otp
  app.post('/api/customer/verify-otp', async (req, res) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

      const normalizedPhone = whatsappService.normalizePhone(phone);
      const ok = await authService.verifyOTP(normalizedPhone, otp);

      if (!ok) return res.status(401).json({ error: 'קוד שגוי' });

      // Get customer name from last appointment
      const apt = await firebaseService.getAppointmentByPhone(normalizedPhone);
      const name = apt?.customerName || null;

      const token = authService.signCustomerToken(normalizedPhone);
      res.json({ success: true, token, name });
    } catch (err) {
      if (err.message.startsWith('LOCKED:')) {
        const mins = err.message.split(':')[1];
        return res.status(429).json({ error: `נעול. נסה שוב בעוד ${mins} דקות` });
      }
      if (err.message === 'EXPIRED') return res.status(401).json({ error: 'הקוד פג תוקף, שלח שוב' });
      if (err.message === 'NOT_FOUND') return res.status(401).json({ error: 'לא נמצא קוד. שלח קוד חדש' });
      logger.error('verify-otp error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
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

  // ─── Schedule API ───────────────────────────────────────────────────────────

  // GET /api/admin/schedule — default hours + upcoming overrides
  app.get('/api/admin/schedule', adminAuth, async (req, res) => {
    try {
      const [adminConfig, overrides] = await Promise.all([
        firebaseService.getAdminConfig(),
        firebaseService.getUpcomingOverrides()
      ]);
      const defaultHours = adminConfig?.workingHours || config.workingHours;
      res.json({ defaultHours, overrides });
    } catch (err) {
      logger.error('GET /api/admin/schedule error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PUT /api/admin/schedule/default — update permanent hours for a day
  app.put('/api/admin/schedule/default', adminAuth, async (req, res) => {
    try {
      const { day, open, close } = req.body;
      const validDays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      if (!validDays.includes(day)) return res.status(400).json({ error: 'Invalid day' });
      await firebaseService.updateDefaultHours(day, open, close);
      res.json({ success: true });
    } catch (err) {
      logger.error('PUT /api/admin/schedule/default error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/admin/schedule/override — one-time override for a specific date
  app.post('/api/admin/schedule/override', adminAuth, async (req, res) => {
    try {
      const { date, open, close, closed, reason } = req.body;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
      }
      await firebaseService.setScheduleOverride({ date, open, close, closed, reason });
      res.json({ success: true });
    } catch (err) {
      logger.error('POST /api/admin/schedule/override error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/admin/schedule/override/:date
  app.delete('/api/admin/schedule/override/:date', adminAuth, async (req, res) => {
    try {
      await firebaseService.deleteScheduleOverride(req.params.date);
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/admin/schedule/override error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Booking API ────────────────────────────────────────────────────────────

  // GET /api/services — list all services (Firestore, fallback to config)
  app.get('/api/services', async (req, res) => {
    try {
      const services = await firebaseService.getServices();
      res.json(services.length ? services : config.services);
    } catch (err) {
      res.json(config.services);
    }
  });

  // GET /api/admin/services
  app.get('/api/admin/services', adminAuth, async (req, res) => {
    try {
      const services = await firebaseService.getServices();
      res.json(services);
    } catch (err) {
      logger.error('GET /api/admin/services error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/admin/services
  app.post('/api/admin/services', adminAuth, async (req, res) => {
    try {
      const { name, price, durationMinutes, order } = req.body;
      if (!name || !price || !durationMinutes) {
        return res.status(400).json({ error: 'name, price, durationMinutes required' });
      }
      const id = await firebaseService.createService({ name, price, durationMinutes, order: order || 99 });
      res.json({ success: true, id });
    } catch (err) {
      logger.error('POST /api/admin/services error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PUT /api/admin/services/:id
  app.put('/api/admin/services/:id', adminAuth, async (req, res) => {
    try {
      await firebaseService.updateService(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) {
      logger.error('PUT /api/admin/services error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/admin/services/:id
  app.delete('/api/admin/services/:id', adminAuth, async (req, res) => {
    try {
      await firebaseService.deleteService(req.params.id);
      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/admin/services error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
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

      const hours = await getEffectiveWorkingHours(dt, firebaseService);
      if (!hours) return res.json({ slots: [], closed: true });

      const allSlots = generateSlots(dt, hours);
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

      let service = await firebaseService.getServiceById(serviceId);
      if (!service) service = config.services.find(s => s.id === serviceId);
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
