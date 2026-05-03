require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// 1. Firebase Railway uchun
try {
    const firebaseConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig)
    });
} catch (error) {
    console.error("❌ Firebase ulanishda xato: Variable noto'g'ri bo'lishi mumkin.");
    process.exit(1);
}

const db = admin.firestore(); // Bu qator 'db'ni aniqlaydi

// 2. Bot va Admin
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// 3. Port (Railway uchun shart)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is alive!");
}).listen(port);

// 4. Start va boshqa funksiyalar (db dan foydalanadi)
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    await db.collection('users').doc(userId).set({
        name: ctx.from.first_name,
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    ctx.reply("Salom! Xush kelibsiz.");
});

// Qolgan funksiyalaringizda ham 'db' so'zini ishlataverasiz...

bot.launch().then(() => console.log("🚀 Bot ishladi!"));
