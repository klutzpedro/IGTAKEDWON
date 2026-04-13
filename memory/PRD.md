# IG Reporter - Instagram Reporting Automation App

## Problem Statement
Aplikasi untuk login ke Instagram, memasukkan link postingan/akun yang ingin dilaporkan, dan melakukan report otomatis berulang kali sampai konten tersebut dihapus. Tujuan: melaporkan konten disinformasi, fitnah, dan kebencian.

## Architecture
- **Backend**: FastAPI + MongoDB + instagrapi (Instagram Private API)
- **Frontend**: React + Tailwind CSS + Shadcn UI + Phosphor Icons
- **Database**: MongoDB (ig_accounts, report_targets, report_logs, ig_sessions)

## User Personas
- Content moderator / activist yang ingin melaporkan konten berbahaya di Instagram
- No authentication required for the web app

## Core Requirements
1. Multi-account Instagram management
2. URL-based target input (posts, reels, stories, profiles)
3. Automated reporting using Instagram's report categories
4. Repeated auto-reporting until content is taken down
5. Monitoring dashboard for progress tracking

## What's Been Implemented (April 2026)
- [x] Dashboard with real-time stats (active accounts, reports sent, success/fail, takedowns)
- [x] Account management (add/remove/login/logout multiple IG accounts)
- [x] Report target management (add URL, select category, toggle auto-report)
- [x] Instagram URL parser (post, reel, story, profile detection)
- [x] Manual and automatic reporting via instagrapi
- [x] Monitoring page with status filters and detailed logs
- [x] Auto-report background worker with start/stop control
- [x] 12 Instagram report categories matching actual IG options
- [x] Swiss high-contrast light theme UI

## Prioritized Backlog
### P0 (Must have for production)
- Real Instagram account testing with actual credentials
- Challenge/2FA handling for Instagram login
- Rate limiting and anti-ban measures

### P1
- Proxy support per account to avoid IP bans
- Bulk URL import
- Export report logs

### P2
- Scheduled reporting (time-based)
- Webhook notifications for takedown events
- Multi-language support
