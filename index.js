require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// 1. Railway uchun Web Server (Bot o'chib qolmasligi uchun)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is running...");
}).listen(port, "0.0.0.0");

// 2. Firebase ulanish qismi
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("✅ Firebase muvaffaqiyatli ulandi");
} catch (error) {
    console.error("❌ Firebase ulanishda xato:", error.message);
}

// 3. Botni sozlash
const bot = new Telegraf(process.env.BOT_TOKEN);

// Test uchun Start buyrug'i
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id.toString();
        
        // Foydalanuvchini bazaga saqlash testi
        if (db) {
            await db.collection('users').doc(userId).set({
                first_name: ctx.from.first_name,
                username: ctx.from.username || 'yoq',
                last_seen: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        await ctx.reply(`Assalomu alaykum ${ctx.from.first_name}! \nBot muvaffaqiyatli ishga tushdi va Firebase-ga ulandi. 🚀`);
    } catch (err) {
        console.error("Start-da xato:", err);
        ctx.reply("Botda texnik xatolik yuz berdi.");
    }
});

// Admin panel yoki boshqa funksiyalaringizni shu yerdan pastga qo'shishingiz mumkin
// Masalan: bot.on('text', ...)

// 4. Botni ishga tushirish va xatolarni ushlash
bot.catch((err, ctx) => {
    console.log(`Telegram xatosi (${ctx.updateType}):`, err);
});

bot.launch()
    .then(() => console.log("🚀 Bot Telegram serveriga ulandi!"))
    .catch((err) => console.error("Launch xatosi:", err));

// To'g'ri to'xtatish (Railway uchun)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
