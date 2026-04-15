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
- [x] Auto-resume worker on server restart (MongoDB persistence)
- [x] Screenshot proof of "Thanks for reporting" dialog
- [x] Monitor worker (check every 3 hours)
- [x] Dashboard with stats, recent logs, auto-report controls
- [x] **Auto Post Feature** (Feb 2026):
  - Schedule creation (account, theme, language, time)
  - AI caption generation (GPT-5.2 via emergentintegrations) with trending hashtags
  - AI image generation (GPT Image 1 via emergentintegrations)
  - Instagram posting via instagrapi fresh login (photo_upload)
  - Playwright browser as fallback method
  - Background scheduler (checks every 60s, posts at scheduled time)
  - History log with image proof and IG post link
  - Preview caption feature
  - Full CRUD for schedules
  - Frontend UI page at /auto-post

### Bug Fix (Feb 2026):
- [x] Fixed: instagrapi `media/configure` returning 403 `login_required` - Root cause: stale session. Fix: fresh login before each posting attempt
- [x] Fixed: Playwright browser posting failing due to profile selection screen on IG homepage
- [x] Solution: Dual approach - instagrapi fresh login (primary) + Playwright browser (fallback)

### Backlog / Future
- [ ] Multi-schedule per akun
- [ ] Preview image sebelum posting
- [ ] Retry logic untuk kegagalan posting
- [ ] Analytics dashboard (posting success rate)
- [ ] Refactoring: Break server.py into modules

## Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/accounts | List accounts |
| POST | /api/accounts | Create account |
| POST | /api/accounts/{id}/login | Login IG account |
| GET | /api/targets | List report targets |
| POST | /api/targets | Create target |
| POST | /api/auto-report/start | Start auto-report |
| POST | /api/auto-report/stop | Stop auto-report |
| GET | /api/dashboard/stats | Dashboard stats |
| GET | /api/auto-post/languages | Available languages |
| POST | /api/auto-post/schedules | Create auto-post schedule |
| GET | /api/auto-post/schedules | List schedules |
| PATCH | /api/auto-post/schedules/{id} | Update schedule |
| DELETE | /api/auto-post/schedules/{id} | Delete schedule |
| POST | /api/auto-post/schedules/{id}/post-now | Trigger post immediately |
| GET | /api/auto-post/history | Posting history |
| POST | /api/auto-post/preview | Preview AI caption |

## DB Collections
- `ig_accounts`, `ig_sessions`, `report_targets`, `report_logs`
- `monitor_checks`, `auto_report_state`
- `auto_post_schedules`, `auto_post_history`
