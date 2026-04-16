# Instagram Report Automation + Auto Post - PRD

## Problem Statement
Aplikasi otomasi Instagram: reporting, monitoring, auto-posting AI content, multi-account management dengan proxy IPRoyal.

## Architecture
- **Backend**: FastAPI + PyMongo (Motor async) + Playwright + emergentintegrations (LLM) + instagrapi
- **Frontend**: React + Shadcn UI + Phosphor Icons
- **Database**: MongoDB
- **Proxy**: IPRoyal Residential (rotating, session-based per account)

## Completed Features
- [x] CRUD Akun Instagram + auto-assign proxy IPRoyal
- [x] CRUD Target Link
- [x] Reporting via Playwright (desktop emulation) + auto session refresh
- [x] Round-robin multi-account x multi-target reporting
- [x] Mode Variasi, Manual, **Hopping** (acak, 1 report per akun, jeda random)
- [x] Auto-resume worker on server restart
- [x] Screenshot proof
- [x] Monitor worker (3 hours)
- [x] **Proxy Health Worker** (auto-check every 10 min, stored in DB, no manual click)
- [x] **Status Proxy + IP Address columns** (auto-populated)
- [x] **Auto Post Feature**:
  - AI caption (GPT-5.2) + trending hashtags
  - **Image source**: AI (GPT Image 1), Web (Unsplash/Pexels), Mixed (random)
  - Instagram posting via instagrapi fresh login
  - Background scheduler (WIB timezone)
  - History + Preview

## Backlog
- [ ] Multi-schedule per akun
- [ ] Preview image sebelum posting
- [ ] Retry logic kegagalan posting
- [ ] Refactoring server.py ke modul terpisah
