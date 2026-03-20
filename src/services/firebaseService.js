const admin = require('firebase-admin');
const logger = require('../utils/logger');
const config = require('../../config/config.json');

let db;

function init() {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').split('\n').map(l => l.trim()).join('\n')
    })
  });

  db = admin.firestore();
  logger.info('Firebase initialized');
}

function getDb() {
  if (!db) init();
  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

async function getSession(phone) {
  const doc = await getDb().collection('sessions').doc(phone).get();
  if (!doc.exists) return null;

  const data = doc.data();
  // Auto-expire sessions
  const timeoutMs = config.sessionTimeoutMinutes * 60 * 1000;
  if (Date.now() - data.updatedAt > timeoutMs) {
    await deleteSession(phone);
    return null;
  }
  return data;
}

async function setSession(phone, sessionData) {
  await getDb().collection('sessions').doc(phone).set({
    ...sessionData,
    updatedAt: Date.now()
  });
}

async function deleteSession(phone) {
  await getDb().collection('sessions').doc(phone).delete();
}

// ─── Appointments ─────────────────────────────────────────────────────────────

async function saveAppointment(appointment) {
  const ref = await getDb().collection('appointments').add({
    ...appointment,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Appointment saved to Firestore', { id: ref.id, phone: appointment.phone });
  return ref.id;
}

async function getAppointmentByPhone(phone) {
  const snap = await getDb()
    .collection('appointments')
    .where('phone', '==', phone)
    .where('status', '==', 'confirmed')
    .orderBy('startISO', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getAppointmentById(appointmentId) {
  const doc = await getDb().collection('appointments').doc(appointmentId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function cancelAppointment(appointmentId) {
  await getDb().collection('appointments').doc(appointmentId).update({ status: 'cancelled' });
  logger.info('Appointment cancelled in Firestore', { id: appointmentId });
}

/**
 * Get all confirmed appointments for a given date range (ISO strings).
 */
async function getAppointmentsInRange(startISO, endISO) {
  const snap = await getDb()
    .collection('appointments')
    .where('status', '==', 'confirmed')
    .where('startISO', '>=', startISO)
    .where('startISO', '<', endISO)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateAppointmentStatus(id, status) {
  const update = { status };
  if (status === 'completed') update.completedAt = admin.firestore.FieldValue.serverTimestamp();
  if (status === 'cancelled') update.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
  await getDb().collection('appointments').doc(id).update(update);
  logger.info('Appointment status updated', { id, status });
}

async function clearAllData() {
  const db = getDb();
  const [appointmentsSnap, sessionsSnap] = await Promise.all([
    db.collection('appointments').get(),
    db.collection('sessions').get()
  ]);

  const batch = db.batch();
  appointmentsSnap.docs.forEach(doc => batch.delete(doc.ref));
  sessionsSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  return appointmentsSnap.size;
}

// ─── Schedule Overrides ───────────────────────────────────────────────────────

async function getScheduleOverride(dateISO) {
  const doc = await getDb().collection('schedule_overrides').doc(dateISO).get();
  return doc.exists ? doc.data() : null;
}

async function setScheduleOverride({ date, open, close, closed, reason }) {
  await getDb().collection('schedule_overrides').doc(date).set({
    date,
    open:   closed ? null : open,
    close:  closed ? null : close,
    closed: closed || false,
    reason: reason || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Schedule override set', { date, closed });
}

async function deleteScheduleOverride(dateISO) {
  await getDb().collection('schedule_overrides').doc(dateISO).delete();
  logger.info('Schedule override deleted', { date: dateISO });
}

async function getUpcomingOverrides() {
  const today  = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snap = await getDb().collection('schedule_overrides')
    .where('date', '>=', today)
    .where('date', '<=', future)
    .orderBy('date')
    .get();
  return snap.docs.map(d => d.data());
}

// ─── Admin Config (default working hours) ─────────────────────────────────────

async function getAdminConfig() {
  const doc = await getDb().collection('admin_config').doc('settings').get();
  return doc.exists ? doc.data() : null;
}

async function updateDefaultHours(day, open, close) {
  await getDb().collection('admin_config').doc('settings').set(
    { workingHours: { [day]: { open, close } } },
    { merge: true }
  );
  logger.info('Default hours updated', { day, open, close });
}

module.exports = {
  init,
  getSession,
  setSession,
  deleteSession,
  saveAppointment,
  getAppointmentById,
  getAppointmentByPhone,
  cancelAppointment,
  getAppointmentsInRange,
  updateAppointmentStatus,
  clearAllData,
  getScheduleOverride,
  setScheduleOverride,
  deleteScheduleOverride,
  getUpcomingOverrides,
  getAdminConfig,
  updateDefaultHours
};
