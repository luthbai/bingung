const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Buat folder temporary jika belum ada
const tempDir = './temp';
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Konfigurasi client dengan authentication local
const client = new Client({
    authStrategy: new LocalAuth(),
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
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// Event ketika QR code diperlukan
client.on('qr', (qr) => {
    console.log('\n📱 QR CODE DITERIMA:');
    console.log('1. Buka WhatsApp di HP Anda');
    console.log('2. Ketuk menu titik tiga (⋮) → Linked Devices → Link a Device');
    console.log('3. Scan QR code di bawah ini:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n✅ QR code berhasil di-generate!');
});

// Event ketika client ready
client.on('ready', () => {
    console.log('\n🤖 BOT WHATSAPP STICKER READY!');
    console.log('📝 Fitur yang tersedia:');
    console.log('   • !sticker - Buat stiker dari gambar');
    console.log('   • !sticker bg - Buat stiker dengan background transparan');
    console.log('   • !help - Menu bantuan');
    console.log('   • !ping - Cek status bot\n');
});

// Event ketika authentication berhasil
client.on('authenticated', () => {
    console.log('🔐 AUTHENTICATION BERHASIL!');
});

// Event ketika authentication gagal
client.on('auth_failure', (msg) => {
    console.error('❌ AUTHENTICATION GAGAL:', msg);
});

// Fungsi untuk memproses gambar menjadi stiker
async function processImageToSticker(media, removeBg = false) {
    try {
        // Decode base64 image
        const imageBuffer = Buffer.from(media.data, 'base64');
        
        // Process dengan sharp
        let processedImage;
        
        if (removeBg) {
            // Untuk remove background, kita akan coba membuat background transparan
            // Note: Ini adalah teknik sederhana, untuk hasil lebih baik butuh library khusus
            processedImage = await sharp(imageBuffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png() // Convert ke PNG dulu untuk transparency
                .toBuffer();
                
            // Convert PNG ke WebP dengan transparency
            processedImage = await sharp(processedImage)
                .webp({ quality: 80, effort: 6 })
                .toBuffer();
        } else {
            // Normal processing tanpa transparency
            processedImage = await sharp(imageBuffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .webp({ quality: 80 })
                .toBuffer();
        }
        
        return processedImage;
    } catch (error) {
        throw new Error(`Gagal memproses gambar: ${error.message}`);
    }
}

// Fungsi untuk membersihkan file temporary
function cleanupTempFiles() {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    files.forEach(file => {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > oneHour) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Membersihkan file temporary: ${file}`);
        }
    });
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
            await msg.reply('🏓 Pong!');
            const latency = Date.now() - start;
            await msg.reply(`⚡ Latency: ${latency}ms\n🕒 Server Time: ${new Date().toLocaleString('id-ID')}`);
            return;
        }

        // Perintah !help
        if (command === '!help' || command === '!menu') {
            const helpMessage = `🎨 *BOT STICKER WHATSAPP* 🎨

🤖 *Fitur yang tersedia:*
📸 *!sticker* - Balas gambar dengan caption ini atau kirim gambar lalu ketik !sticker
🌅 *!sticker bg* - Buat stiker dengan background transparan (experimental)
📊 *!ping* - Cek status dan latency bot
❓ *!help* - Menampilkan menu bantuan

📝 *Cara penggunaan:*
1. Kirim gambar ke bot atau group
2. Reply gambar tersebut dengan caption: !sticker
   ATAU
3. Kirim gambar dengan caption: !sticker

⚠️ *Catatan:*
- Gambar akan diresize ke 512x512 pixel
- Format output: WebP
- Bot mungkin lambat untuk gambar berukuran besar

🔧 *Developer: WhatsApp Sticker Bot*`;
            await msg.reply(helpMessage);
            return;
        }

        // Handle perintah stiker
        if (command === '!sticker' || command === '!stiker' || command === '!bg' || command === '!sticker bg') {
            const removeBackground = command.includes('bg');
            
            // Cek jika message memiliki media (gambar)
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
            await msg.reply(`❌ *Cara membuat stiker:*\n\n` +
                `1. *Kirim gambar* ke chat ini\n` +
                `2. *Reply gambar* tersebut dengan caption: *!sticker*\n` +
                `3. Atau kirim gambar dengan caption: *!sticker*\n\n` +
                `🔹 Gunakan *!sticker bg* untuk background transparan (experimental)\n` +
                `🔹 Ketik *!help* untuk menu lengkap`);
            return;
        }

        // Auto response untuk pesan yang mengandung "sticker"
        if (msg.body.toLowerCase().includes('sticker') && !msg.body.startsWith('!')) {
            await msg.reply(`🎨 Mau buat sticker? Kirim gambar dengan caption *!sticker* atau ketik *!help* untuk info lengkap!`);
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

// Fungsi untuk handle pembuatan stiker
async function handleStickerCreation(msg, removeBackground = false, originalMsg = null) {
    const chat = await msg.getChat();
    const user = originalMsg || msg;
    
    try {
        // Beri tahu sedang memproses
        await user.reply('⏳ Sedang memproses gambar...');

        // Download media
        const media = await msg.downloadMedia();
        
        if (!media) {
            await user.reply('❌ Gagal mengunduh gambar. Pastikan Anda mengirim gambar yang valid.');
            return;
        }

        // Validasi tipe media
        if (!media.mimetype.startsWith('image/')) {
            await user.reply('❌ File harus berupa gambar (JPEG, PNG, dll).');
            return;
        }

        // Process gambar
        const processedImage = await processImageToSticker(media, removeBackground);
        
        // Buat MessageMedia object
        const stickerMedia = new MessageMedia(
            'image/webp',
            processedImage.toString('base64'),
            'sticker.webp'
        );

        // Kirim sebagai stiker
        await client.sendMessage(msg.from, stickerMedia, {
            sendMediaAsSticker: true,
            stickerName: 'Sticker Bot',
            stickerAuthor: 'WhatsApp Sticker Bot',
            stickerCategories: ['Fun']
        });

        // Konfirmasi sukses
        await user.reply(`✅ Stiker berhasil dibuat! ${removeBackground ? '(Background transparan)' : ''}`);

    } catch (error) {
        console.error('Error creating sticker:', error);
        await user.reply(`❌ Gagal membuat stiker: ${error.message}`);
    }
}

// Handle error yang tidak tertangkap
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Cleanup temporary files setiap jam
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Initialize client
console.log('🚀 Starting WhatsApp Sticker Bot...');
client.initialize();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down bot...');
    await client.destroy();
    process.exit(0);
});
