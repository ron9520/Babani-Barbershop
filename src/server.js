const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const { DateTime } = require('luxon');
const calendarService = require('./services/calendarService');
const firebaseService = require('./services/firebaseService');
const authService = require('./services/authService');
const statsService = require('./services/statsService');
const notificationService = require('./services/notificationService');
const { generateSlots, getAvailableDates, getEffectiveWorkingHours, getWorkingHours, fromISO, formatDate, formatTime, nowInIsrael, TZ } = require('./utils/timeUtils');
const logger = require('./utils/logger');
const config = require('../config/config.json');

// Phone normalizer — extracted from whatsappService (WhatsApp removed 20/03/2026)
function normalizePhone(raw) {
  if (!raw) return null;
  let num = raw.replace('whatsapp:', '').replace('@c.us', '').replace(/\s|-/g, '');
  if (num.startsWith('+')) num = num.slice(1);
  if (num.startsWith('05')) num = '972' + num.slice(1);
  return num;
}

function createServer() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_URL || true, credentials: true }));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  // Legacy URL redirects — must be before static middleware
  app.get('/booking.html', (req, res) => res.redirect(301, '/'));
  app.get('/admin.html',   (req, res) => res.redirect(301, '/admin/day'));

  // Static files (icons, firebase-messaging-sw.js, etc.)
  app.use(express.static(path.join(__dirname, '../public')));

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', shop: 'מספרת בבאני' }));

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

  // GET /api/firebase-config — public Firebase Web config (safe to expose)
  app.get('/api/firebase-config', (req, res) => {
    res.json({
      apiKey:            process.env.FIREBASE_WEB_API_KEY     || '',
      authDomain:        `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId:         process.env.FIREBASE_PROJECT_ID      || '',
      storageBucket:     `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId:             process.env.FIREBASE_WEB_APP_ID      || '',
      vapidKey:          process.env.FIREBASE_VAPID_KEY       || ''
    });
  });

  // POST /api/admin/fcm-token — save FCM push token for admin device
  app.post('/api/admin/fcm-token', adminAuth, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      await firebaseService.saveAdminFCMToken(token);
      res.json({ success: true });
    } catch (err) {
      logger.error('POST /api/admin/fcm-token error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/customer/fcm-token — save push token for customer device
  app.post('/api/customer/fcm-token', customerAuth, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      await firebaseService.saveCustomerFCMToken(req.customerPhone, token);
      res.json({ success: true });
    } catch (err) {
      logger.error('POST /api/customer/fcm-token error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/customer/phone-login — temporary phone-only login (upgrade to OTP when SMS is ready)
  app.post('/api/customer/phone-login', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone' });
      const blocked = await firebaseService.isCustomerBlocked(normalizedPhone);
      if (blocked) return res.status(403).json({ error: 'מספר זה חסום' });
      const token = authService.signCustomerToken(normalizedPhone);
      res.json({ token, phone: normalizedPhone });
    } catch (err) {
      logger.error('POST /api/customer/phone-login error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/customer/send-otp
  app.post('/api/customer/send-otp', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone required' });

      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) return res.status(400).json({ error: 'Invalid phone' });

      const otp = await authService.createOTP(normalizedPhone);

      // TODO: deliver OTP via FCM / SMS (WhatsApp removed 20/03/2026)
      logger.info('OTP created — delivery pending FCM/SMS implementation', { phone: normalizedPhone });

      res.json({ success: true, expiresIn: 300 });
    } catch (err) {
      if (err.message.startsWith('LOCKED:')) {
        const mins = (err.message.split(':')[1] || '10').trim();
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

      const normalizedPhone = normalizePhone(phone);
      const ok = await authService.verifyOTP(normalizedPhone, otp);

      if (!ok) return res.status(401).json({ error: 'קוד שגוי' });

      // Get customer name from last appointment
      const apt = await firebaseService.getAppointmentByPhone(normalizedPhone);
      const name = apt?.customerName || null;

      const token = authService.signCustomerToken(normalizedPhone);
      res.json({ success: true, token, name });
    } catch (err) {
      if (err.message.startsWith('LOCKED:')) {
        const mins = (err.message.split(':')[1] || '10').trim();
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

      const appointments = await firebaseService.getAppointmentsInRangeAll(start, end);
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

      const apt = await firebaseService.getAppointmentById(id);
      if (!apt) return res.status(404).json({ error: 'Appointment not found' });

      if (status === 'cancelled') {
        if (apt.calendarEventId) {
          try { await calendarService.deleteAppointment(apt.calendarEventId); } catch (_) {}
        }
      }

      await firebaseService.updateAppointmentStatus(id, status);

      // Auto-block customer after 3 no-shows
      if (status === 'no_show') {
        const noShowCount = await firebaseService.getNoShowCount(apt.phone);
        if (noShowCount >= 3) {
          await firebaseService.blockCustomer(apt.phone, 'חסום אוטומטית — 3 אי-הגעות');
          logger.info('Customer auto-blocked after 3 no-shows', { phone: apt.phone });
        }
      }

      res.json({ success: true });
    } catch (err) {
      logger.error('PATCH /api/admin/appointments status error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/admin/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD — week range (all statuses)
  app.get('/api/admin/appointments/range', adminAuth, async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from and to required' });

      const start = DateTime.fromISO(from, { zone: TZ }).startOf('day').toISO();
      const end   = DateTime.fromISO(to,   { zone: TZ }).endOf('day').toISO();

      const appointments = await firebaseService.getAppointmentsInRangeAll(start, end);
      appointments.sort((a, b) => a.startISO.localeCompare(b.startISO));
      res.json(appointments);
    } catch (err) {
      logger.error('GET /api/admin/appointments/range error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/customer/appointments — upcoming + history for authenticated customer
  app.get('/api/customer/appointments', customerAuth, async (req, res) => {
    try {
      const phone = req.customerPhone;
      const all   = await firebaseService.getAllAppointmentsByPhone(phone);
      const now   = DateTime.now().setZone(TZ).toISO();

      const upcoming = all
        .filter(a => a.status === 'confirmed' && a.startISO >= now)
        .sort((a, b) => a.startISO.localeCompare(b.startISO));

      const history = all
        .filter(a => a.status !== 'confirmed' || a.startISO < now)
        .sort((a, b) => b.startISO.localeCompare(a.startISO));

      const name = all.find(a => a.customerName)?.customerName || null;
      res.json({ upcoming, history, name });
    } catch (err) {
      logger.error('GET /api/customer/appointments error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/customer/appointments/:id — cancel by customer (max 3h before)
  app.delete('/api/customer/appointments/:id', customerAuth, async (req, res) => {
    try {
      const phone = req.customerPhone;
      const apt   = await firebaseService.getAppointmentById(req.params.id);

      if (!apt) return res.status(404).json({ error: 'תור לא נמצא' });
      if (apt.phone !== phone) return res.status(403).json({ error: 'אין הרשאה' });
      if (apt.status !== 'confirmed') return res.status(400).json({ error: 'התור כבר בוטל או הסתיים' });

      const hoursUntil = DateTime.fromISO(apt.startISO, { zone: TZ }).diffNow('hours').hours;
      if (hoursUntil < 3) {
        return res.status(400).json({ error: 'TOO_LATE', hoursUntil: Math.round(hoursUntil) });
      }

      // Cancel in calendar + Firestore
      if (apt.calendarEventId) {
        try { await calendarService.deleteAppointment(apt.calendarEventId); } catch (_) {}
      }
      await firebaseService.updateAppointmentStatus(req.params.id, 'cancelled', { cancelledBy: 'customer' });

      // Notify barber via FCM push
      notificationService.sendToAdmin(
        '❌ תור בוטל',
        `${apt.customerName} ביטל את התור ל-${apt.timeDisplay} (${apt.dateDisplay})`
      ).catch(() => {});

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api/customer/appointments error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/customer/appointments/:id/rate — rate a completed appointment
  app.post('/api/customer/appointments/:id/rate', customerAuth, async (req, res) => {
    try {
      const phone = req.customerPhone;
      const { rating } = req.body;

      // Validate rating
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
      }

      // Get appointment
      const apt = await firebaseService.getAppointmentById(req.params.id);
      if (!apt) return res.status(404).json({ error: 'תור לא נמצא' });

      // Verify ownership
      if (apt.phone !== phone) return res.status(403).json({ error: 'אין הרשאה' });

      // Check if completed
      if (apt.status !== 'completed') {
        return res.status(400).json({ error: 'ניתן לדרג רק תורים שהושלמו' });
      }

      // Rate the appointment
      await firebaseService.rateAppointment(req.params.id, rating);
      res.json({ success: true });
    } catch (err) {
      logger.error('POST /api/customer/appointments/:id/rate error', { error: err.message });
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
      const services = await firebaseService.getAllServices();
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
      if (Number(price) <= 0 || Number(durationMinutes) <= 0) {
        return res.status(400).json({ error: 'price ו-durationMinutes חייבים להיות חיוביים' });
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

  // GET /api/available-dates — open dates in booking window (used by React PWA)
  app.get('/api/available-dates', async (req, res) => {
    try {
      let day = nowInIsrael().plus({ days: 1 }).startOf('day');
      const limit = config.bookingWindowDays || 14;
      const dates = [];

      for (let i = 0; i < limit; i++) {
        const hours = await getEffectiveWorkingHours(day, firebaseService);
        if (hours) dates.push(day.toFormat('yyyy-MM-dd'));
        day = day.plus({ days: 1 });
      }

      res.json({ dates });
    } catch (err) {
      logger.error('GET /api/available-dates error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/available-slots?date=YYYY-MM-DD&serviceId=xxx — slots for a date (used by React PWA)
  app.get('/api/available-slots', async (req, res) => {
    try {
      const { date, serviceId } = req.query;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
      }

      const dt = DateTime.fromISO(date, { zone: TZ }).startOf('day');
      if (!dt.isValid) return res.status(400).json({ error: 'Invalid date' });

      // Get service duration for overlap checking
      let durationMinutes = config.slotDurationMinutes || 30;
      if (serviceId) {
        const svc = await firebaseService.getServiceById(serviceId)
          || config.services?.find(s => s.id === serviceId);
        if (svc?.durationMinutes) durationMinutes = svc.durationMinutes;
      }

      const hours = await getEffectiveWorkingHours(dt, firebaseService);
      if (!hours) return res.json({ slots: [], closed: true });

      const allSlots = generateSlots(dt, hours);
      const busyIntervals = await calendarService.getBusySlotsForDate(dt);

      // A slot is available only if [slot, slot+duration) doesn't overlap any busy interval
      const slots = allSlots
        .filter(slotStart => {
          const slotEnd = slotStart.plus({ minutes: durationMinutes });
          return !busyIntervals.some(busy => slotStart < busy.end && slotEnd > busy.start);
        })
        .map(s => s.toFormat('HH:mm'));

      res.json({ slots, closed: false });
    } catch (err) {
      logger.error('GET /api/available-slots error', { error: err.message });
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
      const busyIntervals = await calendarService.getBusySlotsForDate(dt);
      const slotDuration = config.slotDurationMinutes || 30;
      const slots = allSlots
        .filter(slotStart => {
          const slotEnd = slotStart.plus({ minutes: slotDuration });
          return !busyIntervals.some(busy => slotStart < busy.end && slotEnd > busy.start);
        })
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

      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) return res.status(400).json({ error: 'מספר טלפון לא תקין' });

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

      // Notify barber
      notificationService.notifyAdminNewBooking({ customerName, serviceName: service.name, dateDisplay, timeDisplay }).catch(() => {});
      // Notify customer
      notificationService.notifyCustomerBookingConfirmed(normalizedPhone, { dateDisplay, timeDisplay, serviceName: service.name }).catch(() => {});

      res.json({ success: true, dateDisplay, timeDisplay, serviceName: service.name });
    } catch (err) {
      logger.error('POST /api/book error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/admin/reset — ✅ FIXED: protected by adminAuth JWT (removed ADMIN_KEY)
  app.post('/api/admin/reset', adminAuth, async (req, res) => {
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

  // ─── Admin: Walk-in ──────────────────────────────────────────────────────────

  app.post('/api/admin/appointments/walkin', adminAuth, async (req, res) => {
    try {
      const { serviceId, date, time, customerName, phone } = req.body;
      if (!serviceId || !date || !time || !customerName) {
        return res.status(400).json({ error: 'serviceId, date, time, customerName required' });
      }
      let service = await firebaseService.getServiceById(serviceId);
      if (!service) service = config.services.find(s => s.id === serviceId);
      if (!service) return res.status(400).json({ error: 'Invalid service' });

      const [hour, minute] = time.split(':').map(Number);
      const start = DateTime.fromISO(date, { zone: TZ }).set({ hour, minute, second: 0, millisecond: 0 });
      const end   = start.plus({ minutes: service.durationMinutes });
      const normalizedPhone = phone ? normalizePhone(phone) : null;

      const eventId = await calendarService.createAppointment({ startISO: start.toISO(), endISO: end.toISO(), customerName, serviceName: service.name, phone: normalizedPhone || 'walk-in' });
      if (!eventId) return res.status(409).json({ error: 'slot_taken' });

      const dateDisplay = formatDate(start);
      const timeDisplay = formatTime(start);

      const aptId = await firebaseService.saveAppointment({
        phone: normalizedPhone || 'walk-in', customerName, serviceId: service.id, serviceName: service.name,
        servicePrice: service.price, startISO: start.toISO(), endISO: end.toISO(),
        dateDisplay, timeDisplay, calendarEventId: eventId, status: 'confirmed', source: 'walkin'
      });

      res.json({ success: true, id: aptId, dateDisplay, timeDisplay });
    } catch (err) {
      logger.error('POST /api/admin/appointments/walkin error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // DELETE /api/admin/appointments/day/:date — cancel entire day
  app.delete('/api/admin/appointments/day/:date', adminAuth, async (req, res) => {
    try {
      const { date } = req.params;
      const { reason } = req.body || {};
      const startISO = DateTime.fromISO(date, { zone: TZ }).startOf('day').toISO();
      const endISO   = DateTime.fromISO(date, { zone: TZ }).endOf('day').toISO();
      const appointments = await firebaseService.getAppointmentsInRangeAll(startISO, endISO);
      const active = appointments.filter(a => a.status === 'confirmed');
      let cancelled = 0;
      for (const apt of active) {
        if (apt.calendarEventId) { try { await calendarService.deleteAppointment(apt.calendarEventId); } catch (_) {} }
        await firebaseService.updateAppointmentStatus(apt.id, 'cancelled', { cancelledBy: 'barber' });
        notificationService.notifyCustomerCancelled(apt.phone, { dateDisplay: apt.dateDisplay, timeDisplay: apt.timeDisplay }).catch(() => {});
        cancelled++;
      }
      logger.info('Day cancelled', { date, cancelled });
      res.json({ success: true, cancelled });
    } catch (err) {
      logger.error('DELETE /api/admin/appointments/day error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Admin: Customer Profile ─────────────────────────────────────────────────

  app.get('/api/admin/customers/:phone', adminAuth, async (req, res) => {
    try {
      const profile = await firebaseService.getCustomerProfile(req.params.phone);
      const recentApts = await firebaseService.getAllAppointmentsByPhone(req.params.phone);
      res.json({ ...profile, recentAppointments: recentApts.slice(0, 10) });
    } catch (err) {
      logger.error('GET /api/admin/customers error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/api/admin/customers/:phone', adminAuth, async (req, res) => {
    try {
      const { notes, isBlocked, blockedReason } = req.body;
      const phone = req.params.phone;
      if (isBlocked === true)  await firebaseService.blockCustomer(phone, blockedReason || '');
      if (isBlocked === false) await firebaseService.unblockCustomer(phone);
      if (notes !== undefined) await firebaseService.upsertCustomerProfile(phone, { notes });
      res.json({ success: true });
    } catch (err) {
      logger.error('PATCH /api/admin/customers error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Admin: Stats ────────────────────────────────────────────────────────────

  app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
      const { period = 'week' } = req.query;
      const now = nowInIsrael();
      let startISO, endISO;
      if (period === 'today')      { startISO = now.startOf('day').toISO();   endISO = now.endOf('day').toISO(); }
      else if (period === 'month') { startISO = now.startOf('month').toISO(); endISO = now.endOf('month').toISO(); }
      else                         { startISO = now.startOf('week').toISO();  endISO = now.endOf('week').toISO(); }
      const stats = await firebaseService.getStatsData(startISO, endISO);
      res.json(stats);
    } catch (err) {
      logger.error('GET /api/admin/stats error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Admin: Broadcast ────────────────────────────────────────────────────────

  app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
    try {
      const { message, daysSince = 30 } = req.body;
      if (!message || message.trim().length < 5) return res.status(400).json({ error: 'message required' });
      const recipients = await firebaseService.getBroadcastRecipients(daysSince);
      res.json({ success: true, total: recipients.length, status: 'sending' });
      // Collect FCM tokens for all recipients and send broadcast
      const tokens = [];
      for (const phone of recipients) {
        try {
          const profile = await firebaseService.getCustomerProfile(phone);
          if (profile?.fcmToken) tokens.push(profile.fcmToken);
        } catch (_) {}
      }
      notificationService.sendBroadcast(tokens, '💈 מספרת בבאני', message.trim()).catch(() => {});
      logger.info('Broadcast sent via FCM', { recipients: recipients.length, tokensFound: tokens.length });
    } catch (err) {
      logger.error('POST /api/admin/broadcast error', { error: err.message });
      if (!res.headersSent) res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Admin: Customer Export ──────────────────────────────────────────────────

  app.get('/api/admin/customers/export', adminAuth, async (req, res) => {
    try {
      const BOM = '\uFEFF';

      // Get stats data from a wide date range (all time)
      const minDate = '2000-01-01T00:00:00.000Z';
      const maxDate = '2099-12-31T23:59:59.999Z';

      // Fetch all unique customers by looking at appointments
      // We'll reconstruct the customer list from appointments
      const customerMap = {};

      // Use an approach that gets all phones from appointments
      // by fetching in chunks or via a workaround
      const allApts = [];

      // Since we can't easily get "all" appointments, iterate through a year window
      const now = nowInIsrael();
      const twoYearsAgo = now.minus({ years: 2 });

      for (let i = 0; i < 24; i++) {
        const startOfMonth = twoYearsAgo.plus({ months: i }).startOf('month').toISO();
        const endOfMonth = twoYearsAgo.plus({ months: i }).endOf('month').toISO();
        const apts = await firebaseService.getAppointmentsInRangeAll(startOfMonth, endOfMonth);
        allApts.push(...apts);
      }

      // Group by phone
      allApts.forEach(apt => {
        const phone = apt.phone;
        if (!phone || phone === 'walk-in') return;

        if (!customerMap[phone]) {
          customerMap[phone] = {
            phone,
            name: apt.customerName || '',
            visitCount: 0,
            lastVisit: null,
            totalSpent: 0
          };
        }

        const customer = customerMap[phone];
        // Always use the latest name if available
        if (apt.customerName) customer.name = apt.customerName;

        if (apt.status === 'completed') {
          customer.visitCount++;
          customer.totalSpent += apt.servicePrice || 0;
          if (!customer.lastVisit || (apt.startISO && apt.startISO > customer.lastVisit)) {
            customer.lastVisit = apt.dateDisplay || apt.startISO?.slice(0, 10) || '';
          }
        }
      });

      // Convert to array and sort by last visit descending
      const customers = Object.values(customerMap)
        .sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));

      // Build CSV with BOM for Excel Hebrew support
      const headers = ['טלפון', 'שם', 'ביקורים', 'ביקור אחרון', 'סה"כ הוצאה'];
      const rows = customers.map(c => [
        c.phone,
        c.name || 'לא ידוע',
        c.visitCount,
        c.lastVisit || '—',
        c.totalSpent
      ]);

      const csvContent = [headers, ...rows]
        .map(r => r.map(col => `"${String(col).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const csv = BOM + csvContent;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
      res.send(csv);
    } catch (err) {
      logger.error('GET /api/admin/customers/export error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Admin: CSV Export ───────────────────────────────────────────────────────

  app.get('/api/admin/export/csv', adminAuth, async (req, res) => {
    try {
      const { from, to } = req.query;
      const now = nowInIsrael();
      const startISO = from ? DateTime.fromISO(from, { zone: TZ }).startOf('day').toISO() : now.startOf('month').toISO();
      const endISO   = to   ? DateTime.fromISO(to,   { zone: TZ }).endOf('day').toISO()   : now.endOf('month').toISO();
      const appointments = await firebaseService.getAppointmentsInRangeAll(startISO, endISO);
      appointments.sort((a, b) => a.startISO.localeCompare(b.startISO));
      const headers = ['תאריך','שעה','שם לקוח','טלפון','שירות','מחיר','סטטוס','מקור'];
      const rows = appointments.map(a => [
        a.dateDisplay||'', a.timeDisplay||'', a.customerName||'',
        (a.phone||'').replace('whatsapp:','').replace(/^972/,'0'),
        a.serviceName||'', a.servicePrice||'', a.status||'', a.source||'web'
      ]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="appointments_${from||now.toFormat('yyyy-MM')}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (err) {
      logger.error('GET /api/admin/export/csv error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Waiting List ────────────────────────────────────────────────────────────

  app.get('/api/admin/waiting-list/:date', adminAuth, async (req, res) => {
    try {
      res.json(await firebaseService.getWaitingListForDate(req.params.date));
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
  });

  app.delete('/api/admin/waiting-list/:id', adminAuth, async (req, res) => {
    try {
      await firebaseService.removeFromWaitingList(req.params.id);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Server error' }); }
  });

  app.post('/api/waiting-list', async (req, res) => {
    try {
      const { date, phone, customerName, serviceId, serviceName } = req.body;
      if (!date || !phone || !customerName) return res.status(400).json({ error: 'date, phone, customerName required' });
      const normalizedPhone = normalizePhone(phone);
      const id = await firebaseService.addToWaitingList({ date, phone: normalizedPhone, customerName, serviceId: serviceId||null, serviceName: serviceName||null });
      notificationService.sendToAdmin('📋 נרשם לרשימת המתנה', `${customerName} ממתין לתור בתאריך ${date}`).catch(() => {});
      res.json({ success: true, id });
    } catch (err) {
      logger.error('POST /api/waiting-list error', { error: err.message });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Serve React PWA (production) ──────────────────────────────────────────
  const fs = require('fs');
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));

  // Admin routes: serve React SPA with admin manifest (so PWA installs to /admin/day)
  app.get(['/admin', '/admin/*'], (req, res, next) => {
    const indexPath = path.join(clientDist, 'index.html');
    try {
      const html = fs.readFileSync(indexPath, 'utf8')
        .replace('href="/manifest.json"',          'href="/admin-manifest.json?v=3"')
        .replace('href="/icons/icon-192.png"',     'href="/icons/admin-icon-192.png"')
        .replace(/content="מספרת בבאני"/g,         'content="בבאני ניהול"')
        .replace('content="#1a1a2e"',              'content="#0f3460"');
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(html);
    } catch { next(); }
  });

  // Customer SPA catch-all
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), err => {
      if (err) next();
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled express error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createServer };
