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

# Load environment variables
load_dotenv()

app = FastAPI()

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://localhost:3000",
        "chrome-extension://*",  # Allow all Chrome extensions
        "chrome-extension://iaipijeodpmliakdlfcajlndddedkfnf",  # Your specific extension ID
        os.getenv("FRONTEND_URL", "https://job-tracker-kh1h.onrender.com")  # Your Render URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Templates
templates = Jinja2Templates(directory="templates")

# MongoDB configuration
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI environment variable is not set")

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
    raise

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
    fms_folder_url = f"{base_url}/children"
    fms_folder_data = {
        "name": "File Management System Resume",
        "folder": {},
        "@microsoft.graph.conflictBehavior": "rename"
    }
    response = requests.post(fms_folder_url, headers=headers, json=fms_folder_data)
    if response.status_code in [201, 409]:  # 201 = created, 409 = already exists
        # Get the folder id (either from creation or by searching)
        if response.status_code == 201:
            fms_id = response.json()["id"]
        else:
            # Search for the folder if already exists
            search_resp = requests.get(f"{base_url}/children?$filter=name eq 'File Management System Resume'", headers=headers)
            fms_id = search_resp.json()['value'][0]['id']
    else:
        print(f"Failed to create/find File Management System Resume folder. Status: {response.status_code}, Response: {response.text}")
        return None

    # Step 2: Find or create Company folder
    company_folder_url = f"{base_url}/items/{fms_id}/children"
    company_folder_data = {
        "name": company_name,
        "folder": {},
        "@microsoft.graph.conflictBehavior": "rename"
    }
    response = requests.post(company_folder_url, headers=headers, json=company_folder_data)
    if response.status_code in [201, 409]:
        if response.status_code == 201:
            company_id = response.json()["id"]
        else:
            search_resp = requests.get(f"{company_folder_url}?$filter=name eq '{company_name}'", headers=headers)
            company_id = search_resp.json()['value'][0]['id']
    else:
        print(f"Failed to create/find company folder. Status: {response.status_code}, Response: {response.text}")
        return None

    # Step 3: Create Job Title folder
    job_folder_url = f"{base_url}/items/{company_id}/children"
    job_folder_data = {
        "name": job_title,
        "folder": {},
        "@microsoft.graph.conflictBehavior": "rename"
    }
    response = requests.post(job_folder_url, headers=headers, json=job_folder_data)
    if response.status_code == 201:
        return response.json()["webUrl"]
    elif response.status_code == 409:
        # Folder already exists, get its id
        search_resp = requests.get(f"{job_folder_url}?$filter=name eq '{job_title}'", headers=headers)
        if search_resp.status_code == 200 and search_resp.json()['value']:
            return search_resp.json()['value'][0]['webUrl']
        else:
            print(f"Failed to find existing job title folder. Status: {search_resp.status_code}, Response: {search_resp.text}")
            return None
    else:
        print(f"Failed to create job title folder. Status: {response.status_code}, Response: {response.text}")
        return None

def send_job_to_notion(job_data: JobData):
    try:
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
                    "url": onedrive_url if onedrive_url else job_data.job_url  # Fallback to job URL if OneDrive fails
                },
                "Application Status": {
                    "select": {
                        "name": job_data.status
                    }
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
    try:
        print("Received job data:", job_data.dict())
        
        # Set default values if not provided
        if not job_data.application_date:
            job_data.application_date = datetime.now()
        
        # Convert to dict for MongoDB
        job_dict = job_data.dict()
        print("Converting to dict:", job_dict)
        
        # Insert into MongoDB
        print("Attempting to insert into MongoDB...")
        result = jobs_collection.insert_one(job_dict)
        print("MongoDB insert result:", result.inserted_id)
        
        # Send to Notion
        try:
            send_job_to_notion(job_data)
        except Exception as e:
            print(f"Notion integration error (non-critical): {str(e)}")
        
        return {"message": "Job application saved successfully", "id": str(result.inserted_id)}
    except Exception as e:
        print(f"Error saving job application: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/jobs")
async def get_jobs(status: Optional[ApplicationStatus] = None):
    query = {"status": status} if status else {}
    jobs = list(jobs_collection.find(query, {"_id": 0}))
    return jobs

@app.put("/api/jobs/{job_id}")
async def update_job(job_id: str, job_data: JobData):
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
    resumes = list(resumes_collection.find({"company_name": company_name}, {"_id": 0}))
    return resumes

@app.get("/api/resumes/all")
async def get_all_resumes():
    resumes = list(resumes_collection.find({}, {"_id": 0}))
    return resumes

@app.post("/api/interviews")
async def schedule_interview(interview_data: InterviewData):
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
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    interviews = list(interviews_collection.find(query, {"_id": 0}))
    return interviews

@app.get("/api/analytics")
async def get_analytics():
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
    """
    Remove job entries older than specified days from MongoDB
    """
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
    """
    Endpoint to clean up old job entries
    Query parameter: days (default: 30) - entries older than this many days will be deleted
    """
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