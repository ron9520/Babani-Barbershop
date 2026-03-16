/**
 * Starts the bot server + ngrok tunnel and prints the webhook URL.
 * Run: node scripts/startWithNgrok.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;
const NGROK_EXE = 'C:/Users/Owner/AppData/Local/ngrok/ngrok.exe';

function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tunnel = json.tunnels.find(t => t.proto === 'https');
          resolve(tunnel ? tunnel.public_url : null);
        } catch {
          reject(new Error('Failed to parse ngrok API response'));
        }
      });
    });
    req.on('error', reject);
  });
}

async function waitFor(fn, retries = 10, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('Timeout waiting');
}

async function main() {
  console.log('\n🚀 מפעיל מספרת בבאני...\n');

  // Start bot server
  const server = spawn('node', [path.join(__dirname, '../src/index.js')], {
    stdio: 'inherit',
    env: process.env
  });
  server.on('error', err => {
    console.error('❌ שגיאה בהפעלת השרת:', err.message);
    process.exit(1);
  });

  await new Promise(r => setTimeout(r, 2000));

  // Start ngrok
  console.log(`\n🔗 מחבר ngrok לפורט ${PORT}...`);
  const ngrokProc = spawn(NGROK_EXE, ['http', String(PORT)], { stdio: 'ignore' });
  ngrokProc.on('error', err => {
    console.error('❌ ngrok נכשל:', err.message);
    server.kill();
    process.exit(1);
  });

  // Get public URL from ngrok API
  let url;
  try {
    url = await waitFor(getNgrokUrl, 12, 1000);
  } catch {
    console.error('❌ לא ניתן לקבל URL מ-ngrok. בדוק שה-authtoken תקין.');
    ngrokProc.kill();
    server.kill();
    process.exit(1);
  }

  const webhookUrl = `${url}/webhook`;

  console.log('\n' + '='.repeat(55));
  console.log('✅ הבוט פועל!');
  console.log('='.repeat(55));
  console.log(`\n📎 Webhook URL לטוויליו:\n   ${webhookUrl}\n`);
  console.log('📋 הוראות:');
  console.log('   1. כנס ל: https://console.twilio.com');
  console.log('   2. Messaging → Try it out → Send a WhatsApp message');
  console.log('   3. Sandbox Settings → "When a message comes in":');
  console.log(`      ${webhookUrl}`);
  console.log('   4. שמור → שלח "היי" בוואטסאפ\n');
  console.log('='.repeat(55));
  console.log('   Ctrl+C לעצירה');
  console.log('='.repeat(55) + '\n');

  process.on('SIGINT', () => {
    console.log('\n🛑 עוצר...');
    ngrokProc.kill();
    server.kill();
    process.exit(0);
  });
}

main();
