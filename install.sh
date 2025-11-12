#!/bin/bash

echo "🤖 WHATSAPP STICKER BOT INSTALLER"
echo "=================================="

# Cek Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js belum terinstall!"
    echo "   Download dari: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ npm version: $(npm -v)"
echo ""

# Install dependencies
echo "📦 Menginstall dependencies..."
npm install whatsapp-web.js qrcode-terminal sharp

echo ""
echo "✅ INSTALASI SELESAI!"
echo "🚀 Jalankan bot dengan: npm start"
