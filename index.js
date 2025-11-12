const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Buat folder temporary untuk penyimpanan sementara
const tempDir = './temp';
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Konfigurasi client WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Session tersimpan lokal
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// Event QR Code
client.on('qr', (qr) => {
    console.log('\n📱 QR CODE DITERIMA:');
    console.log('1. Buka WhatsApp → Linked Devices → Link a Device');
    console.log('2. Scan QR code di bawah ini:\n');
    qrcode.generate(qr, { small: true });
});

// Event ketika bot ready
client.on('ready', () => {
    console.log('\n✅ BOT WHATSAPP STICKER READY!');
    console.log('🤖 Bot telah terhubung dan siap menerima pesan');
});

// Event authentication berhasil
client.on('authenticated', () => {
    console.log('🔐 AUTHENTICATION BERHASIL!');
});

// Fungsi untuk memproses gambar menjadi stiker
async function processImageToSticker(media, options = {}) {
    try {
        const { removeBackground = false, quality = 80 } = options;
        
        // Decode base64 image
        const imageBuffer = Buffer.from(media.data, 'base64');
        
        // Process dengan sharp
        let processedImage;
        
        if (removeBackground) {
            // Teknik sederhana untuk background transparan
            processedImage = await sharp(imageBuffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();
                
            // Convert ke WebP dengan transparency
            processedImage = await sharp(processedImage)
                .webp({ quality: quality, effort: 6 })
                .toBuffer();
        } else {
            // Normal processing
            processedImage = await sharp(imageBuffer)
                .resize(512, 512, {
                    fit: 'cover',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .webp({ quality: quality })
                .toBuffer();
        }
        
        return processedImage;
    } catch (error) {
        throw new Error(`Gagal memproses gambar: ${error.message}`);
    }
}

// Fungsi utama untuk membuat stiker
async function handleStickerCreation(msg, removeBackground = false, originalMsg = null) {
    const user = originalMsg || msg;
    
    try {
        // Beri tahu sedang memproses
        await user.reply('⏳ Sedang memproses gambar menjadi stiker...');

        // Download media
        const media = await msg.downloadMedia();
        
        if (!media) {
            await user.reply('❌ Gagal mengunduh gambar. Pastikan format gambar didukung.');
            return;
        }

        // Validasi tipe media
        if (!media.mimetype.startsWith('image/')) {
            await user.reply('❌ File harus berupa gambar (JPEG, PNG, dll).');
            return;
        }

        // Process gambar menjadi stiker
        const processedImage = await processImageToSticker(media, { 
            removeBackground: removeBackground 
        });
        
        // Buat MessageMedia object untuk stiker
        const stickerMedia = new MessageMedia(
            'image/webp', // Format WebP untuk stiker
            processedImage.toString('base64'),
            'sticker.webp'
        );

        // Kirim sebagai stiker dengan metadata
        await client.sendMessage(msg.from, stickerMedia, {
            sendMediaAsSticker: true,
            stickerName: 'Stiker Bot',
            stickerAuthor: 'WhatsApp Sticker Bot',
            stickerCategories: ['Fun', 'Creative']
        });

        // Konfirmasi sukses
        await user.reply(`✅ Stiker berhasil dibuat! ${removeBackground ? '(Background transparan)' : ''}`);

    } catch (error) {
        console.error('Error creating sticker:', error);
        await user.reply(`❌ Gagal membuat stiker: ${error.message}\nCoba gunakan gambar dengan kualitas lebih rendah.`);
    }
}

// Event listener untuk pesan
client.on('message', async (msg) => {
    try {
        // Skip pesan dari status atau broadcast
        if (msg.from === 'status@broadcast' || msg.isStatus) {
            return;
        }

        const command = msg.body.toLowerCase().trim();
        const isGroup = msg.from.endsWith('@g.us');

        // Perintah !ping
        if (command === '!ping') {
            const start = Date.now();
            const pingMsg = await msg.reply('🏓 Pong!');
            const latency = Date.now() - start;
            await msg.reply(`⚡ Latency: ${latency}ms\n🕒 Server Time: ${new Date().toLocaleString('id-ID')}`);
            return;
        }

        // Perintah !help atau !menu
        if (command === '!help' || command === '!menu') {
            const helpMessage = `🎨 *BOT STICKER WHATSAPP* 🎨

🤖 *Fitur yang tersedia:*
📸 *!sticker* - Balas gambar dengan ini atau kirim gambar + !sticker
🌅 *!sticker bg* - Buat stiker dengan background transparan
📊 *!ping* - Cek status bot
❓ *!help* - Menu bantuan

📝 *Cara penggunaan:*
1. Kirim gambar ke bot/group
2. Reply gambar tersebut dengan: *!sticker*
   ATAU
3. Kirim gambar dengan caption: *!sticker*

⚠️ *Spesifikasi teknis:*
- Format: WebP
- Ukuran: 512x512 pixels
- Max size: 100KB (static)

🔧 *Tips:*
- Gunakan gambar dengan latar belakang polos untuk hasil terbaik
- Gambar berukuran besar mungkin perlu waktu proses lebih lama`;
            await msg.reply(helpMessage);
            return;
        }

        // Handle perintah stiker utama
        if (command === '!sticker' || command === '!stiker' || command === '!bg' || command === '!sticker bg') {
            const removeBackground = command.includes('bg');
            
            // Cek jika message memiliki media
            if (msg.hasMedia) {
                await handleStickerCreation(msg, removeBackground);
                return;
            }
            
            // Cek jika message adalah reply ke gambar
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg.hasMedia) {
                    await handleStickerCreation(quotedMsg, removeBackground, msg);
                    return;
                }
            }
            
            // Jika tidak ada media
            await msg.reply(`📸 *Cara membuat stiker:*\n\n` +
                `1. *Kirim gambar* ke chat ini\n` +
                `2. *Reply gambar* tersebut dengan: *!sticker*\n` +
                `3. Atau kirim gambar dengan caption: *!sticker*\n\n` +
                `🎨 *Opsi lanjutan:*\n` +
                `• *!sticker bg* - Background transparan\n` +
                `• *!help* - Menu lengkap`);
            return;
        }

        // Auto response untuk kata kunci "sticker"
        if ((msg.body.toLowerCase().includes('sticker') || msg.body.toLowerCase().includes('stiker')) && !msg.body.startsWith('!')) {
            await msg.reply(`🎨 Mau buat stiker? Kirim gambar dengan caption *!sticker* atau ketik *!help* untuk info lengkap!`);
        }

    } catch (error) {
        console.error('Error handling message:', error);
        try {
            await msg.reply('❌ Terjadi error saat memproses permintaan. Silakan coba lagi.');
        } catch (e) {
            console.error('Gagal mengirim pesan error:', e);
        }
    }
});

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Initialize client
console.log('🚀 Starting WhatsApp Sticker Bot...');
client.initialize();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot gracefully...');
    await client.destroy();
    process.exit(0);
});
