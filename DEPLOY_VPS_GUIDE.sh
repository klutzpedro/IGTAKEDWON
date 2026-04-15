# PANDUAN LENGKAP: Deploy IG Reporter ke VPS
# =============================================
# VPS: Ubuntu 22.04/24.04 (disarankan)
# Spesifikasi minimum: 2 CPU, 4GB RAM, 20GB disk

# ============================================
# STEP 1: Login ke VPS
# ============================================
# Dari komputer Anda, buka Terminal/CMD lalu:
ssh root@147.93.81.36
# Masukkan password saat diminta

# ============================================
# STEP 2: Update sistem & install dependencies dasar
# ============================================
apt update && apt upgrade -y
apt install -y curl wget git build-essential software-properties-common nginx certbot python3-certbot-nginx

# ============================================
# STEP 3: Install Python 3.11
# ============================================
add-apt-repository ppa:deadsnakes/ppa -y
apt update
apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Jadikan python3.11 sebagai default
update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# Verifikasi
python3 --version
# Harus menampilkan: Python 3.11.x

# ============================================
# STEP 4: Install Node.js 20 + Yarn
# ============================================
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Yarn
npm install -g yarn

# Verifikasi
node --version   # Harus v20.x.x
yarn --version   # Harus 1.x.x

# ============================================
# STEP 5: Install MongoDB 7.0
# ============================================
# Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg

# Tambah repository (Ubuntu 22.04)
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Untuk Ubuntu 24.04, ganti "jammy" dengan "noble":
# echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list

apt update
apt install -y mongodb-org

# Start MongoDB
systemctl start mongod
systemctl enable mongod

# Verifikasi
mongosh --eval "db.runCommand({ping:1})"
# Harus menampilkan: { ok: 1 }

# ============================================
# STEP 6: Upload kode ke VPS
# ============================================
# OPSI A: Via GitHub (disarankan)
# 1. Push kode dari Emergent ke GitHub (klik "Push to GitHub" di Emergent)
# 2. Clone di VPS:
cd /root
git clone https://github.com/USERNAME/REPO_NAME.git ig-reporter
cd ig-reporter

# OPSI B: Via SCP (langsung dari komputer)
# Dari komputer Anda (bukan di VPS), jalankan:
# scp -r /path/ke/project root@147.93.81.36:/root/ig-reporter

# ============================================
# STEP 7: Setup Backend
# ============================================
cd /root/ig-reporter/backend

# Buat virtual environment
python3 -m venv /root/ig-venv
source /root/ig-venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Install Playwright + Chromium (untuk browser automation)
pip install playwright
PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers playwright install-deps chromium

# Verifikasi Chromium terinstall
ls /root/ig-browsers/chromium-*/chrome-linux/chrome
# Harus menampilkan path file chrome

# Setup environment variables
cat > /root/ig-reporter/backend/.env << 'EOF'
MONGO_URL="mongodb://localhost:27017"
DB_NAME="ig_reporter"
CORS_ORIGINS="*"
EOF

# ============================================
# STEP 8: Update path Chromium di server.py
# ============================================
# Ganti semua path /app/.browsers dengan /root/ig-browsers di server.py
sed -i 's|/app/.browsers|/root/ig-browsers|g' /root/ig-reporter/backend/server.py

# Ganti path venv untuk playwright install
sed -i 's|/root/.venv/bin/python3|/root/ig-venv/bin/python3|g' /root/ig-reporter/backend/server.py

# ============================================
# STEP 9: Test Backend
# ============================================
source /root/ig-venv/bin/activate
cd /root/ig-reporter/backend

# Set environment variable
export PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers

# Test jalankan
uvicorn server:app --host 0.0.0.0 --port 8001
# Buka browser: http://147.93.81.36:8001/api/
# Harus menampilkan: {"message":"Instagram Report Automation API"}
# Tekan Ctrl+C untuk stop

# ============================================
# STEP 10: Setup Frontend
# ============================================
cd /root/ig-reporter/frontend

# Update environment: ganti URL backend ke IP VPS
cat > /root/ig-reporter/frontend/.env << 'EOF'
REACT_APP_BACKEND_URL=http://147.93.81.36
EOF

# Nanti setelah setup domain+SSL, ganti ke:
# REACT_APP_BACKEND_URL=https://yourdomain.com

# Install dependencies
yarn install

# Build production
yarn build

# Verifikasi build berhasil
ls build/index.html
# Harus menampilkan: build/index.html

# ============================================
# STEP 11: Setup Nginx (Web Server)
# ============================================
cat > /etc/nginx/sites-available/ig-reporter << 'NGINX'
server {
    listen 80;
    server_name 147.93.81.36;
    # Nanti ganti dengan domain: server_name yourdomain.com;

    # Frontend (React build)
    root /root/ig-reporter/frontend/build;
    index index.html;

    # Frontend routes (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
NGINX

# Aktifkan konfigurasi
ln -sf /etc/nginx/sites-available/ig-reporter /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test konfigurasi
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx

# ============================================
# STEP 12: Setup Systemd Service (auto-start backend)
# ============================================
cat > /etc/systemd/system/ig-reporter.service << 'SERVICE'
[Unit]
Description=IG Reporter Backend
After=network.target mongod.service
Requires=mongod.service

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

# Aktifkan dan jalankan
systemctl daemon-reload
systemctl enable ig-reporter
systemctl start ig-reporter

# Cek status
systemctl status ig-reporter
# Harus menampilkan: active (running)

# ============================================
# STEP 13: Verifikasi semua berjalan
# ============================================
# 1. Cek backend
curl http://localhost:8001/api/
# Harus menampilkan: {"message":"Instagram Report Automation API"}

# 2. Cek frontend
curl -s http://localhost | head -5
# Harus menampilkan HTML

# 3. Buka browser: http://147.93.81.36
# Dashboard IG Reporter harus muncul!

# ============================================
# STEP 14 (OPSIONAL): Setup Domain + SSL
# ============================================
# 1. Beli domain (contoh: igreporter.com) di Namecheap/Cloudflare
# 2. Arahkan DNS A record ke IP VPS: 147.93.81.36
# 3. Update Nginx config:
#    Ganti "server_name 147.93.81.36" menjadi "server_name yourdomain.com"
# 4. Update frontend .env:
#    REACT_APP_BACKEND_URL=https://yourdomain.com
# 5. Rebuild frontend:
#    cd /root/ig-reporter/frontend && yarn build
# 6. Install SSL:
#    certbot --nginx -d yourdomain.com
# 7. Restart:
#    systemctl restart nginx

# ============================================
# PERINTAH BERGUNA SEHARI-HARI
# ============================================
# Cek status backend:
systemctl status ig-reporter

# Restart backend:
systemctl restart ig-reporter

# Lihat log backend:
journalctl -u ig-reporter -f

# Restart Nginx:
systemctl restart nginx

# Masuk MongoDB:
mongosh ig_reporter

# Update kode dari GitHub:
cd /root/ig-reporter && git pull
cd backend && source /root/ig-venv/bin/activate && pip install -r requirements.txt
cd ../frontend && yarn install && yarn build
systemctl restart ig-reporter

# ============================================
# TROUBLESHOOTING
# ============================================
# Backend tidak jalan?
journalctl -u ig-reporter --no-pager -n 50

# Nginx error?
nginx -t
tail -50 /var/log/nginx/error.log

# MongoDB error?
systemctl status mongod
journalctl -u mongod --no-pager -n 50

# Port sudah dipakai?
lsof -i :8001
lsof -i :80

# Chromium tidak ditemukan?
ls /root/ig-browsers/chromium-*/chrome-linux/chrome
# Jika tidak ada, install ulang:
source /root/ig-venv/bin/activate
PLAYWRIGHT_BROWSERS_PATH=/root/ig-browsers playwright install chromium
