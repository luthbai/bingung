const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const { exec, spawn } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

// Promisify exec untuk menggunakan async/await
const execAsync = util.promisify(exec);

// =============================================
// KONFIGURASI AWAL & SETUP ENVIRONMENT
// =============================================

console.log('🔧 Memeriksa environment...');

// Cek Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 16) {
    console.error('❌ Node.js versi 16 atau lebih tinggi diperlukan!');
    console.log(`📦 Versi Anda: ${nodeVersion}`);
    process.exit(1);
}

// Buat folder yang diperlukan
const folders = ['./temp', './sessions', './logs', './scan-results'];
folders.forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        console.log(`📁 Folder ${folder} dibuat`);
    }
});

// =============================================
// KONFIGURASI CLIENT WHATSAPP
// =============================================

console.log('🤖 Menginisialisasi WhatsApp Client...');

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "sticker-bot-pro",
        dataPath: "./sessions"
    }),
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
            '--disable-gpu',
            '--use-gl=egl',
            '--enable-webgl',
            '--window-size=1920,1080'
        ],
        executablePath: process.env.CHROME_PATH || undefined
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// =============================================
// VARIABEL GLOBAL & STATE MANAGEMENT
// =============================================

const botState = {
    isReady: false,
    isAuthenticated: false,
    qrGenerated: false,
    lastActivity: new Date()
};

const userCooldown = new Map();
const nmapCooldown = new Map();

// Daftar target yang diizinkan untuk scan (opsional, bisa dikosongkan untuk semua target)
const ALLOWED_SCAN_TARGETS = [
    'example.com',
    'localhost',
    '127.0.0.1'
    // Tambahkan domain/ip yang diizinkan di sini
];

// =============================================
// FUNGSI UTILITAS
// =============================================

function logWithTime(message) {
    const timestamp = new Date().toLocaleString('id-ID');
    console.log(`[${timestamp}] ${message}`);
}

function cleanupTempFiles() {
    try {
        const files = fs.readdirSync('./temp');
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        files.forEach(file => {
            const filePath = path.join('./temp', file);
            try {
                const stats = fs.statSync(filePath);
                if (now - stats.mtime.getTime() > oneHour) {
                    fs.unlinkSync(filePath);
                    logWithTime(`🧹 Membersihkan file: ${file}`);
                }
            } catch (error) {
                // Skip file yang tidak bisa diakses
            }
        });
    } catch (error) {
        logWithTime('❌ Error cleanup files: ' + error.message);
    }
}

function isUserInCooldown(userId, type = 'general') {
    const cooldownMap = type === 'nmap' ? nmapCooldown : userCooldown;
    const cooldownTime = type === 'nmap' ? 30000 : 3000; // 30 detik untuk nmap, 3 detik umum
    
    if (cooldownMap.has(userId)) {
        const lastTime = cooldownMap.get(userId);
        if (Date.now() - lastTime < cooldownTime) {
            return true;
        }
    }
    cooldownMap.set(userId, Date.now());
    return false;
}

// =============================================
// FUNGSI NMAP SCANNER
// =============================================

async function checkNmapInstallation() {
    try {
        await execAsync('which nmap');
        return true;
    } catch (error) {
        return false;
    }
}

async function handleNmapScan(msg, target, scanType = 'basic') {
    const userId = msg.from;
    
    try {
        // Cek apakah nmap terinstall
        const isNmapInstalled = await checkNmapInstallation();
        if (!isNmapInstalled) {
            await msg.reply('❌ Nmap tidak terinstall di sistem.\n\n' +
                          'Untuk install nmap:\n' +
                          '• Ubuntu/Debian: `sudo apt-get install nmap`\n' +
                          '• CentOS/RHEL: `sudo yum install nmap`\n' +
                          '• macOS: `brew install nmap`');
            return;
        }

        // Validasi target
        if (!target || target.trim() === '') {
            await msg.reply('❌ Harap sertakan target scan.\nContoh: !nmap example.com');
            return;
        }

        // Security: Validasi target (opsional)
        const cleanTarget = target.trim().toLowerCase();
        if (ALLOWED_SCAN_TARGETS.length > 0 && !ALLOWED_SCAN_TARGETS.includes(cleanTarget)) {
            await msg.reply('❌ Target tidak diizinkan untuk scan.');
            return;
        }

        // Cooldown check untuk nmap (30 detik)
        if (isUserInCooldown(userId, 'nmap')) {
            await msg.reply('⏳ Terlalu banyak request scan. Tunggu 30 detik lagi.');
            return;
        }

        // Beri tahu sedang memproses
        const processingMsg = await msg.reply(`🔍 Memulai scan ${scanType} untuk: ${cleanTarget}\n⏰ Ini mungkin membutuhkan waktu beberapa menit...`);

        let nmapCommand;
        let timeout = 120000; // 2 menit timeout

        switch (scanType) {
            case 'quick':
                nmapCommand = `nmap -T4 -F ${cleanTarget}`;
                timeout = 60000;
                break;
            case 'detailed':
                nmapCommand = `nmap -T4 -A -v ${cleanTarget}`;
                timeout = 180000;
                break;
            case 'port':
                nmapCommand = `nmap -T4 -p 1-1000 ${cleanTarget}`;
                timeout = 120000;
                break;
            case 'os':
                nmapCommand = `nmap -T4 -O ${cleanTarget}`;
                timeout = 120000;
                break;
            default: // basic
                nmapCommand = `nmap -T4 ${cleanTarget}`;
                timeout = 90000;
        }

        // Execute nmap command dengan timeout
        const scanPromise = execAsync(nmapCommand, { timeout });
        const { stdout, stderr } = await scanPromise;

        // Hapus pesan processing
        try {
            await processingMsg.delete(true);
        } catch (e) {
            // Ignore jika tidak bisa menghapus
        }

        if (stderr) {
            console.error('Nmap stderr:', stderr);
        }

        // Format hasil scan
        let resultMessage = `📊 *HASIL SCAN NMAP*\n\n`;
        resultMessage += `🎯 *Target:* ${cleanTarget}\n`;
        resultMessage += `🔧 *Tipe Scan:* ${scanType}\n`;
        resultMessage += `⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}\n\n`;
        resultMessage += '```\n' + stdout + '\n```';

        // Potong pesan jika terlalu panjang untuk WhatsApp
        if (resultMessage.length > 4096) {
            resultMessage = resultMessage.substring(0, 4090) + '...\n```';
        }

        await msg.reply(resultMessage);
        logWithTime(`✅ Scan nmap selesai untuk ${cleanTarget} oleh ${userId}`);

    } catch (error) {
        console.error('Nmap scan error:', error);
        
        let errorMessage = '❌ Gagal melakukan scan:\n';
        
        if (error.killed) {
            errorMessage += '• Scan timeout atau dibatalkan\n';
            errorMessage += '• Target mungkin tidak merespon\n';
            errorMessage += '• Coba scan type "quick" untuk scan lebih cepat';
        } else if (error.code === 'ENOENT') {
            errorMessage += '• Nmap tidak terinstall\n';
            errorMessage += '• Install dengan: sudo apt-get install nmap';
        } else {
            errorMessage += `• ${error.message}`;
        }

        await msg.reply(errorMessage);
    }
}

// =============================================
// FUNGSI PROSES GAMBAR UNTUK STIKER
// =============================================

async function processImageToSticker(media, options = {}) {
    const {
        removeBackground = false,
        quality = 85,
        resize = true
    } = options;

    try {
        const imageBuffer = Buffer.from(media.data, 'base64');
        
        // Validasi ukuran file
        if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB
            throw new Error('Ukuran gambar terlalu besar (max 10MB)');
        }

        let processedImage;
        const sharpInstance = sharp(imageBuffer);

        // Rotate gambar berdasarkan EXIF orientation
        const metadata = await sharpInstance.metadata();
        if (metadata.orientation && metadata.orientation > 1) {
            sharpInstance.rotate();
        }

        if (removeBackground) {
            // Teknik sederhana untuk background transparan
            processedImage = await sharpInstance
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toBuffer();
                
            processedImage = await sharp(processedImage)
                .webp({ 
                    quality: quality,
                    effort: 6,
                    nearLossless: true
                })
                .toBuffer();
        } else {
            // Normal processing dengan background putih
            processedImage = await sharpInstance
                .resize(resize ? 512 : null, resize ? 512 : null, {
                    fit: 'cover',
                    withoutEnlargement: true,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .webp({ 
                    quality: quality,
                    effort: 4
                })
                .toBuffer();
        }

        // Validasi ukuran stiker akhir
        if (processedImage.length > 100 * 1024) { // 100KB max untuk stiker
            throw new Error('Stiker terlalu besar setelah diproses. Coba gambar yang lebih kecil.');
        }

        return processedImage;
    } catch (error) {
        throw new Error(`Gagal memproses gambar: ${error.message}`);
    }
}

// =============================================
// EVENT HANDLERS WHATSAPP CLIENT
// =============================================

client.on('qr', (qr) => {
    botState.qrGenerated = true;
    console.log('\n' + '='.repeat(50));
    console.log('📱 QR CODE DITERIMA - SCAN SEKARANG!');
    console.log('='.repeat(50));
    
    // Generate QR code dengan format yang lebih jelas
    qrcode.generate(qr, {
        small: false
    });
    
    console.log('\n📝 PETUNJUK:');
    console.log('1. Buka WhatsApp di HP Anda');
    console.log('2. Ketuk ⋮ (menu) → Linked Devices → Link a Device');
    console.log('3. Scan QR code di atas');
    console.log('4. QR akan expired dalam 20 detik!');
    console.log('='.repeat(50) + '\n');
});

client.on('ready', () => {
    botState.isReady = true;
    botState.isAuthenticated = true;
    
    console.log('\n🎉 BOT WHATSAPP STICKER & NMAP READY!');
    console.log('🤖 Bot telah terhubung dan siap digunakan');
    console.log('⏰ Started at: ' + new Date().toLocaleString('id-ID'));
    console.log('\n📋 FITUR YANG TERSEDIA:');
    console.log('   📸 !sticker    - Buat stiker dari gambar');
    console.log('   🌅 !sticker bg - Stiker background transparan');
    console.log('   🔍 !nmap       - Scan website/port');
    console.log('   📊 !ping       - Cek status bot');
    console.log('   ❓ !help       - Menu bantuan lengkap');
    console.log('   ℹ️  !info       - Info bot\n');
});

client.on('authenticated', () => {
    botState.isAuthenticated = true;
    logWithTime('✅ Authentication berhasil! Session tersimpan.');
});

client.on('auth_failure', (msg) => {
    console.error('❌ AUTHENTICATION GAGAL:', msg);
    console.log('💡 Coba hapus folder sessions/ dan jalankan ulang bot');
});

client.on('disconnected', (reason) => {
    botState.isReady = false;
    console.log('❌ Client terputus:', reason);
    console.log('🔄 Menjalankan ulang bot...');
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// =============================================
// FUNGSI HANDLER PESAN - STICKER
// =============================================

async function handleStickerCreation(msg, removeBackground = false, originalMsg = null) {
    const user = originalMsg || msg;
    const userId = user.from;
    
    try {
        // Cooldown check
        if (isUserInCooldown(userId)) {
            await user.reply('⏳ Terlalu banyak request. Tunggu 3 detik lagi.');
            return;
        }

        // Beri tahu sedang memproses
        const processingMsg = await user.reply('🔄 Sedang memproses gambar...');

        // Download media
        const media = await msg.downloadMedia();
        
        if (!media) {
            await user.reply('❌ Gagal mengunduh gambar. Pastikan format didukung (JPEG, PNG, WebP).');
            return;
        }

        // Validasi tipe media
        if (!media.mimetype.startsWith('image/')) {
            await user.reply('❌ File harus berupa gambar. Format yang didukung: JPEG, PNG, WebP');
            return;
        }

        // Process gambar
        const processedImage = await processImageToSticker(media, { 
            removeBackground: removeBackground 
        });
        
        // Buat MessageMedia object
        const stickerMedia = new MessageMedia(
            'image/webp',
            processedImage.toString('base64'),
            'sticker.webp'
        );

        // Hapus pesan "sedang memproses"
        if (processingMsg.id) {
            try {
                await processingMsg.delete(true);
            } catch (e) {
                // Ignore jika tidak bisa menghapus
            }
        }

        // Kirim sebagai stiker
        await client.sendMessage(msg.from, stickerMedia, {
            sendMediaAsSticker: true,
            stickerName: 'Sticker Bot',
            stickerAuthor: 'WhatsApp Sticker Bot',
            stickerCategories: ['😄', '🎨']
        });

        logWithTime(`✅ Stiker dibuat untuk ${userId}`);

    } catch (error) {
        console.error('Error creating sticker:', error);
        const errorMsg = error.message.includes('besar') 
            ? '❌ Gambar terlalu besar. Coba gambar yang lebih kecil.'
            : `❌ Gagal membuat stiker: ${error.message}`;
        
        await user.reply(errorMsg);
    }
}

// =============================================
// FUNGSI HANDLER PESAN - HELP & INFO
// =============================================

async function handleHelpMessage(msg) {
    const helpMessage = `🎨 *WHATSAPP BOT PRO* 🎨

*FITUR UTAMA:*
📸 *!sticker* - Buat stiker dari gambar
🌅 *!sticker bg* - Stiker dengan background transparan
🔍 *!nmap* - Scan website/port jaringan
📊 *!ping* - Cek status bot
ℹ️  *!info* - Informasi bot
❓ *!help* - Menu ini

*FITUR NMAP SCAN:*
🔍 *!nmap <target>* - Scan basic
⚡ *!nmap quick <target>* - Scan cepat
📋 *!nmap detailed <target>* - Scan detail
🔢 *!nmap port <target>* - Scan port 1-1000
💻 *!nmap os <target>* - Deteksi OS

*CONTOH NMAP:*
• !nmap example.com
• !nmap quick 192.168.1.1
• !nmap detailed google.com
• !nmap port localhost

*CATATAN:*
- Scan nmap membutuhkan waktu 1-3 menit
- Pastikan nmap terinstall di sistem
- Gunakan untuk tujuan edukasi/keamanan
- Batasan: 1 scan per 30 detik

_Developer: WhatsApp Bot Pro v3.0_`;

    await msg.reply(helpMessage);
}

async function handleInfoMessage(msg) {
    const nmapStatus = await checkNmapInstallation() ? '✅ Terinstall' : '❌ Tidak terinstall';
    
    const infoMessage = `🤖 *INFORMASI BOT*

*Version:* 3.0.0
*Status:* ${botState.isReady ? '🟢 ONLINE' : '🔴 OFFLINE'}
*Nmap:* ${nmapStatus}
*Uptime:* ${process.uptime().toFixed(0)} detik
*Node.js:* ${process.version}
*Memory:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB

*Fitur:*
✅ Pembuat stiker otomatis
✅ Scan website dengan nmap  
✅ Support background transparan
✅ Session persistence
✅ Multi-scan types
✅ Security cooldown

*Update Terbaru:*
- Tambahan fitur nmap scanner
- Multiple scan types
- Improved error handling
- Better performance

_Github: https://github.com/your-repo_`;

    await msg.reply(infoMessage);
}

// =============================================
// MESSAGE EVENT HANDLER
// =============================================

client.on('message', async (msg) => {
    try {
        // Skip pesan dari status/broadcast atau pesan sendiri
        if (msg.from === 'status@broadcast' || msg.isStatus || msg.fromMe) {
            return;
        }

        botState.lastActivity = new Date();
        const command = msg.body.toLowerCase().trim();

        // Perintah !ping
        if (command === '!ping') {
            const start = Date.now();
            const pingMsg = await msg.reply('🏓 Pong!');
            const latency = Date.now() - start;
            
            const nmapStatus = await checkNmapInstallation() ? '✅' : '❌';
            
            await msg.reply(`📊 *STATUS BOT*\n\n` +
                          `⚡ Latency: ${latency}ms\n` +
                          `🕒 Uptime: ${(process.uptime() / 60).toFixed(1)} menit\n` +
                          `💾 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\n` +
                          `🔧 Nmap: ${nmapStatus}\n` +
                          `✅ Status: ${botState.isReady ? 'ONLINE' : 'OFFLINE'}`);
            return;
        }

        // Perintah !help
        if (command === '!help' || command === '!menu') {
            await handleHelpMessage(msg);
            return;
        }

        // Perintah !info
        if (command === '!info' || command === '!about') {
            await handleInfoMessage(msg);
            return;
        }

        // Handle perintah nmap scan
        if (command.startsWith('!nmap')) {
            const parts = command.split(' ');
            let scanType = 'basic';
            let target = '';

            if (parts.length === 2) {
                // Format: !nmap target
                target = parts[1];
            } else if (parts.length === 3) {
                // Format: !nmap type target
                scanType = parts[1];
                target = parts[2];
            }

            const validScanTypes = ['basic', 'quick', 'detailed', 'port', 'os'];
            if (!validScanTypes.includes(scanType)) {
                // Jika type tidak valid, anggap sebagai target
                target = parts.slice(1).join(' ');
                scanType = 'basic';
            }

            if (!target) {
                await msg.reply(`❌ Format perintah nmap:\n\n` +
                              `• !nmap <target>\n` +
                              `• !nmap quick <target>\n` +
                              `• !nmap detailed <target>\n` +
                              `• !nmap port <target>\n` +
                              `• !nmap os <target>\n\n` +
                              `Contoh: !nmap example.com`);
                return;
            }

            await handleNmapScan(msg, target, scanType);
            return;
        }

        // Handle perintah stiker
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
            
            // Jika tidak ada media, beri petunjuk
            await msg.reply(`📸 *Cara Membuat Stiker:*\n\n` +
                `1. *Kirim gambar* ke chat ini\n` +
                `2. *Reply gambar* tersebut dengan: *!sticker*\n` +
                `3. Atau kirim gambar dengan caption: *!sticker*\n\n` +
                `🔹 *!sticker bg* = Background transparan\n` +
                `🔹 *!help* = Menu lengkap\n` +
                `🔹 *!info* = Informasi bot`);
            return;
        }

        // Auto response untuk kata kunci
        if ((msg.body.toLowerCase().includes('sticker') || 
             msg.body.toLowerCase().includes('stiker') ||
             msg.body.toLowerCase().includes('scan') ||
             msg.body.toLowerCase().includes('nmap')) && 
            !msg.body.startsWith('!')) {
            await msg.reply(`🎨 Mau buat stiker atau scan website?\n\n` +
                          `📸 Stiker: Kirim gambar dengan caption *!sticker*\n` +
                          `🔍 Scan: Ketik *!nmap example.com*\n` +
                          `📋 Info: Ketik *!help* untuk menu lengkap`);
        }

    } catch (error) {
        logWithTime('❌ Error handling message: ' + error.message);
        try {
            await msg.reply('❌ Terjadi error internal. Silakan coba lagi atau hubungi developer.');
        } catch (e) {
            // Ignore jika tidak bisa reply
        }
    }
});

// =============================================
// INISIALISASI & MAINTENANCE
// =============================================

// Cleanup temporary files setiap 30 menit
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// Log status setiap 1 jam
setInterval(() => {
    if (botState.isReady) {
        logWithTime('🤖 Bot masih berjalan...');
    }
}, 60 * 60 * 1000);

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Menghentikan bot...');
    try {
        await client.destroy();
        console.log('✅ Bot berhasil dihentikan');
    } catch (error) {
        console.error('❌ Error saat menghentikan:', error);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Menghentikan bot (SIGTERM)...');
    await client.destroy();
    process.exit(0);
});

// =============================================
// START BOT
// =============================================

console.log('🚀 STARTING WHATSAPP STICKER & NMAP BOT...');
console.log('📦 Node.js: ' + process.version);
console.log('📁 Directory: ' + process.cwd());
console.log('⏰ Time: ' + new Date().toLocaleString('id-ID'));

// Check nmap installation saat startup
checkNmapInstallation().then(installed => {
    if (installed) {
        console.log('🔧 Nmap: ✅ Terinstall');
    } else {
        console.log('🔧 Nmap: ❌ Tidak terinstall');
        console.log('💡 Install dengan: sudo apt-get install nmap');
    }
});

// Jalankan bot
client.initialize();
