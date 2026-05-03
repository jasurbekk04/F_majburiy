require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// 1. Firebase ulanishi va DB ni e'lon qilish
let db;
try {
    const firebaseConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(firebaseConfig)
    });
    db = admin.firestore(); // BU YERDA DB E'LON QILINDI
    console.log("✅ Firebase muvaffaqiyatli ulandi");
} catch (error) {
    console.error("❌ Firebase ulanishda xato:", error.message);
    process.exit(1); // Baza bo'lmasa bot ishlamaydi
}

// 2. Railway uchun Mini-Server (Portni band qilib turish shart)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is running on Firebase...");
}).listen(port, "0.0.0.0", () => {
    console.log(`📡 Server ${port}-portda ishlamoqda`);
});

// 3. Botni sozlash
if (!process.env.BOT_TOKEN) {
    console.error("❌ XATO: BOT_TOKEN topilmadi!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
let adminState = {};

// 4. Yordamchi funksiyalar
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUnsubscribedChannels(ctx) {
    try {
        const channelsSnapshot = await db.collection('channels').get();
        let unsubscribed = [];

        for (const doc of channelsSnapshot.docs) {
            const ch = doc.data();
            if (ch.type === 'telegram') {
                try {
                    const member = await ctx.telegram.getChatMember(ch.channelId, ctx.from.id);
                    const isMember = ['member', 'administrator', 'creator'].includes(member.status);
                    if (!isMember) unsubscribed.push(ch);
                } catch (e) {
                    unsubscribed.push(ch); 
                }
            } else {
                unsubscribed.push(ch); 
            }
        }
        return unsubscribed;
    } catch (err) {
        console.error("DB dan kanallarni olishda xato:", err);
        return [];
    }
}

// 5. Start Buyrug'i
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userRef = db.collection('users').doc(userId.toString());

        await userRef.set({
            userId: userId,
            name: ctx.from.first_name,
            last_active: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (userId === ADMIN_ID) {
            return ctx.reply("🛠 Admin Panelga xush kelibsiz:", Markup.keyboard([
                ['📊 Statistika', '📢 Xabar yuborish'],
                ['➕ Link qo\'shish', '🗑 Linklarni boshqarish']
            ]).resize());
        }

        const unsubbed = await getUnsubscribedChannels(ctx);

        if (unsubbed.length === 0) {
            return ctx.reply(`👋 Xush kelibsiz ${ctx.from.first_name}! Marhamat, kino kodini yuboring.`);
        } else {
            const buttons = unsubbed.map((l) => [Markup.button.url(l.name, l.link)]);
            buttons.push([Markup.button.callback("✅ Tekshirish", "check_sub")]);
            return ctx.reply("🔴 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:", Markup.inlineKeyboard(buttons));
        }
    } catch (e) { console.error("Start Error:", e); }
});

// 6. Obunani tekshirish
bot.action('check_sub', async (ctx) => {
    try {
        const unsubbed = await getUnsubscribedChannels(ctx);
        if (unsubbed.length === 0) {
            await ctx.editMessageText("✅ Rahmat! Obuna tasdiqlandi. Endi kod yuborishingiz mumkin.");
        } else {
            await ctx.answerCbQuery("❌ Ba'zi kanallarga hali obuna bo'lmagansiz!", { show_alert: true });
        }
    } catch (e) { console.error("Action error:", e); }
});

// 7. Admin Funksiyalari
bot.hears('📊 Statistika', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const usersSnapshot = await db.collection('users').get();
    const channelsSnapshot = await db.collection('channels').get();
    ctx.reply(`📊 Statistika:\n👤 Foydalanuvchilar: ${usersSnapshot.size}\n📢 Kanallar: ${channelsSnapshot.size}`);
});

bot.hears('➕ Link qo\'shish', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply("Turini tanlang:", Markup.inlineKeyboard([
        [Markup.button.callback("🔹 Telegram (ID)", "add_tg")],
        [Markup.button.callback("🔸 Tashqi link", "add_ext")]
    ]));
});

bot.action('add_tg', ctx => { adminState[ctx.from.id] = { step: 'tg_id' }; ctx.reply("Kanal ID raqamini yuboring (-100...):"); });
bot.action('add_ext', ctx => { adminState[ctx.from.id] = { step: 'ext_name' }; ctx.reply("Tugma nomini yuboring:"); });

bot.hears('🗑 Linklarni boshqarish', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const channelsSnapshot = await db.collection('channels').get();
    if(channelsSnapshot.empty) return ctx.reply("Linklar yo'q.");
    
    for (const doc of channelsSnapshot.docs) {
        const l = doc.data();
        ctx.reply(`${l.name}\n${l.link}`, Markup.inlineKeyboard([[Markup.button.callback("❌ O'chirish", `del_${doc.id}`)]]));
    }
});

bot.action(/^del_(.+)$/, async (ctx) => {
    await db.collection('channels').doc(ctx.match[1]).delete();
    ctx.answerCbQuery("O'chirildi!");
    ctx.editMessageText("🗑 Link o'chirildi.");
});

bot.hears('📢 Xabar yuborish', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'ad_content' };
    ctx.reply("Reklama postini yuboring:");
});

// 8. Xabarlarni qayta ishlash
bot.on('message', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (userId === ADMIN_ID && adminState[userId]) {
        let state = adminState[userId];
        if (state.step === 'tg_id') { adminState[userId] = { step: 'tg_link', id: text }; return ctx.reply("Linkni yuboring:"); }
        if (state.step === 'tg_link') { 
            await db.collection('channels').add({ channelId: state.id, link: text, name: "📢 Kanal", type: 'telegram' }); 
            delete adminState[userId]; return ctx.reply("✅ Kanal saqlandi!"); 
        }
        if (state.step === 'ext_name') { adminState[userId] = { step: 'ext_link', name: text }; return ctx.reply("Linkni yuboring:"); }
        if (state.step === 'ext_link') { 
            await db.collection('channels').add({ channelId: 'none', link: text, name: state.name, type: 'external' }); 
            delete adminState[userId]; return ctx.reply("✅ Tashqi link saqlandi!"); 
        }
        if (state.step === 'ad_content') {
            adminState[userId] = { step: 'ad_btn', msgId: ctx.message.message_id };
            return ctx.reply("Tugma qo'shilsinmi?", Markup.inlineKeyboard([[Markup.button.callback("✅ Ha", "btn_yes"), Markup.button.callback("❌ Yo'q", "btn_no")]]));
        }
        if (state.step === 'ad_btn_data' && text) {
            const d = text.split('|');
            if (d.length < 2) return ctx.reply("Format xato! Nomi | Link");
            broadcast(ctx, state.msgId, Markup.inlineKeyboard([[Markup.button.url(d[0].trim(), d[1].trim())]]));
            delete adminState[userId]; return;
        }
    }

    if (text && !text.startsWith('/')) {
        const unsubbed = await getUnsubscribedChannels(ctx);
        if (unsubbed.length > 0) {
            const buttons = unsubbed.map((l) => [Markup.button.url(l.name, l.link)]);
            buttons.push([Markup.button.callback("✅ Tekshirish", "check_sub")]);
            return ctx.reply("⚠️ Kanallarga obuna bo'ling:", Markup.inlineKeyboard(buttons));
        }
        ctx.reply(`✅ Kod: ${text}. Qidirilmoqda...`);
    }
});

// 9. Reklama Funksiyasi
async function broadcast(ctx, msgId, kb = null) {
    const usersSnapshot = await db.collection('users').get();
    ctx.reply(`🚀 ${usersSnapshot.size} kishiga yuborish boshlandi...`);
    let count = 0; let blocked = 0;

    for (const doc of usersSnapshot.docs) {
        const u = doc.data();
        try { 
            await ctx.telegram.copyMessage(u.userId, ctx.from.id, msgId, kb); 
            count++;
            if (count % 25 === 0) await sleep(1000); 
        } catch (e) {
            if (e.response && (e.response.error_code === 403 || e.response.error_code === 400)) blocked++;
        }
    }
    ctx.reply(`✅ Yetkazildi: ${count}\n❌ Bloklagan yoki topilmagan: ${blocked}`);
}

bot.action('btn_yes', ctx => { adminState[ctx.from.id].step = 'ad_btn_data'; ctx.reply("Format: `Nomi | Link`", { parse_mode: 'Markdown' }); });
bot.action('btn_no', ctx => { 
    if(adminState[ctx.from.id]) { broadcast(ctx, adminState[ctx.from.id].msgId); delete adminState[ctx.from.id]; }
});

bot.catch((err) => console.error("🔴 Global xato:", err.message));

bot.launch().then(() => console.log("🚀 Bot Firestore bilan ishga tushdi!"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
