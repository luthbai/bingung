#!/bin/bash

# =============================================
# INSTALL SCRIPT FOR WHATSAPP STICKER BOT
# =============================================

echo ""
echo "🤖 WHATSAPP STICKER BOT INSTALLER"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js belum terinstall!"
    echo "   Silakan install Node.js versi 16 atau lebih tinggi dari:"
    echo "   https://nodejs.org/"
    echo ""
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm belum terinstall!"
    echo "   npm biasanya sudah termasuk dengan Node.js"
    echo "   Pastikan Node.js terinstall dengan benar."
    echo ""
    exit 1
fi

# Display version information
echo "✅ Node.js version: $(node -v)"
echo "✅ npm version: $(npm -v)"
echo ""

# Create package.json if it doesn't exist
if [ ! -f "package.json" ]; then
    echo "📄 Membuat package.json..."
    cat > package.json << EOF
{
  "name": "whatsapp-sticker-bot",
  "version": "1.0.0",
  "description": "Bot WhatsApp untuk membuat stiker dari foto",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "qrcode-terminal": "^0.12.0",
    "sharp": "^0.32.0"
  },
  "keywords": ["whatsapp", "bot", "sticker"],
  "author": "Your Name",
  "license": "MIT"
}
EOF
    echo "✅ package.json berhasil dibuat"
else
    echo "✅ package.json sudah ada"
fi

echo ""
echo "📦 Menginstall dependencies..."
echo "=================================="

# Install dependencies
echo "🔧 Installing whatsapp-web.js..."
npm install whatsapp-web.js

echo "🔧 Installing qrcode-terminal..."
npm install qrcode-terminal

echo "🔧 Installing sharp..."
npm install sharp

echo ""
echo "✅ INSTALASI SELESAI!"
echo "======================"
echo ""
echo "🚀 Cara menjalankan bot:"
echo "   npm start"
echo ""
echo "📝 Pastikan file index.js sudah ada di folder ini"
echo ""
echo "⚠️  Catatan:"
echo "   - Pastikan koneksi internet stabil"
echo "   - Bot memerlukan Chrome/Chromium browser"
echo "   - Scan QR code saat pertama kali menjalankan"
echo ""

# Check if index.js exists
if [ ! -f "index.js" ]; then
    echo ""
    echo "❌ File index.js tidak ditemukan!"
    echo "   Pastikan file index.js ada di folder yang sama"
    echo ""
fi

echo "🎉 Bot siap digunakan!"
