# Instagram Report Automation + Auto Post - PRD

## Problem Statement
Aplikasi otomasi Instagram yang bisa:
1. Login dengan akun IG user-provided
2. Menerima link post/akun dan melaporkannya berulang kali (hate speech, disinformation) sampai di-takedown
3. Monitoring dashboard untuk tracking status
4. **Auto Post**: Fitur posting otomatis dengan gambar dan caption AI-generated berdasarkan tema, bahasa, dan trending hashtags

## Architecture
- **Backend**: FastAPI + PyMongo (Motor async) + Playwright (browser automation) + emergentintegrations (LLM) + instagrapi (IG posting)
- **Frontend**: React + Shadcn UI + Phosphor Icons
- **Database**: MongoDB
- **Browser**: Playwright Chromium pre-installed at `/app/.browsers/`

## Core Features

### Completed
- [x] CRUD Akun Instagram (add, edit, delete, login, challenge/2FA, logout)
- [x] CRUD Target Link (add, edit, delete, toggle auto-report)
- [x] Reporting via Playwright browser automation (desktop emulation)
- [x] Round-robin multi-account x multi-target reporting
- [x] Mode Variasi (pause after 15-20 success) & Manual
- [x] **Mode Hopping** (Feb 2026): Setiap akun kirim 1 report saja, urutan acak (shuffle), jeda random 15-45 detik antar akun, auto-stop setelah semua selesai
- [x] Auto-resume worker on server restart (MongoDB persistence)
- [x] Screenshot proof of "Thanks for reporting" dialog
- [x] Monitor worker (check every 3 hours)
- [x] Dashboard with stats, recent logs, 3 mode auto-report controls
- [x] **Auto Post Feature** (Feb 2026):
  - Schedule creation (account, theme, language, time)
  - AI caption generation (GPT-5.2) with trending hashtags
  - AI image generation (GPT Image 1)
  - Instagram posting via instagrapi fresh login
  - Background scheduler + History log + Preview caption
  - Frontend UI page at /auto-post

### Backlog / Future
- [ ] Multi-schedule per akun
- [ ] Preview image sebelum posting
- [ ] Retry logic untuk kegagalan posting
- [ ] Analytics dashboard
- [ ] Refactoring: Break server.py into modules

## DB Collections
- `ig_accounts`, `ig_sessions`, `report_targets`, `report_logs`
- `monitor_checks`, `auto_report_state`
- `auto_post_schedules`, `auto_post_history`
