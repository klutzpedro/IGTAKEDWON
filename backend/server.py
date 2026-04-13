from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import re
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

# --- Models ---
class IGAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password: str
    is_logged_in: bool = False
    login_error: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class IGAccountCreate(BaseModel):
    username: str
    password: str

class IGAccountOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    is_logged_in: bool
    login_error: Optional[str] = None
    created_at: str

class ReportTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    target_type: str = "unknown"  # post, reel, profile, story
    display_name: str = ""
    category: str = "spam"
    auto_report: bool = False
    status: str = "pending"  # pending, reporting, reported, failed, taken_down
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
    status: str  # success, failed
    message: str = ""
    category: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# --- Instagram URL Parser ---
def parse_instagram_url(url: str) -> dict:
    url = url.strip().rstrip('/')
    
    # Post: /p/{shortcode}
    post_match = re.search(r'instagram\.com/p/([A-Za-z0-9_-]+)', url)
    if post_match:
        return {"type": "post", "shortcode": post_match.group(1), "display": f"Post: {post_match.group(1)}"}
    
    # Reel: /reel/{shortcode} or /reels/{shortcode}
    reel_match = re.search(r'instagram\.com/reels?/([A-Za-z0-9_-]+)', url)
    if reel_match:
        return {"type": "reel", "shortcode": reel_match.group(1), "display": f"Reel: {reel_match.group(1)}"}
    
    # Story: /stories/{username}/{story_id}
    story_match = re.search(r'instagram\.com/stories/([^/]+)/(\d+)', url)
    if story_match:
        return {"type": "story", "username": story_match.group(1), "story_id": story_match.group(2), "display": f"Story: @{story_match.group(1)}"}
    
    # Profile: /{username}
    profile_match = re.search(r'instagram\.com/([A-Za-z0-9_.]+)/?$', url)
    if profile_match and profile_match.group(1) not in ['p', 'reel', 'reels', 'stories', 'explore', 'accounts']:
        return {"type": "profile", "username": profile_match.group(1), "display": f"@{profile_match.group(1)}"}
    
    return {"type": "unknown", "display": url}

# --- Report Categories (matching Instagram) ---
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

async def get_ig_client(account_id: str):
    """Get or create an instagrapi Client for the given account."""
    from instagrapi import Client as IGClient
    
    if account_id in ig_clients:
        return ig_clients[account_id]
    
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        return None
    
    cl = IGClient()
    cl.delay_range = [2, 5]
    
    # Try to load session from DB
    session_doc = await db.ig_sessions.find_one({"account_id": account_id}, {"_id": 0})
    if session_doc and session_doc.get("settings"):
        try:
            cl.set_settings(session_doc["settings"])
            cl.login(account["username"], account["password"])
            ig_clients[account_id] = cl
            return cl
        except Exception:
            pass
    
    # Fresh login
    try:
        cl.login(account["username"], account["password"])
        settings = cl.get_settings()
        await db.ig_sessions.update_one(
            {"account_id": account_id},
            {"$set": {"account_id": account_id, "settings": settings}},
            upsert=True
        )
        ig_clients[account_id] = cl
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"is_logged_in": True, "login_error": None}}
        )
        return cl
    except Exception as e:
        await db.ig_accounts.update_one(
            {"id": account_id},
            {"$set": {"is_logged_in": False, "login_error": str(e)}}
        )
        raise

async def perform_report(target: dict, account: dict) -> dict:
    """Execute a report using instagrapi against a target."""
    try:
        cl = await get_ig_client(account["id"])
        if not cl:
            return {"status": "failed", "message": "Client not available"}
        
        parsed = parse_instagram_url(target["url"])
        reason_id = CATEGORY_TO_REASON_ID.get(target.get("category", "spam"), 1)
        
        if parsed["type"] in ["post", "reel"]:
            media_pk = cl.media_pk_from_code(parsed["shortcode"])
            # Use private API to flag media
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
            user_info = cl.user_info_by_username(parsed["username"])
            result = cl.private_request(
                f"media/{parsed['story_id']}/flag_media/",
                data={"reason_id": str(reason_id), "source_name": "reel_feed_timeline"},
                with_signature=False
            )
            return {"status": "success", "message": f"Reported story by @{parsed['username']}"}
        
        return {"status": "failed", "message": "Unsupported target type"}
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Report failed for {target['url']}: {error_msg}")
        return {"status": "failed", "message": error_msg}

# --- Auto Report State ---
auto_report_running = False
auto_report_task = None

async def auto_report_worker():
    """Background worker that continuously reports targets with auto_report enabled."""
    global auto_report_running
    while auto_report_running:
        try:
            targets = await db.report_targets.find(
                {"auto_report": True, "status": {"$nin": ["taken_down"]}},
                {"_id": 0}
            ).to_list(100)
            
            accounts = await db.ig_accounts.find(
                {"is_logged_in": True},
                {"_id": 0}
            ).to_list(100)
            
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
                    }
                    if result["status"] == "success":
                        update_data["status"] = "reported"
                    else:
                        update_data["status"] = "failed"
                    
                    await db.report_targets.update_one(
                        {"id": target["id"]},
                        {"$set": update_data}
                    )
                    
                    # Delay between reports to avoid rate limiting
                    await asyncio.sleep(10)
            
            # Wait before next cycle
            await asyncio.sleep(60)
        
        except Exception as e:
            logger.error(f"Auto-report worker error: {e}")
            await asyncio.sleep(30)

# --- API Endpoints ---

@api_router.get("/")
async def root():
    return {"message": "Instagram Report Automation API"}

@api_router.get("/report-categories")
async def get_report_categories():
    return REPORT_CATEGORIES

# Dashboard Stats
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
    
    # Recent reports (last 10)
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
        raise HTTPException(status_code=400, detail="Account already exists")
    
    account = IGAccount(username=data.username, password=data.password)
    doc = account.model_dump()
    await db.ig_accounts.insert_one(doc)
    return {"id": doc["id"], "username": doc["username"], "is_logged_in": False, "created_at": doc["created_at"]}

@api_router.get("/accounts")
async def list_accounts():
    accounts = await db.ig_accounts.find({}, {"_id": 0, "password": 0}).to_list(100)
    return accounts

@api_router.delete("/accounts/{account_id}")
async def delete_account(account_id: str):
    result = await db.ig_accounts.delete_one({"id": account_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.ig_sessions.delete_one({"account_id": account_id})
    if account_id in ig_clients:
        del ig_clients[account_id]
    return {"message": "Account deleted"}

@api_router.post("/accounts/{account_id}/login")
async def login_account(account_id: str):
    account = await db.ig_accounts.find_one({"id": account_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    try:
        cl = await get_ig_client(account_id)
        return {"message": "Login successful", "is_logged_in": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Login failed: {str(e)}")

@api_router.post("/accounts/{account_id}/logout")
async def logout_account(account_id: str):
    if account_id in ig_clients:
        del ig_clients[account_id]
    await db.ig_sessions.delete_one({"account_id": account_id})
    await db.ig_accounts.update_one(
        {"id": account_id},
        {"$set": {"is_logged_in": False}}
    )
    return {"message": "Logged out"}

# --- Target Endpoints ---
@api_router.post("/targets")
async def create_target(data: ReportTargetCreate):
    parsed = parse_instagram_url(data.url)
    target = ReportTarget(
        url=data.url,
        target_type=parsed["type"],
        display_name=parsed.get("display", data.url),
        category=data.category,
        auto_report=data.auto_report,
    )
    doc = target.model_dump()
    await db.report_targets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/targets")
async def list_targets():
    targets = await db.report_targets.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return targets

@api_router.delete("/targets/{target_id}")
async def delete_target(target_id: str):
    result = await db.report_targets.delete_one({"id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target deleted"}

@api_router.patch("/targets/{target_id}/toggle-auto")
async def toggle_auto_report(target_id: str):
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    new_val = not target.get("auto_report", False)
    await db.report_targets.update_one(
        {"id": target_id},
        {"$set": {"auto_report": new_val}}
    )
    return {"auto_report": new_val}

@api_router.patch("/targets/{target_id}/status")
async def update_target_status(target_id: str, status: str):
    valid = ["pending", "reporting", "reported", "failed", "taken_down"]
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    await db.report_targets.update_one(
        {"id": target_id},
        {"$set": {"status": status}}
    )
    return {"status": status}

@api_router.post("/targets/{target_id}/report")
async def manual_report(target_id: str):
    target = await db.report_targets.find_one({"id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    accounts = await db.ig_accounts.find({"is_logged_in": True}, {"_id": 0}).to_list(100)
    if not accounts:
        raise HTTPException(status_code=400, detail="No logged-in accounts available")
    
    results = []
    for account in accounts:
        result = await perform_report(target, account)
        
        log = ReportLog(
            target_id=target["id"],
            account_username=account["username"],
            status=result["status"],
            message=result["message"],
            category=target.get("category", "spam")
        )
        await db.report_logs.insert_one(log.model_dump())
        results.append(result)
    
    total_sent = target.get("total_reports_sent", 0) + len(results)
    success_count = sum(1 for r in results if r["status"] == "success")
    new_status = "reported" if success_count > 0 else "failed"
    
    await db.report_targets.update_one(
        {"id": target_id},
        {"$set": {
            "total_reports_sent": total_sent,
            "last_report_at": datetime.now(timezone.utc).isoformat(),
            "status": new_status
        }}
    )
    
    return {"results": results, "total_sent": total_sent}

# --- Report Logs ---
@api_router.get("/reports")
async def list_reports(limit: int = 50, target_id: Optional[str] = None):
    query = {}
    if target_id:
        query["target_id"] = target_id
    logs = await db.report_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

# --- Auto Report Control ---
@api_router.post("/auto-report/start")
async def start_auto_report(background_tasks: BackgroundTasks):
    global auto_report_running, auto_report_task
    if auto_report_running:
        return {"message": "Auto-report already running"}
    
    auto_report_running = True
    auto_report_task = asyncio.create_task(auto_report_worker())
    return {"message": "Auto-report started"}

@api_router.post("/auto-report/stop")
async def stop_auto_report():
    global auto_report_running, auto_report_task
    auto_report_running = False
    if auto_report_task:
        auto_report_task.cancel()
        auto_report_task = None
    return {"message": "Auto-report stopped"}

@api_router.get("/auto-report/status")
async def auto_report_status():
    return {"running": auto_report_running}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    global auto_report_running
    auto_report_running = False
    client.close()
