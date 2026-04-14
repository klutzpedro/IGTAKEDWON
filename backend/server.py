from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import re
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Thread pool for blocking instagrapi calls
ig_executor = ThreadPoolExecutor(max_workers=4)

# --- Models ---
class IGAccountCreate(BaseModel):
    username: str
    password: str
    proxy: str = ""

class IGAccountUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    proxy: Optional[str] = None

class ChallengeSubmit(BaseModel):
    code: str

class ReportTargetCreate(BaseModel):
    url: str
    category: str = "spam"
    auto_report: bool = False

# --- Instagram URL Parser ---
def parse_instagram_url(url: str) -> dict:
    url = url.strip().rstrip('/')
    post_match = re.search(r'instagram\.com/p/([A-Za-z0-9_-]+)', url)
    if post_match:
        return {"type": "post", "shortcode": post_match.group(1), "display": f"Post: {post_match.group(1)}"}
    reel_match = re.search(r'instagram\.com/reels?/([A-Za-z0-9_-]+)', url)
    if reel_match:
        return {"type": "reel", "shortcode": reel_match.group(1), "display": f"Reel: {reel_match.group(1)}"}
    story_match = re.search(r'instagram\.com/stories/([^/]+)/(\d+)', url)
    if story_match:
        return {"type": "story", "username": story_match.group(1), "story_id": story_match.group(2), "display": f"Story: @{story_match.group(1)}"}
    profile_match = re.search(r'instagram\.com/([A-Za-z0-9_.]+)/?$', url)
    if profile_match and profile_match.group(1) not in ['p', 'reel', 'reels', 'stories', 'explore', 'accounts']:
        return {"type": "profile", "username": profile_match.group(1), "display": f"@{profile_match.group(1)}"}
    return {"type": "unknown", "display": url}

REPORT_CATEGORIES = [
    {"id": "spam", "label": "Spam"},
    {"id": "nudity", "label": "Nudity or sexual activity"},
    {"id": "hate_speech", "label": "Hate speech or symbols"},
    {"id": "violence", "label": "Violence or dangerous organizations"},
    {"id": "illegal_sales", "label": "Sale of illegal or regulated goods"},
    {"id": "bullying", "label": "Bullying or harassment"},
    {"id": "ip_violation", "label": "Intellectual property violation"},
    {"id": "suicide", "label": "Suicide or self-injury"},
    {"id": "eating_disorders", "label": "Eating disorders"},
    {"id": "scam", "label": "Scam or fraud"},
    {"id": "false_information", "label": "False information"},
    {"id": "dont_like", "label": "I just don't like it"},
]

CATEGORY_TO_REASON_ID = {
    "spam": 1, "nudity": 2, "hate_speech": 4, "violence": 5,
    "illegal_sales": 6, "bullying": 7, "ip_violation": 8,
    "suicide": 9, "eating_disorders": 10, "scam": 11,
    "false_information": 12, "dont_like": 0,
}

# --- Instagram Client Manager ---
ig_clients = {}
challenge_states = {}

def create_ig_client(proxy: str = ""):
    from instagrapi import Client as IGClient
    cl = IGClient()
    cl.delay_range = [1, 3]
    cl.request_timeout = 15
    cl.set_settings({
        "user_agent": "Instagram 317.0.0.24.109 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 562830598)",
        "device_settings": {
            "app_version": "317.0.0.24.109",
            "android_version": 33, "android_release": "13",
            "dpi": "420dpi", "resolution": "1080x2340",
            "manufacturer": "samsung", "device": "o1s",
            "model": "SM-G991B", "cpu": "exynos2100",
            "version_code": "562830598"
        }
    })
    if proxy:
        cl.set_proxy(proxy)
    return cl


# ============ SYNC functions (run in thread pool) ============

def _sync_login(username: str, password: str, proxy: str, session_settings: dict = None) -> dict:
    """Synchronous login - runs in thread pool. Returns result dict."""
    from instagrapi.exceptions import (
        ChallengeRequired, TwoFactorRequired, BadPassword,
        PleaseWaitFewMinutes, RecaptchaChallengeForm,
        SelectContactPointRecoveryForm
    )
    cl = create_ig_client(proxy)

    # Try session restore
    if session_settings:
        try:
            cl.set_settings(session_settings)
            cl.login(username, password)
            return {"status": "logged_in", "message": "Login berhasil (dari session)", "client": cl, "settings": cl.get_settings()}
        except Exception:
            cl = create_ig_client(proxy)

    # Fresh login
    try:
        cl.login(username, password)
        return {"status": "logged_in", "message": "Login berhasil!", "client": cl, "settings": cl.get_settings()}

    except ChallengeRequired:
        challenge_info = cl.last_json.get("challenge", {})
        api_path = challenge_info.get("api_path", "")
        if not api_path:
            return {"status": "failed", "message": "Challenge diperlukan tapi tidak ada info path"}

        challenge_path = api_path.replace("/api/v1/", "")
        method_label = "email"
        available_methods = []

        try:
            resp = cl.private_request(challenge_path, method="GET")
            step_name = resp.get("step_name", "")
            logger.info(f"Challenge step: {step_name}")

            if step_name == "select_verify_method":
                step_data = resp.get("step_data", {})
                cp = step_data.get("contact_point", "")
                pn = step_data.get("phone_number", "")
                if cp:
                    available_methods.append({"type": "email", "hint": cp})
                if pn:
                    available_methods.append({"type": "sms", "hint": pn})
                choice = "1" if cp else "0"
                method_label = "email" if choice == "1" else "sms"
                cl.private_request(challenge_path, data={"choice": choice})

            elif step_name in ("verify_code", "submit_phone"):
                step_data = resp.get("step_data", {})
                cp = step_data.get("contact_point", "")
                method_label = "email" if "@" in cp else "sms"
                available_methods.append({"type": method_label, "hint": cp})

            elif step_name == "delta_login_review":
                cl.private_request(challenge_path, data={"choice": "0"})
                method_label = "approval"
                available_methods.append({"type": "approval", "hint": "Approve from device"})
            else:
                method_label = "unknown"
                available_methods.append({"type": "unknown", "hint": step_name})

        except Exception as inner_e:
            logger.error(f"Challenge handling: {inner_e}")

        return {
            "status": "challenge_required",
            "message": f"Verifikasi diperlukan via {method_label}. Cek email/SMS Anda.",
            "method": method_label,
            "available_methods": available_methods,
            "client": cl,
            "api_path": api_path,
            "challenge_path": challenge_path,
            "username": username,
            "password": password,
        }

    except TwoFactorRequired:
        return {
            "status": "challenge_required",
            "message": "Masukkan kode 2FA dari authenticator app.",
            "method": "2fa",
            "client": cl,
            "api_path": "2fa",
            "challenge_path": "2fa",
            "username": username,
            "password": password,
        }

    except BadPassword:
        return {"status": "failed", "message": "Password salah"}

    except PleaseWaitFewMinutes:
        return {"status": "failed", "message": "Terlalu banyak percobaan. Tunggu beberapa menit."}

    except RecaptchaChallengeForm:
        return {"status": "failed", "message": "CAPTCHA muncul. Gunakan proxy residential atau tunggu beberapa jam."}

    except SelectContactPointRecoveryForm:
        return {"status": "failed", "message": "Instagram meminta recovery contact. Login via browser dulu."}

    except Exception as e:
        err = str(e)
        logger.error(f"Login error for {username}: {err}")
        if "challenge" in err.lower():
            challenge_info = getattr(cl, 'last_json', {}) or {}
            api_path = challenge_info.get("challenge", {}).get("api_path", "")
            return {
                "status": "challenge_required",
                "message": "Verifikasi diperlukan. Cek email/SMS.",
                "method": "email",
                "client": cl,
                "api_path": api_path,
                "challenge_path": api_path.replace("/api/v1/", "") if api_path else "",
                "username": username,
                "password": password,
            }
        if "please wait" in err.lower():
            return {"status": "failed", "message": "Rate-limit. Tunggu beberapa menit."}
        if "bad password" in err.lower() or "password" in err.lower():
            return {"status": "failed", "message": "Password salah."}
        if "user not found" in err.lower():
            return {"status": "failed", "message": "Username tidak ditemukan."}
        return {"status": "failed", "message": f"Login gagal: {err[:300]}"}


def _sync_submit_challenge(cl, challenge_path: str, method: str, code: str, username: str, password: str) -> dict:
    """Synchronous challenge submission - runs in thread pool."""
    try:
        if method == "2fa":
            two_factor_info = cl.last_json or {}
            two_factor_id = two_factor_info.get("two_factor_info", {}).get("two_factor_identifier", "")
            result = cl.private_request("accounts/two_factor_login/", data={
                "username": username, "verification_code": code.strip(),
                "two_factor_identifier": two_factor_id,
                "verification_method": "1", "trust_this_device": "1",
            })
        else:
            if not challenge_path:
                return {"status": "failed", "message": "Challenge path tidak valid. Login ulang."}
            result = cl.private_request(challenge_path, data={"security_code": code.strip()})

        logger.info(f"Challenge result: {json.dumps(result, default=str)[:500]}")

        if result.get("logged_in_user") or result.get("status") == "ok":
            return {"status": "logged_in", "message": "Verifikasi berhasil!", "client": cl, "settings": cl.get_settings()}

        if result.get("action") == "close":
            try:
                cl.login(username, password)
                return {"status": "logged_in", "message": "Verifikasi berhasil!", "client": cl, "settings": cl.get_settings()}
            except Exception as e2:
                return {"status": "failed", "message": f"Verifikasi diterima tapi re-login gagal: {str(e2)[:200]}"}

        return {"status": "failed", "message": f"Kode tidak valid. Response: {json.dumps(result, default=str)[:300]}"}

    except Exception as e:
        err = str(e)
        logger.error(f"Challenge submit error: {err}")
        if "bad" in err.lower() or "invalid" in err.lower() or "code" in err.lower():
            return {"status": "failed", "message": "Kode verifikasi salah. Coba lagi."}
        return {"status": "failed", "message": f"Error: {err[:300]}"}


def _sync_resend_challenge(cl, challenge_path: str) -> dict:
    """Synchronous resend - runs in thread pool."""
    try:
        cl.private_request(challenge_path, data={"choice": "1"})
        return {"status": "ok", "message": "Kode verifikasi dikirim ulang."}
    except Exception as e:
        return {"status": "failed", "message": f"Gagal kirim ulang: {str(e)[:200]}"}


def _sync_report(cookies: dict, target_url: str, category: str) -> dict:
    """Report via browser automation - completes full Instagram report flow with screenshot proof."""
    from playwright.sync_api import sync_playwright
    import time
    import subprocess

    # Verify chromium available
    chrome_path = "/app/.browsers/chromium-1208/chrome-linux/chrome"
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/app/.browsers"
    if not os.path.exists(chrome_path):
        return {"status": "failed", "message": "Chromium tidak tersedia. Deploy ulang diperlukan."}

    try:
        parsed = parse_instagram_url(target_url)
        session_id = cookies.get("sessionid", "")
        if not session_id:
            return {"status": "failed", "message": "Session tidak tersedia. Login ulang diperlukan."}

        clean_url = target_url.split("?")[0]
        timestamp = int(time.time())
        shortcode = parsed.get("shortcode", parsed.get("username", "unknown"))

        # Map categories to Instagram's report option text
        category_text_map = {
            "false_information": "False information",
            "hate_speech": "Violence, hate or exploitation",
            "spam": "Scam, fraud or spam",
            "nudity": "Nudity or sexual activity",
            "violence": "Violence, hate or exploitation",
            "illegal_sales": "Selling or promoting restricted items",
            "bullying": "Bullying or unwanted contact",
            "scam": "Scam, fraud or spam",
            "suicide": "Suicide, self-injury or eating disorders",
            "eating_disorders": "Suicide, self-injury or eating disorders",
            "dont_like": "I just don't like it",
        }

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"],
                executable_path="/app/.browsers/chromium-1208/chrome-linux/chrome"
            )
            ctx = browser.new_context(
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            all_cookies = [
                {"name": "sessionid", "value": session_id, "domain": ".instagram.com", "path": "/"},
                {"name": "csrftoken", "value": cookies.get("csrftoken", ""), "domain": ".instagram.com", "path": "/"},
                {"name": "ds_user_id", "value": str(cookies.get("ds_user_id", "")), "domain": ".instagram.com", "path": "/"},
            ]
            for k in ["mid", "ig_did", "rur", "ig_nrcb"]:
                if cookies.get(k):
                    all_cookies.append({"name": k, "value": cookies[k], "domain": ".instagram.com", "path": "/"})
            all_cookies.append({"name": "ig_nrcb", "value": "1", "domain": ".instagram.com", "path": "/"})
            ctx.add_cookies(all_cookies)

            page = ctx.new_page()

            try:
                # Step 1: Establish session
                page.goto("https://www.instagram.com/", wait_until="domcontentloaded", timeout=20000)
                time.sleep(2)

                # Step 2: Navigate to target
                page.goto(clean_url, wait_until="domcontentloaded", timeout=20000)
                time.sleep(3)

                if "login" in page.url.lower():
                    browser.close()
                    return {"status": "failed", "message": "Session expired. Login ulang diperlukan."}

                # Dismiss popups
                for sel in ['button:has-text("Not Now")', 'button:has-text("Not now")']:
                    try:
                        el = page.locator(sel).first
                        if el.is_visible(timeout=1000):
                            el.click(force=True)
                            time.sleep(0.5)
                    except:
                        pass

                if parsed["type"] in ("post", "reel"):
                    # Step 3: Click three-dot menu
                    try:
                        more = page.locator('svg[aria-label="More options"]').first
                        more.click(force=True)
                        time.sleep(2)
                    except Exception as e:
                        browser.close()
                        return {"status": "failed", "message": f"Menu tidak ditemukan: {str(e)[:100]}"}

                    # Step 4: Click Report
                    report_clicked = False
                    for sel in ['button:has-text("Report")', 'button:has-text("Laporkan")']:
                        try:
                            el = page.locator(sel).first
                            if el.is_visible(timeout=3000):
                                el.click()
                                report_clicked = True
                                time.sleep(3)
                                break
                        except:
                            continue

                    if not report_clicked:
                        ss = f"noreport_{shortcode}_{timestamp}.png"
                        try: page.screenshot(path=f"/app/backend/screenshots/{ss}", full_page=False)
                        except: ss = ""
                        browser.close()
                        return {"status": "failed", "message": "Tombol Report tidak muncul di menu.", "screenshot": ss}

                    # Step 5: Select report category
                    target_text = category_text_map.get(category, "I just don't like it")
                    category_clicked = False
                    try:
                        # Try exact match first
                        opt = page.locator(f'button:has-text("{target_text}")').first
                        if opt.is_visible(timeout=2000):
                            opt.click()
                            category_clicked = True
                            time.sleep(3)
                    except:
                        pass

                    if not category_clicked:
                        # Try partial match
                        buttons = page.locator('button').all()
                        for btn in buttons:
                            try:
                                txt = (btn.inner_text() or "").strip()
                                if txt and btn.is_visible() and target_text.lower()[:10] in txt.lower():
                                    btn.click()
                                    category_clicked = True
                                    time.sleep(3)
                                    break
                            except:
                                continue

                    if not category_clicked:
                        # Fallback: click "I just don't like it"
                        try:
                            fallback = page.locator('button:has-text("I just don")').first
                            if fallback.is_visible(timeout=1500):
                                fallback.click()
                                time.sleep(3)
                        except:
                            pass

                    # Step 6: Handle sub-categories (Instagram has 2-level report flow)
                    # After selecting main category, sub-options may appear
                    time.sleep(1)
                    sub_options = page.locator('button, [role="menuitem"]').all()
                    for opt in sub_options:
                        try:
                            txt = (opt.inner_text() or "").strip()
                            vis = opt.is_visible()
                            # Click first visible sub-option that looks like a report reason
                            # (has arrow > indicator, not Submit/Close)
                            if (vis and txt and len(txt) > 5 and len(txt) < 80
                                and txt not in ["Submit report", "Close", "Cancel"]
                                and "submit" not in txt.lower() and "close" not in txt.lower()):
                                # Check if this is a clickable sub-option (has arrow)
                                parent_html = opt.evaluate("el => el.outerHTML")
                                if ">" in (opt.inner_text() or "") or opt.evaluate("el => el.querySelector('svg') !== null"):
                                    opt.click()
                                    time.sleep(2)
                                    break
                        except:
                            continue

                    # Step 7: Click Submit report button
                    for _ in range(3):
                        for btn_text in ["Submit report", "Submit Report", "Submit", "Next", "Done"]:
                            try:
                                btn = page.locator(f'button:has-text("{btn_text}")').first
                                if btn.is_visible(timeout=1500):
                                    btn.click()
                                    time.sleep(3)
                            except:
                                continue

                    # Step 7: CAPTURE SCREENSHOT NOW (before closing) - this is when "Thanks for reporting" shows
                    time.sleep(2)
                    page_text = page.content().lower()
                    confirmed = ("thanks for reporting" in page_text
                                or "thank you for reporting" in page_text
                                or "terima kasih" in page_text)

                    ss = f"report_{shortcode}_{timestamp}.png"
                    try: page.screenshot(path=f"/app/backend/screenshots/{ss}", full_page=False)
                    except: ss = ""

                    # Step 8: Click Close AFTER screenshot
                    try:
                        close = page.locator('button:has-text("Close")').first
                        if close.is_visible(timeout=1500):
                            close.click()
                    except:
                        pass

                    browser.close()

                    if confirmed:
                        return {
                            "status": "success",
                            "message": f"Report BERHASIL terkirim ke Instagram untuk {parsed.get('display', '')}. Konfirmasi: 'Thanks for reporting this post'",
                            "screenshot": ss
                        }
                    else:
                        return {
                            "status": "success",
                            "message": f"Report flow selesai untuk {parsed.get('display', '')}. Cek screenshot untuk bukti.",
                            "screenshot": ss
                        }

                elif parsed["type"] == "profile":
                    # Profile report flow
                    try:
                        opts = page.locator('svg[aria-label="Options"], svg[aria-label="Opsi"]').first
                        opts.click(force=True)
                        time.sleep(2)
                    except:
                        browser.close()
                        return {"status": "failed", "message": "Menu profil tidak ditemukan."}

                    report_clicked = False
                    for sel in ['button:has-text("Report")', 'button:has-text("Laporkan")']:
                        try:
                            el = page.locator(sel).first
                            if el.is_visible(timeout=3000):
                                el.click()
                                report_clicked = True
                                time.sleep(3)
                                break
                        except:
                            continue

                    if not report_clicked:
                        browser.close()
                        return {"status": "failed", "message": "Tombol Report tidak muncul di menu profil."}

                    # Select reason and submit
                    target_text = category_text_map.get(category, "I just don't like it")
                    try:
                        opt = page.locator(f'button:has-text("{target_text}")').first
                        if opt.is_visible(timeout=2000):
                            opt.click()
                            time.sleep(3)
                    except:
                        pass

                    for _ in range(3):
                        for btn_text in ["Submit report", "Submit", "Next", "Done"]:
                            try:
                                btn = page.locator(f'button:has-text("{btn_text}")').first
                                if btn.is_visible(timeout=1000):
                                    btn.click()
                                    time.sleep(2)
                            except:
                                continue

                    ss = f"report_{shortcode}_{timestamp}.png"
                    try: page.screenshot(path=f"/app/backend/screenshots/{ss}", full_page=False)
                    except: ss = ""
                    browser.close()
                    return {"status": "success", "message": f"Report terkirim untuk @{parsed.get('username', '')}", "screenshot": ss}

                browser.close()
                return {"status": "failed", "message": "Tipe target belum didukung."}

            except Exception as e:
                browser.close()
                return {"status": "failed", "message": f"Browser error: {str(e)[:250]}"}

    except Exception as e:
        return {"status": "failed", "message": f"Error: {str(e)[:300]}"}


def _sync_report_via_help_form(cookies: dict, target_url: str, category: str, parsed: dict) -> dict:
    """Fallback: report via Instagram web API."""
    try:
        import requests as req

        session = req.Session()

        # Set session cookies
        for k, v in cookies.items():
            if isinstance(v, str):
                session.cookies.set(k, v, domain=".instagram.com")

        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "X-CSRFToken": cookies.get("csrftoken", ""),
            "X-Instagram-AJAX": "1",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": target_url,
        })

        reason_map = {
            "spam": 1, "nudity": 2, "hate_speech": 4, "violence": 5,
            "illegal_sales": 6, "bullying": 7, "ip_violation": 8,
            "suicide": 9, "eating_disorders": 10, "scam": 11,
            "false_information": 12, "dont_like": 0,
        }
        reason_id = reason_map.get(category, 1)

        # Try web API reporting endpoints
        web_endpoints = [
            f"https://www.instagram.com/api/v1/media/{parsed.get('shortcode', '')}/report/",
            f"https://www.instagram.com/web/report/",
        ]

        for ep in web_endpoints:
            try:
                resp = session.post(ep, data={
                    "reason_id": str(reason_id),
                    "source_name": "web_report",
                }, timeout=15)
                if resp.status_code == 200:
                    return {"status": "success", "message": f"Report dikirim via web form: {parsed.get('display', '')}"}
            except:
                continue

        return {
            "status": "failed",
            "message": "Report via browser dan web form gagal. Instagram membatasi reporting dari server. Saran: gunakan proxy residential atau report secara manual via app Instagram, lalu update status di monitoring."
        }

    except Exception as e:
        return {"status": "failed", "message": f"Fallback report gagal: {str(e)[:200]}"}


# ============ ASYNC wrappers ============

async def attempt_login(account_id: str) -> dict:
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        return {"status": "failed", "message": "Akun tidak ditemukan"}

    session_doc = await db.ig_sessions.find_one({"account_id": account_id}, {"_id": 0})
    session_settings = session_doc.get("settings") if session_doc else None

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        ig_executor,
        _sync_login, account["username"], account["password"],
        account.get("proxy", ""), session_settings
    )

    if result["status"] == "logged_in":
        ig_clients[account_id] = result.pop("client")
        settings = result.pop("settings", None)
        if settings:
            await db.ig_sessions.update_one(
                {"account_id": account_id},
                {"$set": {"account_id": account_id, "settings": settings}}, upsert=True)
        await db.ig_accounts.update_one({"id": account_id},
            {"$set": {"is_logged_in": True, "login_status": "logged_in", "login_error": None, "challenge_method": None}})

    elif result["status"] == "challenge_required":
        cl = result.pop("client", None)
        challenge_states[account_id] = {
            "client": cl,
            "api_path": result.pop("api_path", ""),
            "challenge_path": result.pop("challenge_path", ""),
            "method": result.get("method", "email"),
            "username": result.pop("username", account["username"]),
            "password": result.pop("password", account["password"]),
        }
        await db.ig_accounts.update_one({"id": account_id},
            {"$set": {"login_status": "challenge_required",
                      "login_error": result["message"],
                      "challenge_method": result.get("method", "email")}})

    else:
        result.pop("client", None)
        result.pop("settings", None)
        await db.ig_accounts.update_one({"id": account_id},
            {"$set": {"login_status": "failed", "login_error": result["message"]}})

    return result


async def submit_challenge(account_id: str, code: str) -> dict:
    state = challenge_states.get(account_id)
    if not state:
        return {"status": "failed", "message": "Tidak ada challenge pending. Login ulang."}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        ig_executor,
        _sync_submit_challenge,
        state["client"], state["challenge_path"], state["method"],
        code, state["username"], state["password"]
    )

    if result["status"] == "logged_in":
        ig_clients[account_id] = result.pop("client")
        settings = result.pop("settings", None)
        if settings:
            await db.ig_sessions.update_one(
                {"account_id": account_id},
                {"$set": {"account_id": account_id, "settings": settings}}, upsert=True)
        challenge_states.pop(account_id, None)
        await db.ig_accounts.update_one({"id": account_id},
            {"$set": {"is_logged_in": True, "login_status": "logged_in", "login_error": None, "challenge_method": None}})
    else:
        result.pop("client", None)
        result.pop("settings", None)

    return result


async def perform_report(target: dict, account: dict) -> dict:
    # Get session cookies directly from DB (survives server restart)
    session_doc = await db.ig_sessions.find_one({"account_id": account["id"]}, {"_id": 0})
    
    if not session_doc or not session_doc.get("settings"):
        return {"status": "failed", "message": "Session tidak tersedia. Login ulang diperlukan."}
    
    settings = session_doc["settings"]
    # instagrapi stores session in authorization_data, not cookies
    auth_data = settings.get("authorization_data", {})
    cookies = settings.get("cookies", {})
    
    session_id = auth_data.get("sessionid", "") or cookies.get("sessionid", "")
    ds_user_id = str(auth_data.get("ds_user_id", "") or cookies.get("ds_user_id", ""))
    mid = settings.get("mid", "")
    
    if not session_id:
        return {"status": "failed", "message": "Session cookies tidak ada. Login ulang diperlukan."}
    
    # Build cookies dict for browser
    browser_cookies = {
        "sessionid": session_id,
        "ds_user_id": ds_user_id,
        "csrftoken": cookies.get("csrftoken", ""),
        "mid": mid,
        "ig_did": settings.get("ig_did", ""),
        "rur": cookies.get("rur", ""),
    }

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        ig_executor,
        _sync_report, browser_cookies, target["url"], target.get("category", "spam")
    )


# --- Auto Report ---
auto_report_running = False
auto_report_task = None
auto_report_mode = "manual"
auto_report_cycle_count = 0

async def auto_report_worker():
    """Smart round-robin: rotates accounts across targets for maximum coverage.
    Each cycle: every account reports every target once.
    Variasi: pause after 15-20 total successes, resume after 1 hour."""
    global auto_report_running, auto_report_cycle_count
    import random

    cycle_success = 0
    cycle_limit = random.randint(15, 20)
    logger.info(f"Auto-report started: mode={auto_report_mode}, cycle_limit={cycle_limit}")

    while auto_report_running:
        try:
            targets = await db.report_targets.find(
                {"auto_report": True, "status": {"$nin": ["taken_down"]}}, {"_id": 0}).to_list(100)
            accounts = await db.ig_accounts.find({"is_logged_in": True}, {"_id": 0}).to_list(100)

            if not accounts or not targets:
                await asyncio.sleep(30)
                continue

            n_targets = len(targets)
            n_accounts = len(accounts)
            logger.info(f"Round-robin: {n_accounts} akun x {n_targets} target = {n_accounts * n_targets} kombinasi")

            # Update state
            await db.auto_report_state.update_one({"key": "state"}, {"$set": {
                "running": True, "mode": auto_report_mode, "paused": False,
                "active_targets": n_targets, "active_accounts": n_accounts,
                "cycle_success": cycle_success, "cycle_limit": cycle_limit,
            }}, upsert=True)

            # Round-robin: distribute accounts across targets simultaneously
            # Each round: account[i] reports target[(i + round) % n_targets]
            round_num = 0
            max_rounds = max(n_targets, n_accounts)  # Ensure all combos covered

            for round_num in range(max_rounds):
                if not auto_report_running:
                    break

                for acc_idx, account in enumerate(accounts):
                    if not auto_report_running:
                        break

                    target_idx = (acc_idx + round_num) % n_targets
                    target = targets[target_idx]

                    try:
                        result = await perform_report(target, account)
                    except Exception as report_err:
                        logger.error(f"Report exception for {target.get('display_name','')}: {report_err}")
                        result = {"status": "failed", "message": f"Exception: {str(report_err)[:200]}"}

                    log_doc = {
                        "id": str(uuid.uuid4()),
                        "target_id": target["id"],
                        "target_display": target.get("display_name", ""),
                        "target_url": target.get("url", ""),
                        "account_username": account["username"],
                        "status": result["status"],
                        "message": result["message"],
                        "category": target.get("category", "spam"),
                        "screenshot": result.get("screenshot", ""),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.report_logs.insert_one(log_doc)

                    if result["status"] == "success":
                        await db.report_targets.update_one(
                            {"id": target["id"]},
                            {"$inc": {"total_reports_sent": 1},
                             "$set": {"last_report_at": datetime.now(timezone.utc).isoformat(), "status": "reported"}})
                        cycle_success += 1
                        auto_report_cycle_count = cycle_success
                    else:
                        await db.report_targets.update_one(
                            {"id": target["id"]},
                            {"$set": {"last_report_at": datetime.now(timezone.utc).isoformat()}})

                    # Update live state
                    await db.auto_report_state.update_one({"key": "state"}, {"$set": {
                        "cycle_success": cycle_success,
                        "last_account": account["username"],
                        "last_target": target.get("display_name", ""),
                    }}, upsert=True)

                    # Variasi: pause after cycle_limit successes
                    if auto_report_mode == "variasi" and cycle_success >= cycle_limit:
                        break

                    await asyncio.sleep(8)

                # Check variasi pause
                if auto_report_mode == "variasi" and cycle_success >= cycle_limit:
                    logger.info(f"Variasi: {cycle_success} berhasil. Jeda 1 jam...")
                    resume_at = (datetime.now(timezone.utc) + __import__('datetime').timedelta(hours=1)).isoformat()
                    await db.auto_report_state.update_one({"key": "state"}, {"$set": {
                        "paused": True, "cycle_success": cycle_success,
                        "paused_at": datetime.now(timezone.utc).isoformat(),
                        "resume_at": resume_at,
                    }}, upsert=True)

                    for _ in range(60):
                        if not auto_report_running:
                            break
                        await asyncio.sleep(60)

                    cycle_success = 0
                    cycle_limit = random.randint(15, 20)
                    auto_report_cycle_count = 0
                    logger.info(f"Variasi: Jeda selesai. Siklus baru limit={cycle_limit}")
                    await db.auto_report_state.update_one({"key": "state"}, {"$set": {
                        "paused": False, "cycle_success": 0, "cycle_limit": cycle_limit,
                    }}, upsert=True)
                    break

            # Wait before next full cycle
            if auto_report_running and not (auto_report_mode == "variasi" and cycle_success >= cycle_limit):
                await asyncio.sleep(20)

        except Exception as e:
            logger.error(f"Auto-report error: {e}")
            await asyncio.sleep(30)


# ==================== API ENDPOINTS ====================

from fastapi.responses import FileResponse

@api_router.get("/")
async def root():
    return {"message": "Instagram Report Automation API"}

@api_router.get("/screenshots/{filename}")
async def get_screenshot(filename: str):
    filepath = f"/app/backend/screenshots/{filename}"
    if not os.path.exists(filepath):
        raise HTTPException(404, "Screenshot tidak ditemukan")
    return FileResponse(filepath, media_type="image/png")

@api_router.get("/report-categories")
async def get_report_categories():
    return REPORT_CATEGORIES

@api_router.get("/dashboard/stats")
async def get_dashboard_stats():
    total_accounts = await db.ig_accounts.count_documents({})
    logged_in = await db.ig_accounts.count_documents({"is_logged_in": True})
    total_targets = await db.report_targets.count_documents({})
    active_targets = await db.report_targets.count_documents({"auto_report": True})
    total_reports = await db.report_logs.count_documents({})
    success = await db.report_logs.count_documents({"status": "success"})
    failed = await db.report_logs.count_documents({"status": "failed"})
    taken_down = await db.report_targets.count_documents({"status": "taken_down"})
    recent = await db.report_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return {
        "total_accounts": total_accounts, "logged_in_accounts": logged_in,
        "total_targets": total_targets, "active_targets": active_targets,
        "total_reports": total_reports, "successful_reports": success,
        "failed_reports": failed, "taken_down": taken_down,
        "recent_logs": recent, "auto_report_running": auto_report_running,
        "auto_report_mode": auto_report_mode,
        "auto_report_cycle_count": auto_report_cycle_count,
        "monitor_running": monitor_running,
    }

# --- Accounts ---
@api_router.post("/accounts")
async def create_account(data: IGAccountCreate):
    existing = await db.ig_accounts.find_one({"username": data.username}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Akun sudah ada")
    doc = {
        "id": str(uuid.uuid4()), "username": data.username, "password": data.password,
        "proxy": data.proxy, "is_logged_in": False, "login_status": "idle",
        "login_error": None, "challenge_method": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ig_accounts.insert_one(doc)
    return {"id": doc["id"], "username": doc["username"], "is_logged_in": False,
            "login_status": "idle", "proxy": doc["proxy"], "created_at": doc["created_at"]}

@api_router.get("/accounts")
async def list_accounts():
    return await db.ig_accounts.find({}, {"_id": 0, "password": 0}).to_list(100)

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str):
    r = await db.ig_accounts.delete_one({"id": account_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Akun tidak ditemukan")
    await db.ig_sessions.delete_one({"account_id": account_id})
    ig_clients.pop(account_id, None)
    challenge_states.pop(account_id, None)
    return {"message": "Akun dihapus"}

@api_router.patch("/accounts/{account_id}")
async def update_account(account_id: str, data: IGAccountUpdate):
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(404, "Akun tidak ditemukan")
    update = {}
    if data.username is not None and data.username.strip():
        dup = await db.ig_accounts.find_one({"username": data.username.strip(), "id": {"$ne": account_id}}, {"_id": 0})
        if dup:
            raise HTTPException(400, "Username sudah digunakan akun lain")
        update["username"] = data.username.strip()
    if data.password is not None and data.password.strip():
        update["password"] = data.password.strip()
    if data.proxy is not None:
        update["proxy"] = data.proxy.strip()
    if not update:
        raise HTTPException(400, "Tidak ada data untuk diupdate")
    if "username" in update or "password" in update:
        update.update({"is_logged_in": False, "login_status": "idle", "login_error": None, "challenge_method": None})
        ig_clients.pop(account_id, None)
        challenge_states.pop(account_id, None)
        await db.ig_sessions.delete_one({"account_id": account_id})
    await db.ig_accounts.update_one({"id": account_id}, {"$set": update})
    return await db.ig_accounts.find_one({"id": account_id}, {"_id": 0, "password": 0})

@api_router.post("/accounts/{account_id}/login")
async def login_account(account_id: str):
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(404, "Akun tidak ditemukan")
    await db.ig_accounts.update_one({"id": account_id},
        {"$set": {"login_status": "logging_in", "login_error": None}})
    result = await attempt_login(account_id)
    if result["status"] == "failed":
        raise HTTPException(400, result["message"])
    return result

@api_router.post("/accounts/{account_id}/challenge")
async def challenge_endpoint(account_id: str, data: ChallengeSubmit):
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(404, "Akun tidak ditemukan")
    result = await submit_challenge(account_id, data.code)
    if result["status"] == "failed":
        raise HTTPException(400, result["message"])
    return result

@api_router.post("/accounts/{account_id}/challenge/resend")
async def resend_challenge(account_id: str):
    state = challenge_states.get(account_id)
    if not state:
        raise HTTPException(400, "Tidak ada challenge pending. Login ulang.")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        ig_executor, _sync_resend_challenge, state["client"], state["challenge_path"])
    if result["status"] == "failed":
        raise HTTPException(400, result["message"])
    return result

@api_router.post("/accounts/{account_id}/logout")
async def logout_account(account_id: str):
    ig_clients.pop(account_id, None)
    challenge_states.pop(account_id, None)
    await db.ig_sessions.delete_one({"account_id": account_id})
    await db.ig_accounts.update_one({"id": account_id},
        {"$set": {"is_logged_in": False, "login_status": "idle", "login_error": None, "challenge_method": None}})
    return {"message": "Logout berhasil"}

# --- Targets ---
@api_router.post("/targets")
async def create_target(data: ReportTargetCreate):
    parsed = parse_instagram_url(data.url)
    doc = {
        "id": str(uuid.uuid4()), "url": data.url, "target_type": parsed["type"],
        "display_name": parsed.get("display", data.url), "category": data.category,
        "auto_report": data.auto_report, "status": "pending",
        "total_reports_sent": 0, "last_report_at": None, "accounts_used": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.report_targets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/targets")
async def list_targets():
    return await db.report_targets.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str):
    r = await db.report_targets.delete_one({"id": target_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Target tidak ditemukan")
    return {"message": "Target dihapus"}

@api_router.patch("/targets/{target_id}")
async def update_target(target_id: str, data: dict):
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Target tidak ditemukan")
    update = {}
    if "url" in data and data["url"] and data["url"].strip():
        new_url = data["url"].strip()
        parsed = parse_instagram_url(new_url)
        update["url"] = new_url
        update["target_type"] = parsed["type"]
        update["display_name"] = parsed.get("display", new_url)
    if "category" in data and data["category"]:
        update["category"] = data["category"]
    if "auto_report" in data and isinstance(data["auto_report"], bool):
        update["auto_report"] = data["auto_report"]
    if not update:
        raise HTTPException(400, "Tidak ada data untuk diupdate")
    await db.report_targets.update_one({"id": target_id}, {"$set": update})
    return await db.report_targets.find_one({"id": target_id}, {"_id": 0})

@api_router.patch("/targets/{target_id}/toggle-auto")
async def toggle_auto_report(target_id: str):
    t = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Target tidak ditemukan")
    new_val = not t.get("auto_report", False)
    await db.report_targets.update_one({"id": target_id}, {"$set": {"auto_report": new_val}})
    return {"auto_report": new_val}

@api_router.patch("/targets/{target_id}/status")
async def update_target_status(target_id: str, status: str):
    valid = ["pending", "reporting", "reported", "failed", "taken_down"]
    if status not in valid:
        raise HTTPException(400, "Status tidak valid")
    await db.report_targets.update_one({"id": target_id}, {"$set": {"status": status}})
    return {"status": status}

@api_router.post("/targets/{target_id}/report")
async def manual_report(target_id: str):
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Target tidak ditemukan")
    accounts = await db.ig_accounts.find({"is_logged_in": True}, {"_id": 0}).to_list(100)
    if not accounts:
        raise HTTPException(400, "Tidak ada akun yang login")

    results = []
    for account in accounts:
        result = await perform_report(target, account)
        log_doc = {
            "id": str(uuid.uuid4()), "target_id": target["id"],
            "target_display": target.get("display_name", ""),
            "target_url": target.get("url", ""),
            "account_username": account["username"], "status": result["status"],
            "message": result["message"], "category": target.get("category", "spam"),
            "screenshot": result.get("screenshot", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.report_logs.insert_one(log_doc)
        results.append(result)

    sc = sum(1 for r in results if r["status"] == "success")
    # Only increment counter for successful reports
    inc_val = sc
    new_total = target.get("total_reports_sent", 0) + inc_val
    await db.report_targets.update_one({"id": target_id}, {"$set": {
        "total_reports_sent": new_total,
        "last_report_at": datetime.now(timezone.utc).isoformat(),
        "status": "reported" if sc > 0 else "failed"
    }})
    return {"results": results, "total_sent": new_total, "success_count": sc, "fail_count": len(results) - sc}

class TargetAutoReportStart(BaseModel):
    mode: str = "manual"

@api_router.post("/targets/{target_id}/report-auto")
async def start_target_auto_report(target_id: str, data: TargetAutoReportStart):
    """Start auto-reporting for a specific target (variasi or manual mode)."""
    global auto_report_running, auto_report_task, auto_report_mode, auto_report_cycle_count
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Target tidak ditemukan")
    accounts = await db.ig_accounts.find({"is_logged_in": True}, {"_id": 0}).to_list(100)
    if not accounts:
        raise HTTPException(400, "Tidak ada akun yang login")
    # Enable auto_report on this target
    await db.report_targets.update_one({"id": target_id}, {"$set": {"auto_report": True}})
    # Start auto-report worker if not running
    if not auto_report_running:
        auto_report_mode = data.mode
        auto_report_running = True
        auto_report_cycle_count = 0
        auto_report_task = asyncio.create_task(auto_report_worker())
        await db.auto_report_state.update_one(
            {"key": "state"}, {"$set": {"running": True, "mode": data.mode, "paused": False, "cycle_success": 0, "target_id": target_id}}, upsert=True)
    return {
        "message": f"Auto-report untuk {target['display_name']} dimulai (mode: {data.mode})",
        "mode": data.mode,
        "auto_report_running": True,
    }

# --- Report Logs ---
@api_router.get("/reports")
async def list_reports(limit: int = 50, target_id: Optional[str] = None):
    q = {"target_id": target_id} if target_id else {}
    return await db.report_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)

# --- Auto Report ---
class AutoReportStart(BaseModel):
    mode: str = "manual"  # "manual" or "variasi"

@api_router.post("/auto-report/start")
async def start_auto_report(data: AutoReportStart):
    global auto_report_running, auto_report_task, auto_report_mode, auto_report_cycle_count
    if auto_report_running:
        return {"message": "Sudah berjalan", "mode": auto_report_mode}
    if data.mode not in ("manual", "variasi"):
        raise HTTPException(400, "Mode harus 'manual' atau 'variasi'")
    auto_report_mode = data.mode
    auto_report_running = True
    auto_report_cycle_count = 0
    auto_report_task = asyncio.create_task(auto_report_worker())
    await db.auto_report_state.update_one(
        {"key": "state"}, {"$set": {"running": True, "mode": data.mode, "paused": False, "cycle_success": 0}}, upsert=True)
    return {"message": f"Auto-report dimulai (mode: {data.mode})", "mode": data.mode}

@api_router.post("/auto-report/stop")
async def stop_auto_report():
    global auto_report_running, auto_report_task, auto_report_cycle_count
    auto_report_running = False
    auto_report_cycle_count = 0
    if auto_report_task:
        auto_report_task.cancel()
        auto_report_task = None
    await db.auto_report_state.update_one(
        {"key": "state"}, {"$set": {"running": False, "paused": False, "cycle_success": 0}}, upsert=True)
    return {"message": "Auto-report dihentikan"}

@api_router.get("/auto-report/status")
async def auto_report_status():
    state = await db.auto_report_state.find_one({"key": "state"}, {"_id": 0})
    return {
        "running": auto_report_running,
        "mode": auto_report_mode,
        "cycle_count": auto_report_cycle_count,
        "cycle_limit": state.get("cycle_limit", 20) if state else 20,
        "paused": state.get("paused", False) if state else False,
        "resume_at": state.get("resume_at", "") if state else "",
        "active_targets": state.get("active_targets", 0) if state else 0,
        "active_accounts": state.get("active_accounts", 0) if state else 0,
        "last_account": state.get("last_account", "") if state else "",
        "last_target": state.get("last_target", "") if state else "",
    }


# --- Link Monitor (check if content still exists every 3 hours) ---
monitor_running = False
monitor_task = None
MONITOR_INTERVAL = 3 * 60 * 60  # 3 hours in seconds

def _sync_check_url(url: str) -> dict:
    """Check if an Instagram URL still exists. Runs in thread pool."""
    import requests as req
    import time

    clean_url = url.split("?")[0]
    try:
        resp = req.get(clean_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        }, timeout=20, allow_redirects=True)

        status_code = resp.status_code
        final_url = resp.url
        page_text = resp.text[:5000].lower()

        # Detect if content is gone
        if status_code == 404:
            return {"alive": False, "reason": "404 - Halaman tidak ditemukan", "http_status": 404}

        if "sorry, this page isn" in page_text or "this page isn't available" in page_text:
            return {"alive": False, "reason": "Halaman tidak tersedia (dihapus/takedown)", "http_status": status_code}

        if "content isn't available" in page_text or "konten tidak tersedia" in page_text:
            return {"alive": False, "reason": "Konten tidak tersedia lagi", "http_status": status_code}

        if "restricted" in page_text and "community guidelines" in page_text:
            return {"alive": False, "reason": "Konten dibatasi karena melanggar pedoman komunitas", "http_status": status_code}

        if "/accounts/login" in final_url and "accounts/login" not in clean_url:
            # Redirected to login - might be private or removed
            return {"alive": "unknown", "reason": "Redirect ke login (mungkin private/dihapus)", "http_status": status_code}

        if status_code == 200:
            # Check for actual content indicators (page already lowercased)
            has_content = ("og:image" in page_text or "og:title" in page_text
                          or "instapp:" in page_text or '"media"' in page_text)
            if has_content:
                return {"alive": True, "reason": "Konten masih ada dan bisa diakses", "http_status": 200}
            
            # Check for "page not available" even with 200 status
            not_available = ("this page isn" in page_text or "halaman ini tidak" in page_text
                            or "sorry, this page" in page_text)
            if not_available:
                return {"alive": False, "reason": "Halaman tidak tersedia (kemungkinan dihapus)", "http_status": 200}
            
            return {"alive": True, "reason": "HTTP 200 - halaman bisa diakses", "http_status": 200}

        return {"alive": "unknown", "reason": f"HTTP {status_code}", "http_status": status_code}

    except req.exceptions.Timeout:
        return {"alive": "unknown", "reason": "Timeout - Instagram tidak merespons", "http_status": 0}
    except Exception as e:
        return {"alive": "unknown", "reason": f"Error: {str(e)[:150]}", "http_status": 0}


async def monitor_worker():
    """Background worker - checks all targets every 3 hours."""
    global monitor_running
    logger.info("Monitor worker started - checking every 3 hours")

    while monitor_running:
        try:
            targets = await db.report_targets.find(
                {"status": {"$ne": "taken_down"}}, {"_id": 0}
            ).to_list(200)

            if not targets:
                await asyncio.sleep(60)
                continue

            logger.info(f"Monitor: checking {len(targets)} targets...")
            loop = asyncio.get_event_loop()

            for target in targets:
                if not monitor_running:
                    break

                result = await loop.run_in_executor(ig_executor, _sync_check_url, target["url"])

                check_doc = {
                    "id": str(uuid.uuid4()),
                    "target_id": target["id"],
                    "alive": result["alive"],
                    "reason": result["reason"],
                    "http_status": result["http_status"],
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.monitor_checks.insert_one(check_doc)

                # Auto-update target status if confirmed taken down
                if result["alive"] is False:
                    await db.report_targets.update_one(
                        {"id": target["id"]},
                        {"$set": {
                            "status": "taken_down",
                            "link_status": "taken_down",
                            "last_checked_at": check_doc["checked_at"],
                            "last_check_reason": result["reason"],
                        }}
                    )
                    logger.info(f"Monitor: {target['display_name']} -> TAKEN DOWN!")
                else:
                    await db.report_targets.update_one(
                        {"id": target["id"]},
                        {"$set": {
                            "link_status": "alive" if result["alive"] is True else "unknown",
                            "last_checked_at": check_doc["checked_at"],
                            "last_check_reason": result["reason"],
                        }}
                    )
                    logger.info(f"Monitor: {target['display_name']} -> {'MASIH ADA' if result['alive'] else 'UNKNOWN'}")

                await asyncio.sleep(5)  # Small delay between checks

            # Wait 3 hours before next check cycle
            logger.info(f"Monitor: cycle complete. Next check in 3 hours.")
            await asyncio.sleep(MONITOR_INTERVAL)

        except Exception as e:
            logger.error(f"Monitor worker error: {e}")
            await asyncio.sleep(60)


@api_router.post("/monitor/start")
async def start_monitor():
    global monitor_running, monitor_task
    if monitor_running:
        return {"message": "Monitor sudah berjalan"}
    monitor_running = True
    monitor_task = asyncio.create_task(monitor_worker())
    return {"message": "Monitor dimulai - cek setiap 3 jam"}

@api_router.post("/monitor/stop")
async def stop_monitor():
    global monitor_running, monitor_task
    monitor_running = False
    if monitor_task:
        monitor_task.cancel()
        monitor_task = None
    return {"message": "Monitor dihentikan"}

@api_router.get("/monitor/status")
async def monitor_status():
    return {"running": monitor_running}

@api_router.post("/monitor/check-now")
async def check_now():
    """Manually trigger a check for all targets right now."""
    targets = await db.report_targets.find({"status": {"$ne": "taken_down"}}, {"_id": 0}).to_list(200)
    if not targets:
        return {"message": "Tidak ada target untuk dicek", "results": []}

    loop = asyncio.get_event_loop()
    results = []
    for target in targets:
        result = await loop.run_in_executor(ig_executor, _sync_check_url, target["url"])
        check_doc = {
            "id": str(uuid.uuid4()),
            "target_id": target["id"],
            "alive": result["alive"],
            "reason": result["reason"],
            "http_status": result["http_status"],
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.monitor_checks.insert_one(check_doc)

        if result["alive"] is False:
            await db.report_targets.update_one({"id": target["id"]}, {"$set": {
                "status": "taken_down", "link_status": "taken_down",
                "last_checked_at": check_doc["checked_at"],
                "last_check_reason": result["reason"],
            }})
        else:
            await db.report_targets.update_one({"id": target["id"]}, {"$set": {
                "link_status": "alive" if result["alive"] is True else "unknown",
                "last_checked_at": check_doc["checked_at"],
                "last_check_reason": result["reason"],
            }})

        results.append({"target": target["display_name"], **result})

    return {"message": f"{len(results)} target dicek", "results": results}

@api_router.get("/monitor/checks/{target_id}")
async def get_monitor_checks(target_id: str, limit: int = 20):
    checks = await db.monitor_checks.find(
        {"target_id": target_id}, {"_id": 0}
    ).sort("checked_at", -1).to_list(limit)
    return checks


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup_event():
    global monitor_running, monitor_task, auto_report_running, auto_report_task, auto_report_mode, auto_report_cycle_count
    
    # Chromium is pre-installed at /app/.browsers (deployed with code)
    chrome_path = "/app/.browsers/chromium-1208/chrome-linux/chrome"
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/app/.browsers"
    if os.path.exists(chrome_path):
        logger.info("Chromium available (pre-installed with deployment)")
    else:
        logger.warning("Chromium NOT found at deploy path! Attempting install...")
        os.system("PLAYWRIGHT_BROWSERS_PATH=/app/.browsers /root/.venv/bin/python3 -m playwright install chromium")
        if os.path.exists(chrome_path):
            logger.info("Chromium installed successfully")
        else:
            logger.error("Chromium install FAILED - reporting will not work")
    
    # Auto-resume auto-report if it was running before restart
    state = await db.auto_report_state.find_one({"key": "state"}, {"_id": 0})
    if state and state.get("running"):
        auto_report_mode = state.get("mode", "manual")
        auto_report_running = True
        auto_report_cycle_count = state.get("cycle_success", 0)
        auto_report_task = asyncio.create_task(auto_report_worker())
        logger.info(f"Auto-report RESUMED from DB (mode: {auto_report_mode}, cycle: {auto_report_cycle_count})")
    
    # Start monitor
    monitor_running = True
    monitor_task = asyncio.create_task(monitor_worker())
    logger.info("Auto-monitor started on server startup (every 3 hours)")

@app.on_event("shutdown")
async def shutdown_db_client():
    global auto_report_running, monitor_running
    auto_report_running = False
    monitor_running = False
    ig_executor.shutdown(wait=False)
    client.close()
