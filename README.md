# Job Application Tracker

A Chrome extension and backend system to help you track job applications, manage resumes in OneDrive, and log applications in Notion.

## Features

- **Automatic job data scraping** from major job portals (e.g., LinkedIn, Indeed, Glassdoor)
- **Manual review/editing** of job data before saving
- **OneDrive integration**: automatic folder creation for each company/job
- **Notion integration**: all job applications are logged in your Notion database
- **Modern, compact Chrome extension UI**
- **No local database required** (data is stored in Notion and OneDrive)

---

## Prerequisites

- Python 3.8 or higher
- Microsoft Azure account (for OneDrive API access)
- Notion account and integration
- Chrome browser

---

## Setup

### 1. Backend Server Setup

1. Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```

2. Create a `.env` file in the root directory with the following variables:
    ```
    ONEDRIVE_CLIENT_ID=your_azure_client_id
    ONEDRIVE_CLIENT_SECRET=your_azure_client_secret
    ONEDRIVE_TENANT_ID=your_azure_tenant_id
    NOTION_TOKEN=your_notion_integration_token
    NOTION_DATABASE_ID=your_notion_database_id
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

### 3. OneDrive & Notion Setup

- **OneDrive**:  
  - Register an app in Azure Portal  
  - Set API permissions: Microsoft Graph API with Files.ReadWrite.All  
  - Copy the Client ID, Client Secret, and Tenant ID to your `.env` file

- **Notion**:  
  - Create a Notion integration and share your database with it  
  - Copy the integration token and database ID to your `.env` file

---

## Usage

1. Navigate to a job posting on a supported site (e.g., LinkedIn, Indeed, Glassdoor)
2. Click the extension icon in your Chrome toolbar
3. The form will be pre-filled with job details (if scraping is supported)
4. Review/edit the information if needed
5. Click "Save Job Application"
6. A new folder will be created in your OneDrive for the company/job
7. The job application will be logged in your Notion database

---

## Adding Support for More Job Sites

To add scraping support for additional job sites:

1. **Open `extension/content.js`**  
   This file contains the logic for scraping job data from web pages.

2. **Add a new scraping block for the target site:**  
   - Use `window.location.hostname` to detect the site.
   - Use `document.querySelector` or similar DOM methods to extract job title, company, location, etc.
   - Return the scraped data in the message response.

   **Example:**
   ```js
   if (window.location.hostname.includes('newjobsite.com')) {
     // Custom scraping logic for newjobsite.com
     job_title = document.querySelector('.job-title').innerText;
     company_name = document.querySelector('.company').innerText;
     // ...etc
   }
   ```

3. **Test your changes:**  
   - Reload the extension in Chrome.
   - Navigate to a job posting on the new site and click the extension icon.
   - Verify that the form is pre-filled with the correct data.

4. **Repeat for each new site you want to support.**

---

## Security Notes

- The extension only requests necessary permissions
- All API keys and secrets are stored securely in environment variables
- Data is transmitted over HTTPS
- OneDrive and Notion integrations use OAuth 2.0 and secure tokens

---

## Troubleshooting

- Check the browser console for error messages
- Ensure your OneDrive and Notion API credentials are correct
- Check if the backend server is running
- Verify that you're on a supported job portal website 