# מספרת בבאני — הקשר פרויקט

## מה בנינו עד עכשיו
- [x] מבנה פרויקט מלא (Node.js + Express)
- [x] Twilio WhatsApp API — מוגדר ב-.env
- [x] Firebase Firestore — מוגדר ב-.env
- [x] Google Calendar — מחובר ועובד
- [x] לוגיקת שיחה מלאה (בחירת שירות → תאריך → שעה → שם → אישור)
- [x] מניעת race conditions בקביעת תורים
- [x] תזכורת יומית אוטומטית (node-cron)
- [x] ביטול תורים
- [x] Winston לוגים
- [x] config.json עם שירותים ומחירים
- [x] ngrok + בדיקה אמיתית — הבוט ענה ויצר פגישה ביומן ✅

## שלב 3: Google Calendar — מה שצריך לעשות (ידני)
1. כנס ל-console.cloud.google.com
2. בחר/צור פרויקט → הפעל **Google Calendar API**
3. כנס ל-IAM & Admin → Service Accounts → צור service account
4. צור מפתח (JSON) → שמור את הקובץ
5. העתק מהקובץ:
   - `client_email` → GOOGLE_CLIENT_EMAIL ב-.env
   - `private_key`  → GOOGLE_PRIVATE_KEY ב-.env
6. פתח את Google Calendar של חיים → שתף עם ה-client_email (הרשאת Editor)
7. העתק את ה-Calendar ID (הגדרות יומן → Calendar ID) → GOOGLE_CALENDAR_ID ב-.env
8. הרץ: `npm run test:calendar` — אמור לראות 🎉 בסוף

## הצעד הבא — שלב 4: ngrok + בדיקה ראשונה
- הרץ: npm start
- הרץ: ngrok http 3000
- חבר את ה-webhook URL ב-Twilio Console
- שלח הודעה ראשונה בוואטסאפ לבדיקה

## בעיות פתוחות
- אין בעיות ידועות כרגע

## תאריך עדכון אחרון
15/03/2026 — שלב 3 (Google Calendar) — קוד מוכן, ממתין לפרטי API
