#!/bin/bash
# ============================================
# IG REPORTER - INSTALLER UNTUK VPS
# Jalankan sebagai root di Ubuntu 22.04/24.04
# ============================================
set -e

echo "========================================"
echo "  IG REPORTER - VPS INSTALLER"
echo "========================================"
echo ""

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "\n${GREEN}[STEP $1]${NC} $2"; }
print_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
print_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
print_err() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
print_step "1/12" "Update sistem..."
# ============================================
apt update -y
apt upgrade -y
apt install -y curl wget git build-essential software-properties-common nginx lsb-release gnupg unzip
print_ok "Sistem terupdate"

# ============================================
print_step "2/12" "Install Python 3.11..."
# ============================================
add-apt-repository ppa:deadsnakes/ppa -y
apt update -y
apt install -y python3.11 python3.11-venv python3.11-dev
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 2>/dev/null || true
python3 --version
print_ok "Python 3.11 terinstall"

# ============================================
print_step "3/12" "Install Node.js 20 + Yarn..."
# ============================================
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g yarn
node --version
yarn --version
print_ok "Node.js + Yarn terinstall"

# ============================================
print_step "4/12" "Install MongoDB 7.0..."
# ============================================
UBUNTU_VER=$(lsb_release -cs)
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg 2>/dev/null || true

if [ "$UBUNTU_VER" = "noble" ]; then
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
else
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${UBUNTU_VER}/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
fi

apt update -y
apt install -y mongodb-org || {
    print_warn "MongoDB 7.0 gagal, coba install MongoDB dari Ubuntu repo..."
    apt install -y mongodb
}
systemctl start mongod 2>/dev/null || systemctl start mongodb 2>/dev/null || true
systemctl enable mongod 2>/dev/null || systemctl enable mongodb 2>/dev/null || true
print_ok "MongoDB terinstall dan berjalan"

# ============================================
print_step "5/12" "Setup direktori project..."
# ============================================
mkdir -p /root/ig-reporter
cd /root/ig-reporter

# Cek apakah kode sudah ada
if [ ! -f "backend/server.py" ]; then
    print_err "Kode belum ada di /root/ig-reporter/"
    echo ""
    echo "Upload kode dulu ke VPS dengan salah satu cara:"
    echo ""
    echo "  CARA 1 - Via SCP (dari komputer Anda):"
    echo "    scp ig-reporter.tar.gz root@$(hostname -I | awk '{print $1}'):/root/"
    echo "    ssh root@$(hostname -I | awk '{print $1}')"
    echo "    cd /root && tar xzf ig-reporter.tar.gz -C ig-reporter/"
    echo ""
    echo "  CARA 2 - Via GitHub:"
    echo "    cd /root/ig-reporter"
    echo "    git clone https://github.com/USERNAME/REPO ."
    echo ""
    echo "Setelah upload, jalankan script ini lagi."
    exit 1
fi

print_ok "Kode ditemukan di /root/ig-reporter/"

# ============================================
print_step "6/12" "Setup Backend Python..."
# ============================================
cd /root/ig-reporter/backend

# Buat virtual environment
python3 -m venv /root/ig-venv
source /root/ig-venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

print_ok "Backend dependencies terinstall"

# ============================================
print_step "7/12" "Install Playwright + Chromium..."
# ============================================
source /root/ig-venv/bin/activate
pip install playwright

# Install Chromium browser
export PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers
mkdir -p /root/ig-browsers
playwright install chromium
playwright install-deps chromium 2>/dev/null || apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 2>/dev/null || true

# Verifikasi
CHROME_PATH=$(find /root/ig-browsers -name "chrome" -type f 2>/dev/null | head -1)
if [ -n "$CHROME_PATH" ]; then
    print_ok "Chromium terinstall: $CHROME_PATH"
else
    print_err "Chromium gagal install. Coba manual: PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers playwright install chromium"
fi

# ============================================
print_step "8/12" "Update konfigurasi..."
# ============================================
cd /root/ig-reporter/backend

# Detect Chromium path
CHROME_DIR=$(find /root/ig-browsers -name "chrome-linux" -type d 2>/dev/null | head -1)
CHROME_DIR_PARENT=$(dirname "$CHROME_DIR" 2>/dev/null)

# Update server.py paths
if [ -n "$CHROME_DIR_PARENT" ]; then
    sed -i "s|/app/.browsers/chromium-[0-9]*/chrome-linux/chrome|${CHROME_DIR}/chrome|g" server.py
    sed -i "s|/app/.browsers|/root/ig-browsers|g" server.py
    sed -i "s|/pw-browsers|/root/ig-browsers|g" server.py
fi
sed -i "s|/root/.venv/bin/python3|/root/ig-venv/bin/python3|g" server.py

# Setup .env
VPS_IP=$(hostname -I | awk '{print $1}')
cat > /root/ig-reporter/backend/.env << EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="ig_reporter"
CORS_ORIGINS="*"
EOF

print_ok "Konfigurasi backend diupdate"

# ============================================
print_step "9/12" "Setup Frontend..."
# ============================================
cd /root/ig-reporter/frontend

# Update frontend .env
cat > .env << EOF
REACT_APP_BACKEND_URL=http://${VPS_IP}
EOF

# Install dependencies & build
yarn install
yarn build

if [ -f "build/index.html" ]; then
    print_ok "Frontend berhasil di-build"
else
    print_err "Frontend build gagal"
fi

# ============================================
print_step "10/12" "Setup Nginx..."
# ============================================
cat > /etc/nginx/sites-available/ig-reporter << NGINX
server {
    listen 80;
    server_name ${VPS_IP};

    # Frontend
    root /root/ig-reporter/frontend/build;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/ig-reporter /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && systemctl enable nginx
print_ok "Nginx dikonfigurasi"

# ============================================
print_step "11/12" "Setup auto-start service..."
# ============================================
cat > /etc/systemd/system/ig-reporter.service << SERVICE
[Unit]
Description=IG Reporter Backend
After=network.target mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/ig-reporter/backend
Environment=PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers
ExecStart=/root/ig-venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --workers 1
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable ig-reporter
systemctl start ig-reporter
sleep 3
print_ok "Backend service aktif"

# ============================================
print_step "12/12" "Verifikasi..."
# ============================================
echo ""

# Check MongoDB
if mongosh --quiet --eval "db.runCommand({ping:1})" 2>/dev/null | grep -q "ok"; then
    print_ok "MongoDB: RUNNING"
else
    print_warn "MongoDB: cek manual dengan 'systemctl status mongod'"
fi

# Check Backend
sleep 2
if curl -s http://localhost:8001/api/ | grep -q "Instagram"; then
    print_ok "Backend: RUNNING"
else
    print_warn "Backend: cek manual dengan 'systemctl status ig-reporter'"
fi

# Check Nginx
if curl -s http://localhost | grep -q "html"; then
    print_ok "Nginx + Frontend: RUNNING"
else
    print_warn "Nginx: cek manual dengan 'systemctl status nginx'"
fi

echo ""
echo "========================================"
echo -e "  ${GREEN}INSTALASI SELESAI!${NC}"
echo "========================================"
echo ""
echo "  Buka browser: http://${VPS_IP}"
echo ""
echo "  Perintah berguna:"
echo "    systemctl status ig-reporter   # Cek backend"
echo "    systemctl restart ig-reporter  # Restart backend"
echo "    journalctl -u ig-reporter -f   # Lihat log"
echo "    systemctl restart nginx        # Restart nginx"
echo ""
echo "  Untuk setup domain + SSL:"
echo "    1. Arahkan DNS domain ke ${VPS_IP}"
echo "    2. Edit /etc/nginx/sites-available/ig-reporter"
echo "       Ganti server_name ke domain Anda"
echo "    3. Edit /root/ig-reporter/frontend/.env"
echo "       Ganti REACT_APP_BACKEND_URL=https://yourdomain.com"
echo "    4. cd /root/ig-reporter/frontend && yarn build"
echo "    5. certbot --nginx -d yourdomain.com"
echo "    6. systemctl restart nginx"
echo ""
