#!/bin/bash
# ============================================================
# SCRIPT UPDATE VPS - IG Reporter + Auto Post Feature
# ============================================================
# Jalankan script ini di VPS Anda untuk update ke versi terbaru
# yang sudah include fitur Auto Post (AI Image + Caption)
#
# CARA PAKAI:
# 1. Save to GitHub dulu dari Emergent (tombol di bawah chat)
# 2. Upload script ini ke VPS: scp update_vps.sh root@147.93.81.36:/root/
# 3. Di VPS jalankan: bash /root/update_vps.sh
# ============================================================

set -e

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  UPDATE IG REPORTER - Auto Post Feature  ${NC}"
echo -e "${GREEN}================================================${NC}"

# ============================================================
# KONFIGURASI - SESUAIKAN DENGAN VPS ANDA
# ============================================================
PROJECT_DIR="/root/ig-reporter"
VENV_DIR="/root/ig-venv"
BROWSERS_DIR="/root/ig-browsers"

# ============================================================
# STEP 1: Backup file lama
# ============================================================
echo -e "\n${YELLOW}[1/6] Backup file lama...${NC}"
BACKUP_DIR="/root/ig-reporter-backup-$(date +%Y%m%d_%H%M%S)"
cp -r "$PROJECT_DIR" "$BACKUP_DIR" 2>/dev/null && echo -e "${GREEN}Backup disimpan di: $BACKUP_DIR${NC}" || echo "Skip backup (folder belum ada)"

# ============================================================
# STEP 2: Update backend files
# ============================================================
echo -e "\n${YELLOW}[2/6] Update backend...${NC}"

# Pastikan folder screenshots ada
mkdir -p "$PROJECT_DIR/backend/screenshots"

# File yang perlu diupdate (copy dari komputer lokal atau git pull)
echo "File backend yang perlu diupdate:"
echo "  - backend/server.py (PENTING - fix posting + auto post)"
echo "  - backend/requirements.txt"
echo ""

# Jika menggunakan Git:
if [ -d "$PROJECT_DIR/.git" ]; then
    echo -e "${GREEN}Git repo detected. Pulling latest...${NC}"
    cd "$PROJECT_DIR"
    git pull origin main || git pull origin master || echo -e "${RED}Git pull gagal. Update manual diperlukan.${NC}"
else
    echo -e "${YELLOW}Bukan git repo. Update file secara manual:${NC}"
    echo "  scp -r backend/server.py root@VPS_IP:$PROJECT_DIR/backend/"
    echo "  scp -r frontend/src/ root@VPS_IP:$PROJECT_DIR/frontend/src/"
fi

# ============================================================
# STEP 3: Fix path untuk VPS
# ============================================================
echo -e "\n${YELLOW}[3/6] Fix path Chromium untuk VPS...${NC}"
cd "$PROJECT_DIR/backend"

# Ganti path Chromium dari Emergent ke VPS
sed -i "s|/app/.browsers/chromium-[0-9]*/chrome-linux/chrome|$BROWSERS_DIR/chromium-1208/chrome-linux/chrome|g" server.py
sed -i "s|/app/.browsers|$BROWSERS_DIR|g" server.py
sed -i "s|/app/backend/screenshots|$PROJECT_DIR/backend/screenshots|g" server.py
sed -i "s|/root/.venv/bin/python3|$VENV_DIR/bin/python3|g" server.py

echo -e "${GREEN}Path updated!${NC}"

# ============================================================
# STEP 4: Install Python dependencies
# ============================================================
echo -e "\n${YELLOW}[4/6] Install Python dependencies...${NC}"
source "$VENV_DIR/bin/activate"
cd "$PROJECT_DIR/backend"
pip install --quiet -r requirements.txt
pip install --quiet emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
echo -e "${GREEN}Python dependencies OK!${NC}"

# ============================================================
# STEP 5: Update frontend
# ============================================================
echo -e "\n${YELLOW}[5/6] Build frontend...${NC}"
cd "$PROJECT_DIR/frontend"

# Install dependencies baru (jika ada)
if command -v yarn &> /dev/null; then
    yarn install --silent 2>/dev/null
    yarn build
elif command -v npm &> /dev/null; then
    npm install --silent 2>/dev/null
    npm run build
else
    echo -e "${RED}yarn/npm tidak ditemukan. Install dulu: npm install -g yarn${NC}"
fi
echo -e "${GREEN}Frontend build OK!${NC}"

# ============================================================
# STEP 6: Restart services
# ============================================================
echo -e "\n${YELLOW}[6/6] Restart services...${NC}"

# Stop backend
pkill -f "uvicorn server:app" 2>/dev/null || true
sleep 2

# Start backend
source "$VENV_DIR/bin/activate"
cd "$PROJECT_DIR/backend"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR"
nohup uvicorn server:app --host 0.0.0.0 --port 8001 --reload > /var/log/ig-reporter-backend.log 2>&1 &
echo -e "${GREEN}Backend started on port 8001${NC}"

# Restart nginx (frontend)
sudo systemctl reload nginx 2>/dev/null || true

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  UPDATE SELESAI!  ${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Fitur baru yang ditambahkan:"
echo "  - Auto Post: Posting otomatis dengan gambar + caption AI"
echo "  - Generate gambar via GPT Image 1"
echo "  - Generate caption + hashtag trending via GPT 5.2"
echo "  - Jadwal posting harian"
echo "  - Halaman Auto Post di frontend (/auto-post)"
echo ""
echo "Pastikan EMERGENT_LLM_KEY sudah ada di backend/.env:"
echo "  cat $PROJECT_DIR/backend/.env | grep EMERGENT"
echo ""
echo "Cek backend running:"
echo "  curl http://localhost:8001/api/"
echo ""
echo -e "Jika ada masalah, restore backup dari: ${YELLOW}$BACKUP_DIR${NC}"
