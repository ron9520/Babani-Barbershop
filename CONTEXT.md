# מספרת בבאני — הקשר פרויקט

## ❌ החלטות ארכיטקטורה (חשוב לקרוא!)

### הסרת Green-API ו-Twilio (20/03/2026)
**ירדנו מרעיון ה-WhatsApp Bot לחלוטין.**
- אין להוסיף קוד חדש שמשתמש ב-Green-API או Twilio
- אין להוסיף webhook של WhatsApp
- אין לשמר את תיקיית `src/bot/` — למחוק בשלב הניקיון
- אין לשמר את `src/services/whatsappService.js` ו-`src/services/twilioService.js`
- תזכורות ללקוחות יישלחו רק דרך **Push Notifications (FCM)** — לא WhatsApp
- כל ה-ENV variables של Green-API / Twilio ניתנים להסרה

**קבצים למחיקה (בשלב הניקיון):**
- `src/bot/` (כל התיקייה)
- `src/services/whatsappService.js`
- `src/services/twilioService.js`
- `src/jobs/reminderJob.js` — לנקות את כל הקריאות ל-WhatsApp, להשאיר רק FCM push + Google Calendar

---

## מה בנינו עד עכשיו
- [x] מבנה פרויקט מלא (Node.js + Express)
- [x] ~~Green-API WhatsApp — webhook + שליחת הודעות~~ **(הוסר — ראה מעלה)**
- [x] Firebase Firestore — sessions + appointments
- [x] Google Calendar — יצירה/מחיקה/בדיקת זמינות
- [x] מניעת race conditions בקביעת תורים
- [x] תזכורת יומית אוטומטית (node-cron, 08:00) — FCM בלבד
- [x] ביטול תורים (Calendar)
- [x] Winston לוגים
- [x] config.json עם שירותים ומחירים
- [x] דף הזמנה (public/booking.html) — הזמנת תור מהדפדפן
- [x] Admin API בסיסי — /api/admin/login + /api/admin/appointments (GET + PATCH status)

### ✅ שלב 1 Backend — הושלם
- [x] `authService.js` — JWT admin (24h) + JWT customer (30d) + OTP WhatsApp
- [x] `firebaseService.js` — נוספו: Services CRUD, Schedule Overrides, Customer Profiles, Waiting List, Stats, Broadcast
- [x] `server.js` — כל API endpoints: admin/customer/public, bugfixes (reset + getAppointmentsInRangeAll)
- [x] `reminderJob.js` — נוספו: daily summary, weekly report, review requests, rebooking nudges, scheduleAll()
- [x] `index.js` — מעודכן ל-scheduleAll()

### ✅ שלב 2 React PWA — הושלם (צריך npm build)
- [x] `client/` — Vite + React + Tailwind, RTL Hebrew, Dark Mode
- [x] `client/public/manifest.json` + `sw.js` — PWA + Push Notifications
- [x] Admin: Login, DayView (ווק-אין, בטל יום, שינוי סטטוס), WeekView, Stats (גרף, CSV export), Settings (שעות + overrides + broadcast), PriceList, Customers
- [x] Customer: Landing + BookingWizard (5 שלבים), CustomerLogin (OTP), MyAppointments (ביטול, היסטוריה)
- [x] `server.js` — serve React build מ-`client/dist`

## הצעד הבא — PWA מלא

### מסמכי אפיון (חובה לקרוא לפני שמתחילים!)
- `PWA-SPEC.md` — אפיון מלא של ה-PWA (פאנל ניהול + דף נחיתה)
- `PWA-CUSTOMER-PORTAL-SPEC.md` — אפיון פורטל לקוחות ("התורים שלי" + OTP + Push)

### שלב 1 — Backend (עשה זאת ראשון)

**א. אימות**
- [ ] `authService.js` — PIN hash + JWT signing (secret ב-.env: `JWT_SECRET`)
- [ ] `POST /api/admin/login` → החזר JWT במקום success:true (כבר קיים, צריך שדרוג)
- [ ] middleware `adminAuth` → ולידציית JWT (כבר קיים כ-PIN, צריך שדרוג ל-JWT)
- [ ] `POST /api/customer/send-otp` → יצירת OTP 4 ספרות + שליחה ב-WhatsApp + שמירה ב-Firestore
- [ ] `POST /api/customer/verify-otp` → בדיקת OTP + החזרת JWT לקוח

**ב. ניהול שעות (schedule overrides)**
- [ ] אוסף Firestore: `schedule_overrides` — `{ date, open, close, closed, reason }`
- [ ] `GET /api/admin/schedule` — שעות ברירת מחדל + overrides קרובים
- [ ] `PUT /api/admin/schedule/default` — עדכון שעות קבועות ל-admin_config
- [ ] `POST /api/admin/schedule/override` — שינוי חד-פעמי לתאריך ספציפי
- [ ] `DELETE /api/admin/schedule/override/:date` — מחיקת override
- [ ] **עדכן `timeUtils.generateSlots` + `getAvailableDates`** לבדוק overrides לפני החזרת slots

**ג. מחירון דינמי**
- [ ] מיגרציה: העברת `config.services` ל-Firestore אוסף `services`
- [ ] `GET /api/admin/services` — כל השירותים
- [ ] `POST /api/admin/services` — הוספת שירות
- [ ] `PUT /api/admin/services/:id` — עדכון שירות
- [ ] `DELETE /api/admin/services/:id` — מחיקת שירות

**ד. תורים — ניהול**
- [ ] `GET /api/admin/appointments?from=&to=` — תורים לטווח תאריכים (שבוע)
- [ ] הוספת סטטוס `no_show` לפונקציה הקיימת
- [ ] `GET /api/customer/appointments` — תורים של לקוח לפי JWT phone
- [ ] `DELETE /api/customer/appointments/:id` — ביטול ע"י לקוח (עד 3 שעות לפני)

**ה. סטטיסטיקות**
- [ ] `GET /api/admin/stats?period=today|week|month`
- [ ] `statsService.js` — חישוב: totalAppointments, revenue, popularServices, peakHours

**ו. Push Notifications**
- [ ] הוסף `firebase-admin` messaging לשרת
- [ ] `POST /api/admin/push/register` + `/api/customer/push/register`
- [ ] `pushService.js` — שליחת push לחיים + ללקוחות
- [ ] עדכן `reminderJob.js` — שלח push במקביל ל-WhatsApp

---

### שלב 2 — React PWA

**הגדרה:**
```bash
cd BabaniBarberShop
npm create vite@latest client -- --template react
cd client && npm install tailwindcss @tailwindcss/vite react-router-dom
```

**קבצים ליצור:**
- `client/public/manifest.json` — PWA manifest (RTL, dark, Hebrew)
- `client/public/sw.js` — Service Worker (cache shell + network-first API)
- `client/src/App.jsx` — Router: `/`, `/my-appointments`, `/admin`, `/admin/login`
- עמודים: Landing, BookingWizard, CustomerLogin, MyAppointments, AdminLogin,
  DayView, WeekView, Stats, Settings, PriceList
- קומפוננטות: AppointmentCard, BottomNav, OtpInput, PinInput, TimeSlotGrid,
  CalendarPicker, StatCard, InstallPromptBanner

**עיצוב:**
- Dark mode בלבד
- RTL (dir="rtl", lang="he")
- גופן Heebo (Google Fonts)
- צבעים: Primary #e94560 | Background #1a1a2e | Card #16213e

---

### שלב 3 — Build & Serve

ב-`server.js` להוסיף serve של build ה-React:
```js
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));
```

ב-`package.json` להוסיף:
```json
"build": "cd client && npm run build",
"start": "node src/index.js"
```

---

## ENV Variables נדרשים (חדשים)
```
JWT_SECRET=<random-strong-secret>
ADMIN_PIN=<4-digit-pin>
BARBER_PHONE=<972XXXXXXXXX>
```

## Firestore — אוספים חדשים
- `schedule_overrides` — שינויי שעות חד-פעמיים
- `services` — מחירון דינמי
- `admin_config` — הגדרות כלליות + שעות עבודה
- `otp_codes` — קודי OTP ללקוחות
- `customer_tokens` — JWT tokens ללקוחות
- `customer_push_tokens` — FCM tokens ללקוחות
- `push_tokens` — FCM token של חיים (הספר)

## 🐛 באגים ידועים לתיקון (עדיפות גבוהה!)

### באג 1 — איפוס נגיש מחוץ לפאנל ניהול
**קובץ:** `src/server.js` שורה 305
**בעיה:** `POST /api/admin/reset` מוגן רק ב-`ADMIN_KEY` (query param), לא ב-JWT. צריך להחליף ל-`adminAuth` middleware.
**תיקון:**
```js
// לפני:
app.post('/api/admin/reset', async (req, res) => {
  const key = req.query.key || req.body?.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) { ... }

// אחרי:
app.post('/api/admin/reset', adminAuth, async (req, res) => {
  // הסר את בדיקת ADMIN_KEY לגמרי
```
ב-`.env` — אפשר להסיר את `ADMIN_KEY`.

### באג 2 — תורים לא מופיעים בפאנל ניהול
**קובץ:** `src/services/firebaseService.js` שורה 93
**בעיות (שתיים):**

א. `getAppointmentsInRange` מחזיר רק `status == 'confirmed'`. תורים שסומנו כ-completed/no_show לא יופיעו. **לפאנל ניהול** צריך לראות את כולם.

**תיקון — הוסף פונקציה נפרדת לאדמין:**
```js
async function getAppointmentsInRangeAll(startISO, endISO) {
  // ללא פילטר status — מחזיר הכל
  const snap = await getDb()
    .collection('appointments')
    .where('startISO', '>=', startISO)
    .where('startISO', '<', endISO)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```
ב-`server.js` — החלף `getAppointmentsInRange` ב-`getAppointmentsInRangeAll` ב-endpoint של אדמין.

ב. **Firestore composite index חסר!** הקוורי הנוכחי (`status == + startISO >=`) דורש composite index.
**פתרון:** כנס ל-Firebase Console → Firestore → Indexes → Add Index:
- Collection: `appointments`
- Fields: `status ASC`, `startISO ASC`
- או פשוט הפעל את השרת, תקבל שגיאה עם לינק אוטומטי ליצירת ה-index — לחץ עליו.

עבור `getAppointmentsInRangeAll` (רק startISO) — **לא דרוש** composite index, רק single-field index שנוצר אוטומטית.

## 🚀 הצעד הבא — Build + Deploy

### א. בניית ה-PWA (הרץ פעם אחת מהטרמינל)
```bash
cd BabaniBarberShop
npm run build
# זה מריץ: cd client && npm install && npm run build
# הפלט: client/dist/
```

### ב. הוספת .env variables חדשים
```
JWT_SECRET=<random-strong-secret-32chars>
ADMIN_PIN=<4-6 ספרות>
BARBER_PHONE=972XXXXXXXXX
SERVER_URL=https://your-render-app.onrender.com
GOOGLE_REVIEW_URL=https://g.page/r/YOUR_REVIEW_LINK
```

### ג. יצירת תיקיית icons ל-PWA
צור תמונות 192×192 ו-512×512 PNG עם לוגו המספרה ושמור ב:
- `client/public/icons/icon-192.png`
- `client/public/icons/icon-512.png`

### ד. Firestore Composite Index (לעמוד status == + startISO)
Firebase Console → Firestore → Indexes → Add composite index:
- Collection: `appointments`
- Fields: `status` (Ascending), `startISO` (Ascending)
(נדרש ל-`getAppointmentsInRange` בתזכורות יומיות)

### ה. Deploy ל-Render
```bash
# ב-render.yaml — וודא שיש את כל ה-ENV vars החדשים
git add . && git commit -m "Add React PWA"
git push
```
Render יריץ `npm start` שמאתחל את השרת + מגיש את client/dist

## תאריך עדכון אחרון
20/03/2026 — ניקיון, תיקוני באגים ואבטחה הושלמו. Deployed ל-Render.

### ✅ מה הושלם היום (20/03/2026)
- [x] הסרת Green-API, Twilio, ו-src/bot/ לחלוטין
- [x] תיקון Firebase + Google private key (הסרת `.trim()`)
- [x] תיקון timezone bug בביטול תורים
- [x] תיקון duplicate endpoint ב-customer/appointments
- [x] הסרת `/api/customer/phone-login` (חור אבטחה)
- [x] הוספת CORS middleware
- [x] JWT_SECRET validation (מינימום 32 תווים)
- [x] Input validation על מחיר/משך שירות
- [x] שדרוג firebase-admin לv12
- [x] npm audit fix (נשארו 8 low בdependencies פנימיות של Google — אין פעולה נדרשת)
