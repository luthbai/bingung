#!/bin/bash

# =============================================
# WHATSAPP BOT PRO - COMPLETE INSTALLER
# =============================================

echo ""
echo "🤖 WHATSAPP BOT PRO - COMPLETE INSTALLER"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check Node.js
log "Memeriksa Node.js..."
if ! command -v node &> /dev/null; then
    error "Node.js belum terinstall!"
    echo "Download dari: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
NODE_MAJOR=$(node -v | cut -d'.' -f1 | sed 's/v//')

if [ "$NODE_MAJOR" -lt 16 ]; then
    error "Node.js versi 16 atau lebih tinggi diperlukan!"
    echo "Versi Anda: $NODE_VERSION"
    exit 1
fi

log "✅ Node.js: $NODE_VERSION"
log "✅ npm: $(npm -v)"

# Install Node.js dependencies
log "Menginstall dependencies Node.js..."
npm install --force

if [ $? -eq 0 ]; then
    log "✅ Dependencies Node.js berhasil diinstall"
else
    error "Gagal install dependencies Node.js"
    exit 1
fi

# Install nmap
echo ""
log "Menginstall Nmap..."
chmod +x install-nmap.sh
./install-nmap.sh

# Final message
echo ""
echo "🎉 INSTALASI SELESAI!"
echo "======================"
echo ""
echo "🚀 Cara menjalankan bot:"
echo "   npm start"
echo ""
echo "📋 Fitur yang tersedia:"
echo "   📸 Pembuat stiker dari gambar"
echo "   🔍 Scanner website dengan nmap"
echo "   ⚡ Multi-type scans (quick, detailed, port, os)"
echo ""
echo "🔧 Troubleshooting:"
echo "   - Jika QR tidak muncul: npm run clean"
echo "   - Test nmap: nmap --help"
echo "   - Hapus folder sessions/ untuk login ulang"
echo ""
echo "⚠️  Penting:"
echo "   - Gunakan nmap hanya untuk tujuan edukasi/keamanan"
echo "   - Patuhi hukum setempat mengenai scanning"
echo "   - Jangan scan target tanpa izin"
echo ""
echo "🤖 Bot siap digunakan! Happy coding!"
echo ""
