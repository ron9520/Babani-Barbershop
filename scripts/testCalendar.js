/**
 * Test script for Google Calendar connection.
 * Run: node scripts/testCalendar.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const { DateTime } = require('luxon');

const TZ = 'Asia/Jerusalem';

async function main() {
  console.log('\n🔍 בדיקת חיבור Google Calendar...\n');

  // 1. Check env vars
  const required = ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_CALENDAR_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ חסרים env vars:', missing.join(', '));
    console.error('   הכנס אותם ל-.env ונסה שוב.\n');
    process.exit(1);
  }
  console.log('✅ env vars — OK');
  console.log('   Email:', process.env.GOOGLE_CLIENT_EMAIL);
  console.log('   Calendar ID:', process.env.GOOGLE_CALENDAR_ID);

  // 2. Build auth
  let auth;
  try {
    auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );
    await auth.authorize();
    console.log('✅ אימות JWT — OK');
  } catch (err) {
    console.error('❌ אימות נכשל:', err.message);
    console.error('   בדוק שה-GOOGLE_PRIVATE_KEY נכון ושה-API מופעל.\n');
    process.exit(1);
  }

  const calendar = google.calendar({ version: 'v3', auth });

  // 3. Get calendar info
  try {
    const cal = await calendar.calendars.get({ calendarId: process.env.GOOGLE_CALENDAR_ID });
    console.log('✅ יומן נמצא:', cal.data.summary);
    console.log('   אזור זמן:', cal.data.timeZone);
  } catch (err) {
    console.error('❌ לא ניתן לגשת ליומן:', err.message);
    console.error('   בדוק שה-GOOGLE_CALENDAR_ID נכון ושה-service account שותף ביומן.\n');
    process.exit(1);
  }

  // 4. List today's events
  const now = DateTime.now().setZone(TZ);
  const start = now.startOf('day').toISO();
  const end = now.endOf('day').toISO();

  try {
    const res = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: 'startTime'
    });
    const events = res.data.items || [];
    console.log(`✅ אירועים להיום: ${events.length}`);
    events.forEach(e => {
      const time = e.start.dateTime
        ? DateTime.fromISO(e.start.dateTime, { zone: TZ }).toFormat('HH:mm')
        : 'כל היום';
      console.log(`   - ${time} | ${e.summary}`);
    });
  } catch (err) {
    console.error('❌ שגיאה בקריאת אירועים:', err.message);
    process.exit(1);
  }

  // 5. Create + delete test event
  console.log('\n🧪 יוצר אירוע בדיקה...');
  const testStart = now.plus({ hours: 1 }).set({ minute: 0, second: 0, millisecond: 0 });
  const testEnd = testStart.plus({ minutes: 30 });

  let testEventId;
  try {
    const res = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      resource: {
        summary: '✂️ TEST - מחיקה אוטומטית',
        start: { dateTime: testStart.toISO(), timeZone: TZ },
        end:   { dateTime: testEnd.toISO(),   timeZone: TZ }
      }
    });
    testEventId = res.data.id;
    console.log('✅ אירוע נוצר:', testEventId);
  } catch (err) {
    console.error('❌ יצירת אירוע נכשלה:', err.message);
    process.exit(1);
  }

  try {
    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: testEventId
    });
    console.log('✅ אירוע הבדיקה נמחק');
  } catch (err) {
    console.warn('⚠️  לא ניתן למחוק אירוע הבדיקה:', err.message);
  }

  console.log('\n🎉 כל הבדיקות עברו! Google Calendar מוכן לשימוש.\n');
}

main().catch(err => {
  console.error('שגיאה לא צפויה:', err.message);
  process.exit(1);
});
