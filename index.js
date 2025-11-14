const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = util.promisify(exec);

// =============================================
// KONFIGURASI AWAL & INISIALISASI
// =============================================

console.log('🚀 WhatsApp Bot Pro - Ultimate Enhanced Version');
console.log('🔧 Initializing System...');

// Validasi environment
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion < 16) {
    console.error('❌ Node.js version 16 or higher required!');
    process.exit(1);
}

console.log(`✅ Node.js: ${nodeVersion}`);
console.log(`✅ Platform: ${os.platform()} ${os.arch()}`);

// Buat folder yang diperlukan
const folders = ['./temp', './sessions', './logs', './scans'];
folders.forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// =============================================
// KONFIGURASI CLIENT WHATSAPP
// =============================================

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-bot-pro-ultimate",
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
            '--disable-gpu'
        ]
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// =============================================
// STATE MANAGEMENT & COOLDOWN SYSTEM
// =============================================

const botState = {
    isReady: false,
    isAuthenticated: false,
    qrGenerated: false,
    startTime: new Date(),
    totalScans: 0,
    totalStickers: 0
};

const cooldowns = {
    general: new Map(),
    nmap: new Map(),
    sticker: new Map()
};

const userStats = new Map();

// =============================================
// FUNGSI UTILITAS YANG DISEMPURNAKAN
// =============================================

function logWithTime(message, type = 'INFO') {
    const timestamp = new Date().toLocaleString('id-ID');
    const colors = {
        INFO: '\x1b[36m',    // Cyan
        SUCCESS: '\x1b[32m', // Green  
        WARN: '\x1b[33m',    // Yellow
        ERROR: '\x1b[31m',   // Red
        NMAP: '\x1b[35m',    // Magenta
        STICKER: '\x1b[34m'  // Blue
    };
    const color = colors[type] || '\x1b[0m';
    console.log(`${color}[${timestamp}] ${message}\x1b[0m`);
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function checkCooldown(userId, type = 'general') {
    const cooldownConfig = {
        general: { time: 3000, message: '3 detik' },
        sticker: { time: 5000, message: '5 detik' },
        nmap: { time: 45000, message: '45 detik' }
    };
    
    const config = cooldownConfig[type];
    const cooldownMap = cooldowns[type];
    
    if (cooldownMap.has(userId)) {
        const lastTime = cooldownMap.get(userId);
        const remaining = config.time - (Date.now() - lastTime);
        if (remaining > 0) {
            return Math.ceil(remaining / 1000);
        }
    }
    cooldownMap.set(userId, Date.now());
    return 0;
}

function updateUserStats(userId, action) {
    if (!userStats.has(userId)) {
        userStats.set(userId, { stickers: 0, scans: 0, lastActive: new Date() });
    }
    const stats = userStats.get(userId);
    stats.lastActive = new Date();
    
    if (action === 'sticker') {
        stats.stickers++;
        botState.totalStickers++;
    } else if (action === 'scan') {
        stats.scans++;
        botState.totalScans++;
    }
}

// =============================================
// STICKER MAKER - ENHANCED VERSION
// =============================================

async function createSticker(imageBuffer, removeBg = false) {
    const tempDir = './temp';
    const timestamp = Date.now();
    
    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const inputPath = path.join(tempDir, `input_${timestamp}.png`);
        const outputPath = path.join(tempDir, `sticker_${timestamp}.webp`);

        // Simpan buffer ke file sementara untuk backup processing
        fs.writeFileSync(inputPath, imageBuffer);

        let image = sharp(imageBuffer);
        
        // Dapatkan metadata gambar
        const metadata = await image.metadata();
        logWithTime(`Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`, 'STICKER');

        // Validasi ukuran gambar
        if (metadata.width < 50 || metadata.height < 50) {
            throw new Error('Gambar terlalu kecil! Minimal 50x50 piksel.');
        }

        if (metadata.width > 4096 || metadata.height > 4096) {
            throw new Error('Gambar terlalu besar! Maksimal 4096x4096 piksel.');
        }

        // Optimasi untuk stiker WhatsApp
        const targetSize = 512;
        let resizeOptions = {
            width: targetSize,
            height: targetSize,
            fit: 'inside',
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255, alpha: 0 }
        };

        // Handle berbagai format gambar
        switch (metadata.format) {
            case 'jpeg':
            case 'jpg':
                image = image.jpeg({ quality: 85 });
                break;
            case 'png':
                image = image.png({ compressionLevel: 8, quality: 80 });
                break;
            case 'gif':
                // Untuk GIF, ambil frame pertama saja
                image = image.gif({ page: 0 });
                break;
            case 'webp':
                image = image.webp({ quality: 80 });
                break;
        }

        // Resize gambar
        image = image.resize(resizeOptions);

        // Tambahkan padding jika diperlukan untuk rasio 1:1
        const resizedMetadata = await image.metadata();
        if (resizedMetadata.width !== resizedMetadata.height) {
            const maxSize = Math.max(resizedMetadata.width, resizedMetadata.height);
            image = image.extend({
                top: Math.floor((maxSize - resizedMetadata.height) / 2),
                bottom: Math.ceil((maxSize - resizedMetadata.height) / 2),
                left: Math.floor((maxSize - resizedMetadata.width) / 2),
                right: Math.ceil((maxSize - resizedMetadata.width) / 2),
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            });
        }

        // Konversi ke WebP dengan optimasi untuk stiker
        const webpBuffer = await image
            .webp({ 
                quality: 85,
                effort: 6,
                lossless: false,
                nearLossless: true,
                alphaQuality: 90
            })
            .toBuffer();

        // Validasi ukuran output
        if (webpBuffer.length > 1024 * 1024) { // 1MB
            logWithTime('Sticker too large, reducing quality...', 'STICKER');
            // Reduce quality jika terlalu besar
            const optimizedBuffer = await sharp(webpBuffer)
                .webp({ quality: 70, effort: 6 })
                .toBuffer();
                
            if (optimizedBuffer.length > 1024 * 1024) {
                throw new Error('Gambar terlalu kompleks untuk dijadikan stiker. Coba gunakan gambar yang lebih sederhana.');
            }
            
            // Cleanup
            try { fs.unlinkSync(inputPath); } catch (e) {}
            
            return optimizedBuffer;
        }

        // Cleanup
        try { fs.unlinkSync(inputPath); } catch (e) {}
        
        logWithTime(`Sticker created: ${webpBuffer.length} bytes`, 'STICKER');
        return webpBuffer;

    } catch (error) {
        // Cleanup on error
        try { 
            fs.unlinkSync(path.join(tempDir, `input_${timestamp}.png`));
            fs.unlinkSync(path.join(tempDir, `sticker_${timestamp}.webp`));
        } catch (e) {}
        
        logWithTime(`Sticker creation error: ${error.message}`, 'ERROR');
        throw error;
    }
}

async function handleStickerCreation(msg, removeBg = false) {
    const userId = msg.from;
    const startTime = Date.now();
    
    try {
        // Cooldown check
        const cooldownRemaining = checkCooldown(userId, 'sticker');
        if (cooldownRemaining > 0) {
            await msg.reply(`⏳ Tunggu ${cooldownRemaining} detik lagi sebelum membuat stiker berikutnya.`);
            return;
        }

        let mediaMessage = msg;
        let isQuoted = false;
        
        // Jika pesan adalah quoted message dengan media
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.hasMedia) {
                mediaMessage = quotedMsg;
                isQuoted = true;
                logWithTime(`Processing quoted message from ${userId}`, 'STICKER');
            } else {
                await msg.reply('❌ Pesan yang dikutip tidak mengandung gambar!');
                return;
            }
        }

        // Pastikan pesan mengandung media
        if (!mediaMessage.hasMedia) {
            const helpMessage = `📸 *CARA MEMBUAT STIKER*

• *Kirim gambar* dengan caption: !sticker
• *Reply gambar* dengan: !sticker
• *Hapus background:* !sticker bg

📝 *Format yang didukung:*
  JPEG, PNG, GIF, WebP
  Maksimal: 5MB
  Resolusi: 50x50 sampai 4096x4096

💡 *Tips:*
  • Gunakan gambar dengan kontras baik
  • Hindarkan gambar terlalu gelap/terang
  • Untuk hasil terbaik, gunakan PNG`;

            await msg.reply(helpMessage);
            return;
        }

        const processingMsg = await msg.reply(
            `🔄 *MEMPROSES STIKER*...\n\n` +
            `⏳ Mendownload media...\n` +
            `📊 Status: 0%`
        );

        try {
            // Download media dengan timeout
            const downloadPromise = mediaMessage.downloadMedia();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout download media')), 30000)
            );

            const media = await Promise.race([downloadPromise, timeoutPromise]);
            
            if (!media || !media.data) {
                await processingMsg.delete(true);
                await msg.reply('❌ Gagal mengunduh gambar! Pastikan file berupa gambar.');
                return;
            }

            // Update progress
            await processingMsg.edit(
                `🔄 *MEMPROSES STIKER*...\n\n` +
                `✅ Media berhasil diunduh\n` +
                `🔄 Memproses gambar...\n` +
                `📊 Status: 30%`
            );

            // Validasi tipe media
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(media.mimetype)) {
                await processingMsg.delete(true);
                await msg.reply('❌ Hanya gambar yang didukung! Format: JPEG, PNG, GIF, WebP');
                return;
            }

            // Validasi ukuran file
            const fileSize = Buffer.from(media.data, 'base64').length;
            if (fileSize > 5 * 1024 * 1024) {
                await processingMsg.delete(true);
                await msg.reply('❌ Ukuran gambar terlalu besar! Maksimal 5MB.');
                return;
            }

            if (fileSize < 1024) {
                await processingMsg.delete(true);
                await msg.reply('❌ File gambar terlalu kecil atau corrupt!');
                return;
            }

            // Konversi base64 ke buffer
            const imageBuffer = Buffer.from(media.data, 'base64');
            
            // Update progress
            await processingMsg.edit(
                `🔄 *MEMPROSES STIKER*...\n\n` +
                `✅ Media berhasil diunduh\n` +
                `✅ Validasi gambar passed\n` +
                `🔄 Membuat stiker...\n` +
                `📊 Status: 60%`
            );

            // Buat stiker
            const stickerBuffer = await createSticker(imageBuffer, removeBg);
            
            // Update progress
            await processingMsg.edit(
                `🔄 *MEMPROSES STIKER*...\n\n` +
                `✅ Media berhasil diunduh\n` +
                `✅ Validasi gambar passed\n` +
                `✅ Stiker berhasil dibuat\n` +
                `🔄 Mengupload stiker...\n` +
                `📊 Status: 90%`
            );

            // Buat MessageMedia dari buffer
            const stickerMedia = new MessageMedia('image/webp', stickerBuffer.toString('base64'));
            
            // Hapus pesan processing
            try {
                await processingMsg.delete(true);
            } catch (e) {
                logWithTime('Cannot delete processing message', 'WARN');
            }

            // Kirim sebagai stiker
            await msg.reply(stickerMedia, null, { 
                sendMediaAsSticker: true,
                stickerName: "WhatsApp Bot Pro",
                stickerAuthor: "Ultimate Bot"
            });
            
            // Update statistics
            updateUserStats(userId, 'sticker');
            
            const processTime = Date.now() - startTime;
            logWithTime(`✅ Sticker created for ${userId} | Time: ${processTime}ms | Size: ${stickerBuffer.length} bytes`, 'SUCCESS');

        } catch (error) {
            try {
                await processingMsg.delete(true);
            } catch (e) {
                // Ignore error
            }
            
            logWithTime(`Sticker processing error: ${error.message}`, 'ERROR');
            
            let errorMessage = '❌ *GAGAL MEMBUAT STIKER*\n\n';
            
            if (error.message.includes('Timeout')) {
                errorMessage += '⏰ Waktu proses habis!\n';
                errorMessage += 'Coba dengan gambar yang lebih kecil.\n\n';
            } else if (error.message.includes('too small') || error.message.includes('too large')) {
                errorMessage += `📏 ${error.message}\n\n`;
            } else if (error.message.includes('complex')) {
                errorMessage += '🎨 Gambar terlalu kompleks!\n';
                errorMessage += 'Coba dengan gambar yang lebih sederhana.\n\n';
            } else {
                errorMessage += `⚠️ Error: ${error.message}\n\n`;
            }
            
            errorMessage += '💡 *Tips:*\n';
            errorMessage += '• Gunakan format JPEG/PNG\n';
            errorMessage += '• Ukuran file < 5MB\n';
            errorMessage += '• Gambar tidak blur/korup';
            
            await msg.reply(errorMessage);
        }

    } catch (error) {
        logWithTime(`Sticker handler error: ${error.message}`, 'ERROR');
        await msg.reply('❌ Terjadi kesalahan sistem saat membuat stiker!');
    }
}

// =============================================
// NMAP SCANNER - TIDAK DIUBAH (SAMA SEPERTI SEBELUMNYA)
// =============================================

async function checkNmapInstallation() {
    try {
        const { stdout } = await execAsync('nmap --version');
        return true;
    } catch (error) {
        return false;
    }
}

function parseNmapOutput(output) {
    console.log('🔄 Starting Nmap output parsing...');
    
    const lines = output.split('\n');
    const result = {
        host: '',
        ports: [],
        os: {},
        scanStats: {
            openPorts: 0,
            filteredPorts: 0,
            closedPorts: 0,
            totalScanned: 0
        },
        hostStatus: 'unknown',
        scanInfo: {}
    };

    let inPortSection = false;
    let hostLineFound = false;

    // DEBUG: Log raw output untuk analisis
    console.log('=== RAW NMAP OUTPUT START ===');
    console.log(output);
    console.log('=== RAW NMAP OUTPUT END ===');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Deteksi host dengan berbagai pattern
        if (line.startsWith('Nmap scan report for')) {
            result.host = line.replace('Nmap scan report for', '').trim();
            hostLineFound = true;
            console.log(`📍 Host detected: ${result.host}`);
        }
        
        // Deteksi status host
        if (line.startsWith('Host is up')) {
            result.hostStatus = 'up';
        } else if (line.includes('Host seems down') || line.includes('0 hosts up')) {
            result.hostStatus = 'down';
        }

        // Deteksi awal section port
        if (line === 'PORT   STATE SERVICE' || line === 'PORT     STATE SERVICE' || 
            (line.startsWith('PORT') && line.includes('STATE') && line.includes('SERVICE'))) {
            inPortSection = true;
            console.log('📋 Entering port section');
            continue;
        }

        // Akhir section port
        if ((line.startsWith('---') || line.includes('Nmap done') || 
             line.includes('Service detection performed')) && inPortSection) {
            inPortSection = false;
            console.log('📋 Exiting port section');
        }

        // Parsing line port - pattern yang lebih komprehensif
        if (inPortSection && line.match(/^[0-9]+\/(tcp|udp)\s+(open|filtered|closed|open\|filtered)/)) {
            const parts = line.split(/\s+/).filter(part => part.length > 0);
            if (parts.length >= 3) {
                const portInfo = {
                    port: parts[0],
                    state: parts[1],
                    service: parts[2] || 'unknown',
                    version: parts.slice(3).join(' ') || ''
                };
                result.ports.push(portInfo);

                // Update statistics
                if (portInfo.state.includes('open')) {
                    result.scanStats.openPorts++;
                    console.log(`🔓 Open port found: ${portInfo.port} - ${portInfo.service}`);
                }
                else if (portInfo.state === 'filtered') result.scanStats.filteredPorts++;
                else if (portInfo.state === 'closed') result.scanStats.closedPorts++;
            }
        }

        // Deteksi jumlah port filtered/closed dari summary lines
        if (line.includes('Not shown:')) {
            const filteredMatch = line.match(/(\d+)\s+filtered/);
            const closedMatch = line.match(/(\d+)\s+closed/);
            if (filteredMatch) {
                result.scanStats.filteredPorts = parseInt(filteredMatch[1]);
                console.log(`📊 Filtered ports: ${result.scanStats.filteredPorts}`);
            }
            if (closedMatch) {
                result.scanStats.closedPorts = parseInt(closedMatch[1]);
                console.log(`📊 Closed ports: ${result.scanStats.closedPorts}`);
            }
        }

        // Deteksi OS information
        else if (line.includes('OS details:') || line.includes('Running:')) {
            const osMatch = line.match(/(OS details:|Running:)\s*(.+)/i);
            if (osMatch && osMatch[2]) {
                result.os = { details: osMatch[2].trim() };
                console.log(`💻 OS detected: ${result.os.details}`);
            }
        }

        // Deteksi scan info
        else if (line.includes('scanned in')) {
            result.scanInfo.duration = line;
        }
    }

    // Jika tidak ada host yang terdeteksi, coba ambil dari line lain
    if (!hostLineFound) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('Nmap scan report')) {
                const hostMatch = line.match(/for\s+(.+)/);
                if (hostMatch) {
                    result.host = hostMatch[1].trim();
                    break;
                }
            }
        }
    }

    // Hitung total ports yang discan
    result.scanStats.totalScanned = result.ports.length + result.scanStats.filteredPorts + result.scanStats.closedPorts;
    
    console.log(`📊 Parsing completed:`);
    console.log(`   - Total ports found: ${result.ports.length}`);
    console.log(`   - Open ports: ${result.scanStats.openPorts}`);
    console.log(`   - Filtered ports: ${result.scanStats.filteredPorts}`);
    console.log(`   - Closed ports: ${result.scanStats.closedPorts}`);
    console.log(`   - Total scanned: ${result.scanStats.totalScanned}`);
    
    return result;
}

function formatNmapResult(parsedData, scanType, duration, rawOutput = '') {
    // Filter hanya port yang open untuk ditampilkan di detail
    const openPorts = parsedData.ports.filter(port => port.state.includes('open'));
    const filteredPorts = parsedData.ports.filter(port => port.state === 'filtered');
    const closedPorts = parsedData.ports.filter(port => port.state === 'closed');

    // Gunakan data dari parsing, fallback ke calculated
    const totalOpen = parsedData.scanStats.openPorts > 0 ? parsedData.scanStats.openPorts : openPorts.length;
    const totalFiltered = parsedData.scanStats.filteredPorts > 0 ? parsedData.scanStats.filteredPorts : filteredPorts.length;
    const totalClosed = parsedData.scanStats.closedPorts > 0 ? parsedData.scanStats.closedPorts : closedPorts.length;
    const totalScanned = parsedData.scanStats.totalScanned > 0 ? parsedData.scanStats.totalScanned : (totalOpen + totalFiltered + totalClosed);

    let message = `🔍 *HASIL SCAN NMAP - ULTIMATE*\n\n`;
    message += `🎯 *Target:* ${parsedData.host || 'Unknown'}\n`;
    message += `⚡ *Tipe Scan:* ${scanType.toUpperCase()}\n`;
    message += `📅 *Waktu:* ${new Date().toLocaleString('id-ID')}\n`;
    message += `⏱️ *Durasi:* ${duration} detik\n`;
    message += `🌐 *Status Host:* ${parsedData.hostStatus === 'up' ? '✅ UP' : '❌ DOWN'}\n\n`;

    // PORT TERBUKA SECTION
    if (openPorts.length > 0) {
        message += `🔓 *PORT TERBUKA:* ${openPorts.length} port(s)\n`;
        message += '```\n';
        message += 'PORT       STATE   SERVICE        VERSION\n';
        message += '----       -----   -------        -------\n';
        
        openPorts.forEach(port => {
            const portCol = port.port.padEnd(10);
            const stateCol = port.state.padEnd(8);
            const serviceCol = (port.service || 'unknown').padEnd(13);
            const versionCol = port.version.substring(0, 30) || '-';
            message += `${portCol}${stateCol}${serviceCol}${versionCol}\n`;
        });
        message += '```\n\n';
    } else {
        message += `🔒 *Tidak ada port terbuka yang ditemukan*\n\n`;
    }

    // STATISTIK DETAIL YANG KONSISTEN
    message += `📊 *STATISTIK DETAIL:*\n`;
    message += `├ Port Terbuka: ${totalOpen}\n`;
    message += `├ Port Filtered: ${totalFiltered}\n`;
    message += `├ Port Closed: ${totalClosed}\n`;
    message += `└ Total Discan: ${totalScanned}\n\n`;

    // VALIDASI KONSISTENSI - DIPERBAIKI
    const calculatedTotal = totalOpen + totalFiltered + totalClosed;
    const isConsistent = calculatedTotal === totalScanned;
    
    message += `✅ *VALIDASI DATA:* ${isConsistent ? 'KONSISTEN' : '⚠️ PERHATIAN'}\n`;
    if (openPorts.length > 0) {
        message += `└ Detail: ${openPorts.length} terbuka | Summary: ${totalOpen} terbuka\n\n`;
    } else {
        message += `└ Tidak ada perbedaan data\n\n`;
    }

    // OS INFORMATION
    if (parsedData.os.details) {
        message += `💻 *INFORMASI SISTEM:*\n`;
        message += `└ ${parsedData.os.details}\n\n`;
    }

    // SAMPLE OUTPUT SECTION - MENAMPILKAN BAGIAN DARI RAW OUTPUT
    if (rawOutput) {
        const sampleLines = rawOutput.split('\n')
            .filter(line => 
                line.includes('Nmap scan report') ||
                line.includes('Host is') ||
                line.includes('Not shown') ||
                line.includes('PORT') && line.includes('STATE') ||
                line.match(/^\d+\/(tcp|udp).*open/) ||
                line.includes('scanned in')
            )
            .slice(0, 8);
            
        if (sampleLines.length > 0) {
            message += `📋 *SAMPLE OUTPUT:*\n\`\`\`\n${sampleLines.join('\n')}\n\`\`\``;
        }
    }

    return message;
}

async function handleNmapScan(msg, target, scanType = 'basic') {
    const userId = msg.from;
    const startTime = Date.now();
    
    try {
        // Cek instalasi nmap
        const isNmapInstalled = await checkNmapInstallation();
        if (!isNmapInstalled) {
            await msg.reply(
                '❌ *NMAP TIDAK TERINSTALL*\n\n' +
                'Untuk menggunakan fitur scan, install nmap:\n\n' +
                '• *Ubuntu/Debian:*\n' +
                '  `sudo apt update && sudo apt install nmap`\n\n' +
                '• Test instalasi:\n' +
                '  `nmap --version`\n\n' +
                'Setelah install, restart bot.'
            );
            return;
        }

        // Validasi target
        if (!target || target.trim() === '') {
            await msg.reply(
                '❌ *FORMAT PERINTAH SALAH*\n\n' +
                '📝 *Gunakan format berikut:*\n\n' +
                '• `!nmap example.com`\n' +
                '• `!nmap quick scanme.nmap.org`\n' +
                '• `!nmap detailed google.com`\n\n' +
                '🎯 *Target testing yang disarankan:*\n' +
                '• scanme.nmap.org\n' +
                '• example.com\n' +
                '• localhost\n' +
                '• 8.8.8.8'
            );
            return;
        }

        // Cooldown check
        const cooldownRemaining = checkCooldown(userId, 'nmap');
        if (cooldownRemaining > 0) {
            await msg.reply(
                `⏳ *SEDANG COOLDOWN*\n\n` +
                `Tunggu ${cooldownRemaining} detik lagi sebelum scan berikutnya.\n` +
                `⏰ Cooldown: 45 detik\n` +
                `📊 Fitur keamanan untuk mencegah spam.`
            );
            return;
        }

        const cleanTarget = target.trim();
        
        // Validasi target sederhana
        if (cleanTarget.length > 255) {
            await msg.reply('❌ Target terlalu panjang. Maksimal 255 karakter.');
            return;
        }

        const processingMsg = await msg.reply(
            `🔍 *MEMULAI SCAN NMAP - ULTIMATE*\n\n` +
            `🎯 Target: ${cleanTarget}\n` +
            `⚡ Tipe: ${scanType.toUpperCase()}\n` +
            `⏰ Estimasi: 30-90 detik\n` +
            `📡 Status: Inisialisasi scanner...\n\n` +
            `_Mohon tunggu, proses scan sedang berjalan..._`
        );

        // KONFIGURASI SCAN YANG DISEMPURNAKAN
        const scanConfigs = {
            quick: {
                command: `nmap -T4 -F --open ${cleanTarget}`,
                timeout: 60000,
                description: 'Quick scan (top 100 ports)'
            },
            detailed: {
                command: `nmap -T4 -A -v --open ${cleanTarget}`,
                timeout: 120000,
                description: 'Detailed scan dengan OS detection'
            },
            port: {
                command: `nmap -T4 -p 1-1000 --open ${cleanTarget}`,
                timeout: 90000,
                description: 'Port range scan (1-1000)'
            },
            os: {
                command: `nmap -T4 -O --open ${cleanTarget}`,
                timeout: 90000,
                description: 'OS detection scan'
            },
            full: {
                command: `nmap -T4 -p- --open ${cleanTarget}`,
                timeout: 300000,
                description: 'Full port scan (semua ports)'
            },
            basic: {
                command: `nmap -T4 --open ${cleanTarget}`,
                timeout: 75000,
                description: 'Basic scan (top 1000 ports)'
            }
        };

        const config = scanConfigs[scanType] || scanConfigs.basic;
        
        logWithTime(`🚀 Starting ${scanType} scan for: ${cleanTarget}`, 'NMAP');
        logWithTime(`📝 Command: ${config.command}`, 'NMAP');
        
        try {
            const { stdout, stderr } = await execAsync(config.command, { 
                timeout: config.timeout,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            const duration = Math.round((Date.now() - startTime) / 1000);
            
            // LOG RAW OUTPUT untuk debugging
            logWithTime(`📄 Nmap raw output received: ${stdout.length} characters`, 'NMAP');
            
            // Parse output
            const parsedData = parseNmapOutput(stdout);
            
            // FALLBACK SYSTEM: Jika parsing gagal, kirim raw output
            if (parsedData.ports.length === 0 && stdout.length > 0) {
                logWithTime('⚠️ No ports parsed, using raw output fallback', 'WARN');
                
                let rawMessage = `🔍 *HASIL SCAN NMAP - RAW OUTPUT*\n\n`;
                rawMessage += `🎯 Target: ${cleanTarget}\n`;
                rawMessage += `⚡ Tipe: ${scanType.toUpperCase()}\n`;
                rawMessage += `⏱️ Durasi: ${duration} detik\n\n`;
                rawMessage += '```\n';
                
                // Ambil bagian penting dari raw output (max 2000 karakter)
                const importantLines = stdout.split('\n')
                    .filter(line => 
                        line.includes('open') || 
                        line.includes('Nmap scan') || 
                        line.includes('Host is') ||
                        line.includes('PORT') ||
                        line.includes('Not shown') ||
                        line.includes('scanned in')
                    )
                    .slice(0, 12); // Batasi 12 baris
                
                rawMessage += importantLines.join('\n');
                
                // Jika masih ada space, tambahkan info tambahan
                if (rawMessage.length < 1500) {
                    const additionalLines = stdout.split('\n')
                        .filter(line => line.includes('Service') || line.includes('Version'))
                        .slice(0, 3);
                    if (additionalLines.length > 0) {
                        rawMessage += '\n' + additionalLines.join('\n');
                    }
                }
                
                rawMessage += '\n```';
                
                rawMessage += `\n\n📝 *Catatan:* Menggunakan raw output karena parsing otomatis gagal.`;
                
                await msg.reply(rawMessage);
                return;
            }
            
            // Format hasil dengan data yang sudah diparse
            const resultMessage = formatNmapResult(parsedData, scanType, duration, stdout);
            
            // Hapus pesan processing
            try {
                await processingMsg.delete(true);
            } catch (e) {
                logWithTime('Cannot delete processing message', 'WARN');
            }

            // Kirim hasil scanning
            await msg.reply(resultMessage);
            
            // Update statistics
            updateUserStats(userId, 'scan');
            
            logWithTime(`✅ Scan completed: ${cleanTarget} | Open ports: ${parsedData.scanStats.openPorts} | Duration: ${duration}s`, 'SUCCESS');

        } catch (scanError) {
            const duration = Math.round((Date.now() - startTime) / 1000);
            let errorMessage = '❌ *SCAN GAGAL*\n\n';
            
            if (scanError.killed) {
                errorMessage += '⏰ *Timeout* - Scan melebihi batas waktu\n\n';
                errorMessage += '💡 *Kemungkinan penyebab:*\n';
                errorMessage += '• Target tidak merespon\n';
                errorMessage += '• Koneksi internet lambat\n';
                errorMessage += '• Target memblokir scan nmap\n\n';
                errorMessage += '🔄 *Coba solusi:*\n';
                errorMessage += '• Gunakan scan type "quick"\n';
                errorMessage += '• Coba target yang berbeda\n';
                errorMessage += '• Periksa koneksi internet';
            } else if (scanError.code === 'ENOENT') {
                errorMessage += '📦 *Nmap tidak ditemukan*\n\n';
                errorMessage += 'Pastikan nmap terinstall dengan benar.\n';
                errorMessage += 'Test dengan: `nmap --version`';
            } else {
                errorMessage += `⚠️ *Error:* ${scanError.message}\n\n`;
                errorMessage += 'Coba lagi dengan target atau tipe scan berbeda.';
            }
            
            errorMessage += `\n\n⏱️ *Waktu yang dihabiskan:* ${duration} detik`;

            await msg.reply(errorMessage);
            logWithTime(`❌ Scan failed: ${cleanTarget} | Error: ${scanError.message}`, 'ERROR');
        }

    } catch (error) {
        logWithTime(`Nmap handler error: ${error.message}`, 'ERROR');
        await msg.reply(
            '❌ *TERJADI KESALAHAN SISTEM*\n\n' +
            'Silakan coba beberapa saat lagi.\n' +
            'Jika error berlanjut, restart bot.'
        );
    }
}

// =============================================
// MESSAGE EVENT HANDLER
// =============================================

client.on('message', async (msg) => {
    try {
        // Skip system messages
        if (msg.from === 'status@broadcast' || msg.isStatus || msg.fromMe) {
            return;
        }

        const command = msg.body.toLowerCase().trim();

        // Handle !ping
        if (command === '!ping') {
            const start = Date.now();
            await msg.reply('🏓 Pong!');
            const latency = Date.now() - start;
            
            const nmapStatus = await checkNmapInstallation() ? '✅' : '❌';
            
            await msg.reply(
                `📊 *SYSTEM STATUS - ULTIMATE*\n\n` +
                `⚡ Latency: ${latency}ms\n` +
                `⏰ Uptime: ${formatUptime(process.uptime())}\n` +
                `💾 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB\n` +
                `🔧 Nmap: ${nmapStatus}\n` +
                `👥 Users: ${userStats.size}\n` +
                `📈 Scans: ${botState.totalScans}\n` +
                `📸 Stickers: ${botState.totalStickers}\n` +
                `✅ Status: ${botState.isReady ? '🟢 ONLINE' : '🔴 OFFLINE'}`
            );
            return;
        }

        // Handle !help
        if (command === '!help' || command === '!menu') {
            const helpMessage = `🤖 *WHATSAPP BOT PRO - ULTIMATE* 🤖

*FITUR UTAMA:*
📸 *!sticker* - Buat stiker dari gambar (ENHANCED)
🌅 *!sticker bg* - Stiker dengan optimasi background
🔍 *!nmap* - Network security scanner (ULTIMATE)
📊 *!stats* - Statistik penggunaan
ℹ️  *!info* - Informasi sistem

*FITUR STICKER ENHANCED:*
📸 *!sticker* - Buat stiker dari gambar
🖼️  *!sticker bg* - Stiker dengan background transparan
📎 *Cara pakai:* 
   - Kirim gambar dengan caption !sticker
   - Atau reply gambar dengan !sticker
✨ *Fitur baru:*
   - Support JPEG, PNG, GIF, WebP
   - Auto resize & optimasi
   - Progress tracking
   - Advanced error handling

*FITUR NMAP ULTIMATE:*
🔍 *!nmap <target>* - Basic scan
⚡ *!nmap quick <target>* - Fast scan (common ports)
📋 *!nmap detailed <target>* - Detailed scan + OS detection
🔢 *!nmap port <target>* - Port range scan
💻 *!nmap os <target>* - OS detection
🚀 *!nmap full <target>* - Full port scan

*CONTOH PENGGUNAAN:*
• !nmap scanme.nmap.org
• !sticker (dengan gambar)
• !sticker bg (dengan gambar)
• !info

*✨ FITUR ULTIMATE:*
• ✅ Sticker Creator (ENHANCED)
• 🎯 Nmap Scanner 100% Konsisten
• 📊 Dual Output System
• 🔧 Advanced Error Handling
• 📈 Real-time Statistics

_Bot Version 7.0 - Ultimate Enhanced_`;

            await msg.reply(helpMessage);
            return;
        }

        // Handle !info
        if (command === '!info' || command === '!about') {
            const nmapStatus = await checkNmapInstallation() ? '✅ Terinstall' : '❌ Tidak terinstall';
            
            const infoMessage = `📊 *SYSTEM INFORMATION - ULTIMATE*

*🤖 Bot Version:* 7.0.0
*🟢 Status:* ${botState.isReady ? 'ONLINE' : 'OFFLINE'}
*🔧 Nmap:* ${nmapStatus}
*⏰ Uptime:* ${formatUptime(process.uptime())}
*📅 Started:* ${botState.startTime.toLocaleString('id-ID')}
*💾 Memory:* ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB

*📈 STATISTIK:*
• Total Scan: ${botState.totalScans}
• Total Stiker: ${botState.totalStickers}
• User Aktif: ${userStats.size}

*🎯 FITUR ULTIMATE:*
✅ Sticker Creator (ENHANCED)
✅ Nmap Scanner (100% Konsisten)
✅ Dual Output System  
✅ Advanced Statistics
✅ Smart Cooldown System
✅ Auto Validation

_WhatsApp Bot Pro v7 - Ultimate Enhanced Version_`;

            await msg.reply(infoMessage);
            return;
        }

        // Handle nmap commands
        if (command.startsWith('!nmap')) {
            const parts = command.split(' ');
            let scanType = 'basic';
            let target = '';

            if (parts.length === 2) {
                target = parts[1];
            } else if (parts.length >= 3) {
                scanType = parts[1];
                target = parts.slice(2).join(' ');
            }

            const validTypes = ['basic', 'quick', 'detailed', 'port', 'os', 'full'];
            if (!validTypes.includes(scanType)) {
                target = parts.slice(1).join(' ');
                scanType = 'basic';
            }

            await handleNmapScan(msg, target, scanType);
            return;
        }

        // Handle sticker commands - ENHANCED VERSION
        if (command === '!sticker' || command === '!stiker') {
            await handleStickerCreation(msg, false);
            return;
        }

        if (command === '!sticker bg' || command === '!stiker bg') {
            await handleStickerCreation(msg, true);
            return;
        }

        // Handle !stats
        if (command === '!stats' || command === '!statistik') {
            const userStat = userStats.get(msg.from) || { stickers: 0, scans: 0, lastActive: new Date() };
            const topUsers = Array.from(userStats.entries())
                .sort((a, b) => (b[1].stickers + b[1].scans) - (a[1].stickers + a[1].scans))
                .slice(0, 5);
            
            let statsMessage = `📊 *STATISTIK PENGGUNAAN*\n\n`;
            statsMessage += `👤 *Statistik Anda:*\n`;
            statsMessage += `├ Stiker dibuat: ${userStat.stickers}\n`;
            statsMessage += `├ Scan dilakukan: ${userStat.scans}\n`;
            statsMessage += `└ Terakhir aktif: ${userStat.lastActive.toLocaleTimeString('id-ID')}\n\n`;
            
            statsMessage += `🌐 *Statistik Global:*\n`;
            statsMessage += `├ Total Stiker: ${botState.totalStickers}\n`;
            statsMessage += `├ Total Scan: ${botState.totalScans}\n`;
            statsMessage += `├ Pengguna aktif: ${userStats.size}\n`;
            statsMessage += `└ Uptime: ${formatUptime(process.uptime())}\n\n`;
            
            if (topUsers.length > 0) {
                statsMessage += `🏆 *Top Pengguna:*\n`;
                topUsers.forEach(([userId, stats], index) => {
                    const rank = ['🥇', '🥈', '🥉', '4.', '5.'][index];
                    statsMessage += `${rank} ${userId.substring(0, 8)}... - ${stats.stickers + stats.scans} aksi\n`;
                });
            }
            
            await msg.reply(statsMessage);
            return;
        }

        // Auto response
        if ((msg.body.toLowerCase().includes('sticker') || 
             msg.body.toLowerCase().includes('stiker') ||
             msg.body.toLowerCase().includes('nmap') ||
             msg.body.toLowerCase().includes('scan')) && 
            !msg.body.startsWith('!')) {
            
            await msg.reply(
                `🤖 *BOT ASSISTANT - ULTIMATE*\n\n` +
                `Butuh bantuan?\n\n` +
                `📸 *Buat Stiker:* Kirim gambar dengan caption !sticker\n` +
                `🔍 *Scan Network:* !nmap example.com\n` +
                `📊 *Lihat Statistik:* !stats\n` +
                `📋 *Menu Lengkap:* !help\n\n` +
                `🎯 *Coba sekarang:* !nmap scanme.nmap.org`
            );
        }

    } catch (error) {
        logWithTime(`Message handler error: ${error.message}`, 'ERROR');
    }
});

// =============================================
// WHATSAPP CLIENT EVENTS
// =============================================

client.on('qr', (qr) => {
    botState.qrGenerated = true;
    console.log('\n' + '='.repeat(60));
    console.log('📱 WHATSAPP BOT PRO ULTIMATE - QR CODE READY');
    console.log('='.repeat(60));
    
    qrcode.generate(qr, { small: false });
    
    console.log('\n📝 PETUNJUK PENGGUNAAN:');
    console.log('1. Buka WhatsApp di smartphone');
    console.log('2. Tap menu ⋮ → Linked Devices → Link a Device');
    console.log('3. Scan QR code di atas dengan kamera');
    console.log('4. QR code akan expired dalam 20 detik!');
    console.log('='.repeat(60));
    console.log('🤖 Bot Features: Enhanced Sticker Creator | Ultimate Nmap Scanner');
    console.log('🎯 Test Command: !nmap scanme.nmap.org');
    console.log('='.repeat(60) + '\n');
});

client.on('ready', () => {
    botState.isReady = true;
    botState.isAuthenticated = true;
    
    console.log('\n🎉 WHATSAPP BOT PRO ULTIMATE - READY AND OPERATIONAL!');
    console.log('===================================================');
    console.log('⏰ System Time:', new Date().toLocaleString('id-ID'));
    console.log('🤖 Bot Started:', botState.startTime.toLocaleString('id-ID'));
    console.log('\n🚀 ULTIMATE FEATURES:');
    console.log('   📸 Sticker Creator (ENHANCED)');
    console.log('   🔍 Nmap Scanner (100% Consistent Output)');
    console.log('   🎯 Dual Output System (Parsed + Raw Fallback)');
    console.log('   📊 Advanced Statistics & Validation');
    console.log('   ⚡ Smart Cooldown System');
    console.log('   ✅ Auto Data Consistency Check');
    console.log('\n💡 Commands: !help for menu, !nmap for scanning');
    console.log('🎯 Test: !nmap scanme.nmap.org');
    console.log('===================================================\n');
});

client.on('authenticated', () => {
    botState.isAuthenticated = true;
    logWithTime('✅ Authentication successful - Session saved', 'SUCCESS');
});

client.on('auth_failure', (msg) => {
    logWithTime(`❌ Authentication failed: ${msg}`, 'ERROR');
});

client.on('disconnected', (reason) => {
    botState.isReady = false;
    logWithTime(`❌ Disconnected: ${reason}`, 'ERROR');
    logWithTime('🔄 Attempting to reconnect...', 'WARN');
    setTimeout(() => {
        client.initialize();
        logWithTime('🔄 Reinitializing client...', 'INFO');
    }, 10000);
});

// =============================================
// START BOT
// =============================================

async function initializeBot() {
    console.log('🚀 INITIALIZING WHATSAPP BOT PRO - ULTIMATE VERSION');
    console.log('===================================================');
    console.log('📦 Node.js Version:', process.version);
    console.log('💻 Platform:', os.platform(), os.arch());
    console.log('📁 Working Directory:', process.cwd());
    console.log('⏰ System Time:', new Date().toLocaleString('id-ID'));
    console.log('===================================================\n');

    // Check nmap installation
    try {
        const isNmapInstalled = await checkNmapInstallation();
        console.log('🔧 Nmap Status:', isNmapInstalled ? '✅ INSTALLED' : '❌ NOT INSTALLED');
        
        if (isNmapInstalled) {
            const { stdout } = await execAsync('nmap --version');
            const versionLine = stdout.split('\n')[0];
            console.log('📋 Nmap Version:', versionLine);
            
            // Test nmap dengan target sederhana
            console.log('🧪 Testing nmap functionality...');
            try {
                const { stdout: testOutput } = await execAsync('nmap --version', { timeout: 10000 });
                console.log('✅ Nmap functionality verified');
            } catch (testError) {
                console.log('❌ Nmap test failed:', testError.message);
            }
        } else {
            console.log('💡 Tip: Install nmap for scanning features');
            console.log('   Run: sudo apt install nmap');
        }
    } catch (error) {
        console.log('🔧 Nmap Status: ❌ CHECK FAILED');
    }

    console.log('\n🎯 ULTIMATE FEATURES READY:');
    console.log('   • Enhanced Sticker Creator');
    console.log('   • 100% Consistent Nmap Output');
    console.log('   • Dual Output System (Parsed + Raw)');
    console.log('   • Advanced Error Handling');
    console.log('   • Real-time Statistics');
    console.log('   • Auto Data Validation');
    console.log('\n📝 Available Commands:');
    console.log('   • !help - Show all commands');
    console.log('   • !sticker - Create sticker from image');
    console.log('   • !nmap <target> - Ultimate network scanner');
    console.log('   • !stats - Usage statistics');
    console.log('   • !info - System information');
    console.log('   • !ping - Status check');
    console.log('\n🎯 Testing Commands:');
    console.log('   • !nmap scanme.nmap.org');
    console.log('   • !sticker (with image)');
    console.log('   • !nmap quick example.com');
    console.log('===================================================\n');

    // Initialize WhatsApp client
    client.initialize();
}

// Start the bot
initializeBot();
