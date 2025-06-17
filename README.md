# Job Application Tracker

A Chrome extension that helps you track job applications and manage resumes in OneDrive. The system consists of three main components:

1. Chrome Extension for job data scraping
2. Backend server for data management
3. OneDrive integration for resume storage

## Prerequisites

- Python 3.8 or higher
- MongoDB (local or cloud instance)
- Microsoft Azure account (for OneDrive API access)
- Chrome browser

## Setup

### 1. Backend Server Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Create a `.env` file in the root directory with the following variables:
```
MONGO_URI=your_mongodb_connection_string
ONEDRIVE_CLIENT_ID=your_azure_client_id
ONEDRIVE_CLIENT_SECRET=your_azure_client_secret
ONEDRIVE_TENANT_ID=your_azure_tenant_id
```

3. Start the server:
```bash
python server.py
```

### 2. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `extension` folder
4. The extension icon should appear in your Chrome toolbar

### 3. OneDrive Setup

1. Go to the Azure Portal (portal.azure.com)
2. Create a new App Registration
3. Configure the following:
   - Redirect URI: http://localhost:8000/auth/callback
   - API permissions: Microsoft Graph API with Files.ReadWrite.All
4. Copy the Client ID, Client Secret, and Tenant ID to your `.env` file

## Usage

1. Navigate to a job posting on LinkedIn, Indeed, or Glassdoor
2. Click the extension icon in your Chrome toolbar
3. The form will be pre-filled with the job details
4. Review and edit the information if needed
5. Click "Save Job Application"
6. A new folder will be created in your OneDrive with the company name
7. Upload your resume to the corresponding OneDrive folder

## Features

- Automatic job data scraping from major job portals
- Manual data review and editing before saving
- Automatic OneDrive folder creation for each company
- MongoDB database for job application tracking
- Clean and intuitive user interface

## Security Notes

- The extension only requests necessary permissions
- All API keys and secrets are stored securely
- Data is transmitted over HTTPS
- OneDrive integration uses OAuth 2.0 for secure authentication

## Troubleshooting

If you encounter any issues:

1. Check the browser console for error messages
2. Verify your MongoDB connection
3. Ensure your OneDrive API credentials are correct
4. Check if the backend server is running
5. Verify that you're on a supported job portal website 