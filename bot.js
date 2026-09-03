const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let lastUpdateId = 0;

async function sendTelegram(method, body) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) { 
        return null; 
    }
}

async function checkUpdates() {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`);
        const data = await res.json();
        
        console.log("Ответ от Telegram:", JSON.stringify(data));
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                const msg = update.message;
                if (!msg || !msg.text) continue;
                
                const chatId = msg.chat.id;
                const userText = msg.text.trim();

                const statusMsg = await sendTelegram('sendMessage', { 
                    chat_id: chatId, 
                    text: '⚡ Читаю статтю та готую пост...' 
                });

                try {
                    let articleText = userText;

                    if (userText.startsWith('http')) {
                        try {
                            const pageRes = await fetch(userText);
                            const html = await pageRes.text();
                            articleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
                        } catch (e) {
                            articleText = userText;
                        }
                    }

                    const prompt = `Ти професійний редактор українського Telegram-каналу. Напиши якісний і лаконічний пост українською мовою (без русизмів) на основі тексту: ${articleText}. Дотримуйся фактів, ліміт до 1000 символів, обов'язково додай в кінці актуальні хештеги.`;

                    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    });

                    const geminiData = await geminiRes.json();
                    const postText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (statusMsg?.result?.message_id) {
                        await sendTelegram('deleteMessage', { chat_id: chatId, message_id: statusMsg.result.message_id });
                    }

                    if (postText) {
                        const replyMarkup = userText.startsWith('http') 
                            ? { inline_keyboard: [[{ text: '🔗 Джерело', url: userText }]] } 
                            : undefined;

                        await sendTelegram('sendMessage', {
                            chat_id: chatId,
                            text: postText.trim(),
                            reply_markup: replyMarkup
                        });
                    } else {
                        await sendTelegram('sendMessage', { chat_id: chatId, text: '❌ Помилка генерації тексту.' });
                    }
                } catch (err) {
                    if (statusMsg?.result?.message_id) {
                        await sendTelegram('deleteMessage', { chat_id: chatId, message_id: statusMsg.result.message_id });
                    }
                    await sendTelegram('sendMessage', { chat_id: chatId, text: '❌ Помилка обробки.' });
                }
            }
        }
    } catch (e) {
        console.error('Помилка checkUpdates:', e);
    }
}

console.log('🚀 Бот запущено у хмарі!');

async function startPolling() {
    while (true) {
        try {
            await checkUpdates();
        } catch (err) {
            console.error('Помилка оновлення:', err);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

startPolling();
