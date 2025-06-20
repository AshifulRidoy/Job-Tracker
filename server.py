print("SERVER.PY STARTED - UNIQUE-DEBUG-20240618-XYZ")
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.requests import Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from pymongo import MongoClient
import msal
import requests
import json
from enum import Enum
from notion_client import Client as NotionClient
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import re
import time

# Load environment variables
load_dotenv()

app = FastAPI()

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://iaipijeodpmliakdlfcajlndddedkfnf",
        "https://www.linkedin.com",
        "https://www.glassdoor.com",
        "https://www.indeed.com",
        "https://www.xing.com",
        "http://localhost:8000",
        "http://localhost:3000",
        os.getenv("FRONTEND_URL", "https://job-tracker-kh1h.onrender.com")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Templates
templates = Jinja2Templates(directory="templates")

# MongoDB configuration
MONGO_URI = os.getenv("MONGO_URI")
if MONGO_URI:
    client = MongoClient(MONGO_URI)
    db = client.job_tracker
    jobs_collection = db.jobs
    resumes_collection = db["resumes"]
    interviews_collection = db["interviews"]
    # Test MongoDB connection
    try:
        client.admin.command('ping')
        print("Successfully connected to MongoDB Atlas!")
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        client = db = jobs_collection = resumes_collection = interviews_collection = None
else:
    print("Warning: MONGO_URI environment variable is not set. MongoDB features will be disabled.")
    client = db = jobs_collection = resumes_collection = interviews_collection = None

# OneDrive configuration
ONEDRIVE_CLIENT_ID = os.getenv("ONEDRIVE_CLIENT_ID")
ONEDRIVE_CLIENT_SECRET = os.getenv("ONEDRIVE_CLIENT_SECRET")
ONEDRIVE_TENANT_ID = os.getenv("ONEDRIVE_TENANT_ID")

# Notion configuration
NOTION_TOKEN = os.getenv("NOTION_TOKEN")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")
notion = NotionClient(auth=NOTION_TOKEN) if NOTION_TOKEN else None

class ApplicationStatus(str, Enum):
    SAVED = "saved"
    APPLIED = "applied"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"
    ACCEPTED = "accepted"

class JobData(BaseModel):
    company_name: str
    job_title: str
    job_url: str
    application_date: Optional[datetime] = None
    status: str = "Applied"
    notes: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    job_type: Optional[str] = None
    experience_level: Optional[str] = None
    skills: Optional[List[str]] = None
    company_website: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    interview_date: Optional[datetime] = None
    follow_up_date: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    offer_amount: Optional[str] = None
    benefits: Optional[List[str]] = None
    work_mode: Optional[str] = None
    application_method: Optional[str] = None
    source: Optional[str] = None
    tags: Optional[List[str]] = None
    job_description: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ResumeData(BaseModel):
    company_name: str
    version: str
    file_url: str
    created_at: datetime = datetime.now()
    notes: Optional[str] = None

class InterviewData(BaseModel):
    job_id: str
    company_name: str
    date: datetime
    type: str  # phone, technical, behavioral, etc.
    notes: Optional[str] = None
    preparation_notes: Optional[str] = None
    status: str = "scheduled"  # scheduled, completed, cancelled

def sanitize_onedrive_name(name):
    # OneDrive does not allow these characters: \\/:*?"<>|
    return re.sub(r'[\\/:*?"<>|]', '-', name)

def get_onedrive_token():
    try:
        if not all([ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, ONEDRIVE_TENANT_ID]):
            print("Missing OneDrive credentials. Please check environment variables.")
            return None

        app = msal.ConfidentialClientApplication(
            ONEDRIVE_CLIENT_ID,
            authority=f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}",
            client_credential=ONEDRIVE_CLIENT_SECRET
        )
        
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        
        if "access_token" not in result:
            print(f"Failed to get access token. Error: {result.get('error_description', 'Unknown error')}")
            return None
            
        return result["access_token"]
    except Exception as e:
        print(f"Error in get_onedrive_token: {str(e)}")
        return None

def create_onedrive_folder(company_name: str, job_title: str):
    print("create_onedrive_folder called")  # Debug: confirm function is running
    token = get_onedrive_token()
    if not token:
        print("Failed to get OneDrive token")
        return None

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    user_email = "ashiful.ridoy@warpandas.onmicrosoft.com"
    base_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/drive/root"

    # Step 1: Find or create 'File Management System Resume' folder
    fms_folder_name = "File Management System Resume"
    root_children_url = f"{base_url}/children"
    search_resp = requests.get(root_children_url, headers=headers)
    print(f"[DEBUG] Root folder search response: {search_resp.status_code}, {search_resp.text}")
    # Print all root children and their IDs for debugging
    if search_resp.status_code == 200:
        print("[DEBUG] Root children:")
        for item in search_resp.json().get('value', []):
            print(f"  Name: {item.get('name')}, ID: {item.get('id')}")
    fms_id = None
    if search_resp.status_code == 200:
        for item in search_resp.json().get('value', []):
            if item.get('name') == fms_folder_name:
                fms_id = item['id']
                break
    if not fms_id:
        # Folder not found, create it
        fms_folder_data = {
            "name": fms_folder_name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename"
        }
        response = requests.post(root_children_url, headers=headers, json=fms_folder_data)
        print(f"[DEBUG] Root folder create response: {response.status_code}, {response.text}")
        if response.status_code == 201:
            fms_id = response.json()["id"]
        else:
            print(f"Failed to create/find {fms_folder_name} folder. Status: {response.status_code}, Response: {response.text}")
            return None

    # Step 2: Find or create Company folder
    print("UNIQUE-DEBUG-POINT: About to search for company folder - 20240618-XYZ")
    safe_company_name = sanitize_onedrive_name(company_name)
    company_folder_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/drive/items/{fms_id}/children"
    print(f"ACTUAL COMPANY FOLDER URL: {company_folder_url}")
    search_resp = requests.get(company_folder_url, headers=headers)
    print(f"[DEBUG] Company folder search response: {search_resp.status_code}, {search_resp.text}")
    company_id = None
    if search_resp.status_code == 200:
        for item in search_resp.json().get('value', []):
            if item.get('name') == safe_company_name:
                company_id = item['id']
                break
    if not company_id:
        # Folder not found, create it
        company_folder_data = {
            "name": safe_company_name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename"
        }
        response = requests.post(company_folder_url, headers=headers, json=company_folder_data)
        print(f"[DEBUG] Company folder create response: {response.status_code}, {response.text}")
        if response.status_code == 201:
            company_id = response.json()["id"]
        else:
            print(f"Failed to create/find company folder. Status: {response.status_code}, Response: {response.text}")
            return None

    # Step 3: Find or create Job Title folder
    safe_job_title = sanitize_onedrive_name(job_title)
    job_folder_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/drive/items/{company_id}/children"
    search_resp = requests.get(job_folder_url, headers=headers)
    print(f"[DEBUG] Job folder search response: {search_resp.status_code}, {search_resp.text}")
    job_id = None
    web_url = None
    if search_resp.status_code == 200:
        for item in search_resp.json().get('value', []):
            if item.get('name') == safe_job_title:
                job_id = item['id']
                web_url = item.get('webUrl')
                break
    if not job_id:
        # Folder not found, create it
        job_folder_data = {
            "name": safe_job_title,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename"
        }
        response = requests.post(job_folder_url, headers=headers, json=job_folder_data)
        print(f"[DEBUG] Job folder create response: {response.status_code}, {response.text}")
        if response.status_code == 201:
            web_url = response.json().get("webUrl")
        else:
            print(f"Failed to create job title folder. Status: {response.status_code}, {response.text}")
            return None
    return web_url

def send_job_to_notion(job_data: JobData):
    try:
        # Map internal status to Notion select option names
        NOTION_STATUS_OPTIONS = {
            "saved": "Saved",
            "applied": "Applied",
            "interview": "Interview",
            "offer": "Offer",
            "rejected": "Rejected",
            "accepted": "Accepted"
        }
        status_value = job_data.status.lower() if job_data.status else "applied"
        notion_status = NOTION_STATUS_OPTIONS.get(status_value, "Applied")
        # Truncate job description for Notion
        MAX_NOTION_TEXT_LENGTH = 2000
        job_description = job_data.job_description or ""
        if len(job_description) > MAX_NOTION_TEXT_LENGTH:
            job_description = job_description[:MAX_NOTION_TEXT_LENGTH - 3] + "..."
        # Create OneDrive folder and get URL
        onedrive_url = create_onedrive_folder(job_data.company_name, job_data.job_title)
        # Create a new page in the database
        new_page = {
            "parent": {"database_id": NOTION_DATABASE_ID},
            "properties": {
                "Job Title": {
                    "rich_text": [
                        {
                            "text": {
                                "content": job_data.job_title
                            }
                        }
                    ]
                },
                "Company Name": {
                    "title": [
                        {
                            "text": {
                                "content": job_data.company_name
                            }
                        }
                    ]
                },
                "Job Type": {
                    "select": {
                        "name": job_data.job_type
                    }
                },
                "URL": {
                    "url": job_data.job_url
                },
                "Resume+Cover Letter": {
                    "url": onedrive_url if onedrive_url else ""
                },
                "Application Status": {
                    "select": {
                        "name": notion_status
                    }
                },
                "Job Description": {
                    "rich_text": [
                        {
                            "text": {
                                "content": job_description
                            }
                        }
                    ]
                }
            }
        }
        # Add the page to the database
        response = notion.pages.create(**new_page)
        print(f"Successfully added job to Notion: {job_data.job_title} at {job_data.company_name}")
        return response
    except Exception as e:
        print(f"Error sending job to Notion: {str(e)}")
        return None

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.post("/api/jobs")
async def create_job(job_data: JobData):
    start = time.time()
    print(f"[PERF] Start job submission: {start}")
    try:
        print("Received job data:", job_data.dict())
        # Set default values if not provided
        if not job_data.application_date:
            job_data.application_date = datetime.now()
        # Send to Notion (and OneDrive)
        notion_start = time.time()
        try:
            send_job_to_notion(job_data)
        except Exception as e:
            print(f"Notion integration error (non-critical): {str(e)}")
        notion_end = time.time()
        print(f"[PERF] Notion+OneDrive time: {notion_end - notion_start:.2f}s (total: {notion_end - start:.2f}s)")
        return {"message": "Job application saved to Notion successfully"}
    except Exception as e:
        print(f"Error saving job application: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jobs")
async def get_jobs(status: Optional[ApplicationStatus] = None):
    if jobs_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    query = {"status": status} if status else {}
    jobs = list(jobs_collection.find(query, {"_id": 0}))
    return jobs

@app.put("/api/jobs/{job_id}")
async def update_job(job_id: str, job_data: JobData):
    if jobs_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        job_data.updated_at = datetime.now()
        result = jobs_collection.update_one(
            {"_id": job_id},
            {"$set": job_data.dict()}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"message": "Job updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/resumes")
async def add_resume(resume_data: ResumeData):
    if resumes_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        result = resumes_collection.insert_one(resume_data.dict())
        return {
            "message": "Resume saved successfully",
            "resume_id": str(result.inserted_id)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/resumes/{company_name}")
async def get_resumes(company_name: str):
    if resumes_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    resumes = list(resumes_collection.find({"company_name": company_name}, {"_id": 0}))
    return resumes

@app.get("/api/resumes/all")
async def get_all_resumes():
    if resumes_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    resumes = list(resumes_collection.find({}, {"_id": 0}))
    return resumes

@app.post("/api/interviews")
async def schedule_interview(interview_data: InterviewData):
    if interviews_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        result = interviews_collection.insert_one(interview_data.dict())
        return {
            "message": "Interview scheduled successfully",
            "interview_id": str(result.inserted_id)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/interviews")
async def get_interviews(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None):
    if interviews_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    interviews = list(interviews_collection.find(query, {"_id": 0}))
    return interviews

@app.get("/api/analytics")
async def get_analytics():
    if jobs_collection is None or interviews_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        # Get total applications
        total_applications = jobs_collection.count_documents({})
        
        # Get applications by status
        status_counts = {}
        for status in ApplicationStatus:
            count = jobs_collection.count_documents({"status": status})
            status_counts[status] = count
        
        # Get applications by company
        company_counts = list(jobs_collection.aggregate([
            {"$group": {"_id": "$company_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]))
        
        # Get interview success rate
        total_interviews = interviews_collection.count_documents({})
        completed_interviews = interviews_collection.count_documents({"status": "completed"})
        interview_success_rate = (completed_interviews / total_interviews * 100) if total_interviews > 0 else 0
        
        return {
            "total_applications": total_applications,
            "status_distribution": status_counts,
            "company_distribution": company_counts,
            "interview_success_rate": interview_success_rate
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def cleanup_old_entries(days_old: int = 30):
    if jobs_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        cutoff_date = datetime.now() - timedelta(days=days_old)
        result = jobs_collection.delete_many({
            "application_date": {"$lt": cutoff_date}
        })
        return {
            "message": f"Successfully deleted {result.deleted_count} old entries",
            "deleted_count": result.deleted_count
        }
    except Exception as e:
        print(f"Error cleaning up old entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/cleanup")
async def cleanup_jobs(days: int = 30):
    if jobs_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        result = cleanup_old_entries(days)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Initialize scheduler
scheduler = BackgroundScheduler()

def scheduled_cleanup():
    """
    Scheduled task to clean up old entries
    Runs daily at midnight
    """
    try:
        print("Running scheduled cleanup...")
        result = cleanup_old_entries()
        print(f"Scheduled cleanup completed: {result['message']}")
    except Exception as e:
        print(f"Error in scheduled cleanup: {str(e)}")

# Add the scheduled task
scheduler.add_job(
    scheduled_cleanup,
    trigger=CronTrigger(hour=0, minute=0),  # Run at midnight
    id='cleanup_job',
    name='Clean up old job entries',
    replace_existing=True
)

@app.on_event("startup")
async def startup_event():
    """
    Start the scheduler when the application starts
    """
    scheduler.start()
    print("Scheduler started")

@app.on_event("shutdown")
async def shutdown_event():
    """
    Shutdown the scheduler when the application stops
    """
    scheduler.shutdown()
    print("Scheduler shut down")

@app.get("/api/test-db")
async def test_db():
    if client is None or jobs_collection is None:
        raise HTTPException(status_code=503, detail="MongoDB is not available.")
    try:
        # Test database connection
        client.admin.command('ping')
        
        # Count documents in jobs collection
        job_count = jobs_collection.count_documents({})
        
        # Get a sample document
        sample_job = jobs_collection.find_one()
        
        return {
            "status": "connected",
            "job_count": job_count,
            "sample_job": str(sample_job) if sample_job else None
        }
    except Exception as e:
        print(f"Database test error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 