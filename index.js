require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// 1. Firebase Railway uchun (Variable orqali)
try {
    const firebaseConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig)
    });
} catch (error) {
    console.error("❌ Firebase ulanishda xato! Variable'ni tekshiring.");
    process.exit(1);
}

// MANA SHU QATOR XATONI TUZATADI:
const db = admin.firestore(); 

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
let adminState = {};

// 2. Portni sozlash (Railway uchun shart)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is alive!");
}).listen(port, "0.0.0.0");

// --- Qolgan funksiyalaringizni (getUnsubscribedChannels, start va h.k.) shu yerga qo'shing ---
// Ularning hammasi endi tepada e'lon qilingan 'db' ni taniy oladi.

bot.launch().then(() => console.log("🚀 Bot Firebase bilan ishga tushdi!"));
