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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- Models ---
class IGAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password: str
    proxy: str = ""
    is_logged_in: bool = False
    login_status: str = "idle"  # idle, logging_in, challenge_required, logged_in, failed
    login_error: Optional[str] = None
    challenge_method: Optional[str] = None  # email, sms
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class IGAccountCreate(BaseModel):
    username: str
    password: str
    proxy: str = ""

class IGAccountUpdate(BaseModel):
    proxy: Optional[str] = None

class ChallengeSubmit(BaseModel):
    code: str

class ReportTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    target_type: str = "unknown"
    display_name: str = ""
    category: str = "spam"
    auto_report: bool = False
    status: str = "pending"
    total_reports_sent: int = 0
    last_report_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    accounts_used: List[str] = []

class ReportTargetCreate(BaseModel):
    url: str
    category: str = "spam"
    auto_report: bool = False

class ReportLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_id: str
    account_username: str
    status: str
    message: str = ""
    category: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

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

# --- Report Categories ---
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

# --- Instagram Client Manager with Challenge Support ---
ig_clients = {}
challenge_states = {}  # account_id -> {"client": cl, "api_path": str, "method": str}

def create_ig_client(proxy: str = ""):
    """Create a new instagrapi Client with settings."""
    from instagrapi import Client as IGClient
    cl = IGClient()
    cl.delay_range = [2, 5]
    
    # Set realistic device settings
    cl.set_settings({
        "user_agent": "Instagram 317.0.0.24.109 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 562830598)",
        "device_settings": {
            "app_version": "317.0.0.24.109",
            "android_version": 33,
            "android_release": "13",
            "dpi": "420dpi",
            "resolution": "1080x2340",
            "manufacturer": "samsung",
            "device": "o1s",
            "model": "SM-G991B",
            "cpu": "exynos2100",
            "version_code": "562830598"
        }
    })
    
    if proxy:
        cl.set_proxy(proxy)
        logger.info(f"Set proxy: {proxy[:20]}...")
    
    return cl

async def attempt_login(account_id: str) -> dict:
    """Attempt to login to Instagram. Returns status dict."""
    from instagrapi.exceptions import (
        ChallengeRequired, TwoFactorRequired, LoginRequired,
        BadPassword, PleaseWaitFewMinutes, RecaptchaChallengeForm,
        FeedbackRequired, ChallengeUnknownStep, ChallengeError,
        SelectContactPointRecoveryForm
    )
    
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        return {"status": "failed", "message": "Akun tidak ditemukan"}
    
    cl = create_ig_client(account.get("proxy", ""))
    
    # Try loading existing session
    session_doc = await db.ig_sessions.find_one({"account_id": account_id}, {"_id": 0})
    if session_doc and session_doc.get("settings"):
        try:
            cl.set_settings(session_doc["settings"])
            cl.login(account["username"], account["password"])
            ig_clients[account_id] = cl
            await db.ig_accounts.update_one(
                {"id": account_id},
                {"$set": {"is_logged_in": True, "login_status": "logged_in", "login_error": None, "challenge_method": None}}
            )
            return {"status": "logged_in", "message": "Login berhasil (dari session)"}
        except Exception as e:
            logger.info(f"Session restore failed for {account['username']}: {e}")
            cl = create_ig_client(account.get("proxy", ""))
    
    # Fresh login
    try:
        cl.login(account["username"], account["password"])
        
        # Save session
        settings = cl.get_settings()
        await db.ig_sessions.update_one(
            {"account_id": account_id},
            {"$set": {"account_id": account_id, "settings": settings}},
            upsert=True
        )
        ig_clients[account_id] = cl
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"is_logged_in": True, "login_status": "logged_in", "login_error": None, "challenge_method": None}}
        )
        return {"status": "logged_in", "message": "Login berhasil!"}
    
    except ChallengeRequired as e:
        logger.info(f"Challenge required for {account['username']}")
        challenge_info = cl.last_json.get("challenge", {})
        api_path = challenge_info.get("api_path", "")
        
        if not api_path:
            await db.ig_accounts.update_one(
                {"id": account_id},
                {"$set": {"login_status": "failed", "login_error": "Challenge diperlukan tapi tidak ada info"}}
            )
            return {"status": "failed", "message": "Challenge diperlukan tapi tidak ada info path"}
        
        try:
            # Step 1: GET challenge page to see methods
            challenge_path = api_path.replace("/api/v1/", "")
            challenge_resp = cl.private_request(challenge_path, method="GET")
            logger.info(f"Challenge page response: {json.dumps(challenge_resp, default=str)[:500]}")
            
            # Determine method
            step_name = challenge_resp.get("step_name", "")
            available_methods = []
            
            if step_name == "select_verify_method":
                step_data = challenge_resp.get("step_data", {})
                contact_point = step_data.get("contact_point", "")
                phone_number = step_data.get("phone_number", "")
                if contact_point:
                    available_methods.append({"type": "email", "hint": contact_point})
                if phone_number:
                    available_methods.append({"type": "sms", "hint": phone_number})
                
                # Auto-select first available method and trigger code
                choice = "1" if contact_point else "0"  # 1=email, 0=sms
                method_label = "email" if choice == "1" else "sms"
                
                send_resp = cl.private_request(challenge_path, data={"choice": choice})
                logger.info(f"Challenge send response: {json.dumps(send_resp, default=str)[:500]}")
            
            elif step_name == "verify_code" or step_name == "submit_phone":
                step_data = challenge_resp.get("step_data", {})
                contact_point = step_data.get("contact_point", "")
                method_label = "email" if "@" in contact_point else "sms"
                available_methods.append({"type": method_label, "hint": contact_point})
            
            elif step_name == "delta_login_review":
                # "Was this you?" challenge - try to approve
                send_resp = cl.private_request(challenge_path, data={"choice": "0"})
                logger.info(f"Delta review response: {json.dumps(send_resp, default=str)[:500]}")
                method_label = "approval"
                available_methods.append({"type": "approval", "hint": "Approve from device"})
            
            else:
                method_label = "unknown"
                available_methods.append({"type": "unknown", "hint": step_name})
            
            # Store challenge state
            challenge_states[account_id] = {
                "client": cl,
                "api_path": api_path,
                "challenge_path": challenge_path,
                "method": method_label,
                "step_name": step_name,
                "username": account["username"],
                "password": account["password"],
            }
            
            await db.ig_accounts.update_one(
                {"id": account_id},
                {"$set": {
                    "login_status": "challenge_required",
                    "login_error": f"Verifikasi diperlukan via {method_label}",
                    "challenge_method": method_label,
                }}
            )
            
            return {
                "status": "challenge_required",
                "message": f"Instagram memerlukan verifikasi. Kode dikirim via {method_label}.",
                "method": method_label,
                "available_methods": available_methods,
            }
        
        except Exception as inner_e:
            logger.error(f"Challenge handling error: {inner_e}")
            challenge_states[account_id] = {
                "client": cl,
                "api_path": api_path,
                "challenge_path": api_path.replace("/api/v1/", ""),
                "method": "unknown",
                "step_name": "unknown",
                "username": account["username"],
                "password": account["password"],
            }
            await db.ig_accounts.update_one(
                {"id": account_id},
                {"$set": {
                    "login_status": "challenge_required",
                    "login_error": f"Verifikasi diperlukan. Error detail: {str(inner_e)[:200]}",
                    "challenge_method": "email",
                }}
            )
            return {
                "status": "challenge_required",
                "message": f"Verifikasi diperlukan. Cek email/SMS Anda. Detail: {str(inner_e)[:200]}",
                "method": "email",
            }
    
    except BadPassword:
        msg = "Password salah"
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"login_status": "failed", "login_error": msg}}
        )
        return {"status": "failed", "message": msg}
    
    except PleaseWaitFewMinutes:
        msg = "Terlalu banyak percobaan. Tunggu beberapa menit sebelum coba lagi."
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"login_status": "failed", "login_error": msg}}
        )
        return {"status": "failed", "message": msg}
    
    except RecaptchaChallengeForm:
        msg = "Instagram menampilkan CAPTCHA. Coba gunakan proxy residential atau tunggu beberapa jam."
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"login_status": "failed", "login_error": msg}}
        )
        return {"status": "failed", "message": msg}
    
    except TwoFactorRequired:
        challenge_states[account_id] = {
            "client": cl,
            "api_path": "2fa",
            "challenge_path": "2fa",
            "method": "2fa",
            "step_name": "2fa",
            "username": account["username"],
            "password": account["password"],
        }
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {
                "login_status": "challenge_required",
                "login_error": "Verifikasi 2FA diperlukan",
                "challenge_method": "2fa",
            }}
        )
        return {
            "status": "challenge_required",
            "message": "Masukkan kode 2FA dari authenticator app Anda.",
            "method": "2fa",
        }
    
    except SelectContactPointRecoveryForm:
        msg = "Instagram meminta recovery contact point. Coba login dari browser terlebih dahulu."
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"login_status": "failed", "login_error": msg}}
        )
        return {"status": "failed", "message": msg}
    
    except Exception as e:
        error_str = str(e)
        logger.error(f"Login error for {account['username']}: {error_str}")
        
        # Detect challenge from generic exception
        if "challenge" in error_str.lower() or "challenge_required" in error_str.lower():
            challenge_info = getattr(cl, 'last_json', {}) or {}
            api_path = challenge_info.get("challenge", {}).get("api_path", "")
            
            challenge_states[account_id] = {
                "client": cl,
                "api_path": api_path,
                "challenge_path": api_path.replace("/api/v1/", "") if api_path else "",
                "method": "email",
                "step_name": "unknown",
                "username": account["username"],
                "password": account["password"],
            }
            await db.ig_accounts.update_one(
                {"id": account_id},
                {"$set": {
                    "login_status": "challenge_required",
                    "login_error": "Verifikasi diperlukan. Cek email/SMS Instagram Anda.",
                    "challenge_method": "email",
                }}
            )
            return {
                "status": "challenge_required",
                "message": "Instagram memerlukan verifikasi. Cek email/SMS Anda untuk kode.",
                "method": "email",
            }
        
        # Detect IP block / rate limit
        if "please wait" in error_str.lower() or "few minutes" in error_str.lower():
            msg = "Instagram rate-limit. Tunggu beberapa menit atau gunakan proxy."
        elif "bad password" in error_str.lower() or "password" in error_str.lower():
            msg = "Password salah. Periksa kembali password Anda."
        elif "user not found" in error_str.lower():
            msg = "Username tidak ditemukan."
        elif "ip" in error_str.lower() or "block" in error_str.lower():
            msg = "IP diblokir oleh Instagram. Gunakan proxy residential."
        else:
            msg = f"Login gagal: {error_str[:300]}"
        
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"login_status": "failed", "login_error": msg}}
        )
        return {"status": "failed", "message": msg}

async def submit_challenge_code(account_id: str, code: str) -> dict:
    """Submit verification code for a pending challenge."""
    state = challenge_states.get(account_id)
    if not state:
        return {"status": "failed", "message": "Tidak ada challenge yang pending. Coba login ulang."}
    
    cl = state["client"]
    
    try:
        if state["method"] == "2fa":
            # Handle 2FA
            two_factor_info = cl.last_json
            two_factor_id = two_factor_info.get("two_factor_info", {}).get("two_factor_identifier", "")
            verification_method = "1"  # TOTP
            
            result = cl.private_request(
                "accounts/two_factor_login/",
                data={
                    "username": state["username"],
                    "verification_code": code.strip(),
                    "two_factor_identifier": two_factor_id,
                    "verification_method": verification_method,
                    "trust_this_device": "1",
                }
            )
        else:
            # Handle challenge code (email/SMS)
            challenge_path = state["challenge_path"]
            if not challenge_path:
                return {"status": "failed", "message": "Challenge path tidak valid. Coba login ulang."}
            
            result = cl.private_request(
                challenge_path,
                data={"security_code": code.strip()}
            )
        
        logger.info(f"Challenge code submit result: {json.dumps(result, default=str)[:500]}")
        
        # Check if successful
        if result.get("logged_in_user") or result.get("status") == "ok":
            # Save session
            account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
            settings = cl.get_settings()
            await db.ig_sessions.update_one(
                {"account_id": account_id},
                {"$set": {"account_id": account_id, "settings": settings}},
                upsert=True
            )
            ig_clients[account_id] = cl
            del challenge_states[account_id]
            
            await db.ig_accounts.update_one(
                {"id": account_id},
                {"$set": {
                    "is_logged_in": True,
                    "login_status": "logged_in",
                    "login_error": None,
                    "challenge_method": None,
                }}
            )
            return {"status": "logged_in", "message": "Verifikasi berhasil! Login sukses."}
        
        # Check if another step is needed
        if result.get("action") == "close":
            # Try to login again after challenge
            try:
                cl.login(state["username"], state["password"])
                settings = cl.get_settings()
                await db.ig_sessions.update_one(
                    {"account_id": account_id},
                    {"$set": {"account_id": account_id, "settings": settings}},
                    upsert=True
                )
                ig_clients[account_id] = cl
                del challenge_states[account_id]
                
                await db.ig_accounts.update_one(
                    {"id": account_id},
                    {"$set": {
                        "is_logged_in": True,
                        "login_status": "logged_in",
                        "login_error": None,
                        "challenge_method": None,
                    }}
                )
                return {"status": "logged_in", "message": "Verifikasi berhasil! Login sukses."}
            except Exception as login_e:
                logger.error(f"Re-login after challenge failed: {login_e}")
                return {"status": "failed", "message": f"Verifikasi diterima tapi login ulang gagal: {str(login_e)[:200]}"}
        
        return {"status": "failed", "message": f"Kode tidak valid atau challenge gagal. Response: {json.dumps(result, default=str)[:300]}"}
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Challenge code submit error: {error_msg}")
        
        if "bad" in error_msg.lower() or "invalid" in error_msg.lower() or "code" in error_msg.lower():
            return {"status": "failed", "message": "Kode verifikasi salah. Periksa dan coba lagi."}
        
        return {"status": "failed", "message": f"Error: {error_msg[:300]}"}


async def get_ig_client(account_id: str):
    """Get existing client (for reporting)."""
    if account_id in ig_clients:
        return ig_clients[account_id]
    
    # Try to restore from session
    result = await attempt_login(account_id)
    if result["status"] == "logged_in":
        return ig_clients.get(account_id)
    return None


async def perform_report(target: dict, account: dict) -> dict:
    """Execute a report using instagrapi against a target."""
    try:
        cl = await get_ig_client(account["id"])
        if not cl:
            return {"status": "failed", "message": "Client not available - login required"}
        
        parsed = parse_instagram_url(target["url"])
        reason_id = CATEGORY_TO_REASON_ID.get(target.get("category", "spam"), 1)
        
        if parsed["type"] in ["post", "reel"]:
            media_pk = cl.media_pk_from_code(parsed["shortcode"])
            result = cl.private_request(
                f"media/{media_pk}/flag_media/",
                data={"reason_id": str(reason_id), "source_name": "feed_contextual_chain"},
                with_signature=False
            )
            return {"status": "success", "message": f"Reported media {parsed['shortcode']} - reason: {target.get('category', 'spam')}"}
        
        elif parsed["type"] == "profile":
            user_info = cl.user_info_by_username(parsed["username"])
            result = cl.private_request(
                f"users/{user_info.pk}/flag_user/",
                data={"reason_id": str(reason_id), "source_name": "profile"},
                with_signature=False
            )
            return {"status": "success", "message": f"Reported user @{parsed['username']} - reason: {target.get('category', 'spam')}"}
        
        elif parsed["type"] == "story":
            result = cl.private_request(
                f"media/{parsed['story_id']}/flag_media/",
                data={"reason_id": str(reason_id), "source_name": "reel_feed_timeline"},
                with_signature=False
            )
            return {"status": "success", "message": f"Reported story by @{parsed.get('username', 'unknown')}"}
        
        return {"status": "failed", "message": "Unsupported target type"}
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Report failed for {target['url']}: {error_msg}")
        return {"status": "failed", "message": error_msg}


# --- Auto Report State ---
auto_report_running = False
auto_report_task = None

async def auto_report_worker():
    global auto_report_running
    while auto_report_running:
        try:
            targets = await db.report_targets.find(
                {"auto_report": True, "status": {"$nin": ["taken_down"]}}, {"_id": 0}
            ).to_list(100)
            
            accounts = await db.ig_accounts.find({"is_logged_in": True}, {"_id": 0}).to_list(100)
            
            if not accounts:
                await asyncio.sleep(30)
                continue
            
            for target in targets:
                if not auto_report_running:
                    break
                for account in accounts:
                    if not auto_report_running:
                        break
                    result = await perform_report(target, account)
                    log = ReportLog(
                        target_id=target["id"],
                        account_username=account["username"],
                        status=result["status"],
                        message=result["message"],
                        category=target.get("category", "spam")
                    )
                    await db.report_logs.insert_one(log.model_dump())
                    update_data = {
                        "total_reports_sent": target.get("total_reports_sent", 0) + 1,
                        "last_report_at": datetime.now(timezone.utc).isoformat(),
                        "status": "reported" if result["status"] == "success" else "failed",
                    }
                    await db.report_targets.update_one({"id": target["id"]}, {"$set": update_data})
                    await asyncio.sleep(10)
            
            await asyncio.sleep(60)
        except Exception as e:
            logger.error(f"Auto-report worker error: {e}")
            await asyncio.sleep(30)


# ==================== API ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Instagram Report Automation API"}

@api_router.get("/report-categories")
async def get_report_categories():
    return REPORT_CATEGORIES

@api_router.get("/dashboard/stats")
async def get_dashboard_stats():
    total_accounts = await db.ig_accounts.count_documents({})
    logged_in_accounts = await db.ig_accounts.count_documents({"is_logged_in": True})
    total_targets = await db.report_targets.count_documents({})
    active_targets = await db.report_targets.count_documents({"auto_report": True})
    total_reports = await db.report_logs.count_documents({})
    successful_reports = await db.report_logs.count_documents({"status": "success"})
    failed_reports = await db.report_logs.count_documents({"status": "failed"})
    taken_down = await db.report_targets.count_documents({"status": "taken_down"})
    recent_logs = await db.report_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    
    return {
        "total_accounts": total_accounts,
        "logged_in_accounts": logged_in_accounts,
        "total_targets": total_targets,
        "active_targets": active_targets,
        "total_reports": total_reports,
        "successful_reports": successful_reports,
        "failed_reports": failed_reports,
        "taken_down": taken_down,
        "recent_logs": recent_logs,
        "auto_report_running": auto_report_running,
    }

# --- Account Endpoints ---
@api_router.post("/accounts")
async def create_account(data: IGAccountCreate):
    existing = await db.ig_accounts.find_one({"username": data.username}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Akun sudah ada")
    account = IGAccount(username=data.username, password=data.password, proxy=data.proxy)
    doc = account.model_dump()
    await db.ig_accounts.insert_one(doc)
    return {
        "id": doc["id"], "username": doc["username"],
        "is_logged_in": False, "login_status": "idle",
        "proxy": doc["proxy"], "created_at": doc["created_at"]
    }

@api_router.get("/accounts")
async def list_accounts():
    accounts = await db.ig_accounts.find({}, {"_id": 0, "password": 0}).to_list(100)
    return accounts

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str):
    result = await db.ig_accounts.delete_one({"id": account_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    await db.ig_sessions.delete_one({"account_id": account_id})
    ig_clients.pop(account_id, None)
    challenge_states.pop(account_id, None)
    return {"message": "Akun dihapus"}

@api_router.patch("/accounts/{account_id}")
async def update_account(account_id: str, data: IGAccountUpdate):
    update = {}
    if data.proxy is not None:
        update["proxy"] = data.proxy
    if not update:
        raise HTTPException(status_code=400, detail="Tidak ada data untuk diupdate")
    await db.ig_accounts.update_one({"id": account_id}, {"$set": update})
    return {"message": "Akun diupdate"}

@api_router.post("/accounts/{account_id}/login")
async def login_account(account_id: str):
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    
    await db.ig_accounts.update_one(
        {"id": account_id},
        {"$set": {"login_status": "logging_in", "login_error": None}}
    )
    
    result = await attempt_login(account_id)
    
    if result["status"] == "logged_in":
        return result
    elif result["status"] == "challenge_required":
        return result
    else:
        raise HTTPException(status_code=400, detail=result["message"])

@api_router.post("/accounts/{account_id}/challenge")
async def submit_challenge(account_id: str, data: ChallengeSubmit):
    """Submit verification code for challenge."""
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    
    result = await submit_challenge_code(account_id, data.code)
    
    if result["status"] == "logged_in":
        return result
    else:
        raise HTTPException(status_code=400, detail=result["message"])

@api_router.post("/accounts/{account_id}/challenge/resend")
async def resend_challenge(account_id: str):
    """Resend verification code."""
    state = challenge_states.get(account_id)
    if not state:
        raise HTTPException(status_code=400, detail="Tidak ada challenge pending. Coba login ulang.")
    
    try:
        cl = state["client"]
        challenge_path = state["challenge_path"]
        
        # Re-request the challenge
        result = cl.private_request(challenge_path, data={"choice": "1"})
        logger.info(f"Challenge resend result: {json.dumps(result, default=str)[:500]}")
        
        return {"message": "Kode verifikasi dikirim ulang. Cek email/SMS Anda."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal kirim ulang: {str(e)[:200]}")

@api_router.post("/accounts/{account_id}/logout")
async def logout_account(account_id: str):
    ig_clients.pop(account_id, None)
    challenge_states.pop(account_id, None)
    await db.ig_sessions.delete_one({"account_id": account_id})
    await db.ig_accounts.update_one(
        {"id": account_id},
        {"$set": {"is_logged_in": False, "login_status": "idle", "login_error": None, "challenge_method": None}}
    )
    return {"message": "Logout berhasil"}

# --- Target Endpoints ---
@api_router.post("/targets")
async def create_target(data: ReportTargetCreate):
    parsed = parse_instagram_url(data.url)
    target = ReportTarget(
        url=data.url, target_type=parsed["type"],
        display_name=parsed.get("display", data.url),
        category=data.category, auto_report=data.auto_report,
    )
    doc = target.model_dump()
    await db.report_targets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/targets")
async def list_targets():
    return await db.report_targets.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str):
    result = await db.report_targets.delete_one({"id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Target tidak ditemukan")
    return {"message": "Target dihapus"}

@api_router.patch("/targets/{target_id}/toggle-auto")
async def toggle_auto_report(target_id: str):
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target tidak ditemukan")
    new_val = not target.get("auto_report", False)
    await db.report_targets.update_one({"id": target_id}, {"$set": {"auto_report": new_val}})
    return {"auto_report": new_val}

@api_router.patch("/targets/{target_id}/status")
async def update_target_status(target_id: str, status: str):
    valid = ["pending", "reporting", "reported", "failed", "taken_down"]
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status tidak valid")
    await db.report_targets.update_one({"id": target_id}, {"$set": {"status": status}})
    return {"status": status}

@api_router.post("/targets/{target_id}/report")
async def manual_report(target_id: str):
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target tidak ditemukan")
    accounts = await db.ig_accounts.find({"is_logged_in": True}, {"_id": 0}).to_list(100)
    if not accounts:
        raise HTTPException(status_code=400, detail="Tidak ada akun yang login")
    
    results = []
    for account in accounts:
        result = await perform_report(target, account)
        log = ReportLog(
            target_id=target["id"], account_username=account["username"],
            status=result["status"], message=result["message"],
            category=target.get("category", "spam")
        )
        await db.report_logs.insert_one(log.model_dump())
        results.append(result)
    
    total_sent = target.get("total_reports_sent", 0) + len(results)
    success_count = sum(1 for r in results if r["status"] == "success")
    await db.report_targets.update_one(
        {"id": target_id},
        {"$set": {
            "total_reports_sent": total_sent,
            "last_report_at": datetime.now(timezone.utc).isoformat(),
            "status": "reported" if success_count > 0 else "failed"
        }}
    )
    return {"results": results, "total_sent": total_sent}

# --- Report Logs ---
@api_router.get("/reports")
async def list_reports(limit: int = 50, target_id: Optional[str] = None):
    query = {}
    if target_id:
        query["target_id"] = target_id
    return await db.report_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

# --- Auto Report Control ---
@api_router.post("/auto-report/start")
async def start_auto_report(background_tasks: BackgroundTasks):
    global auto_report_running, auto_report_task
    if auto_report_running:
        return {"message": "Auto-report sudah berjalan"}
    auto_report_running = True
    auto_report_task = asyncio.create_task(auto_report_worker())
    return {"message": "Auto-report dimulai"}

@api_router.post("/auto-report/stop")
async def stop_auto_report():
    global auto_report_running, auto_report_task
    auto_report_running = False
    if auto_report_task:
        auto_report_task.cancel()
        auto_report_task = None
    return {"message": "Auto-report dihentikan"}

@api_router.get("/auto-report/status")
async def auto_report_status():
    return {"running": auto_report_running}

# Include router & middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    global auto_report_running
    auto_report_running = False
    client.close()
