// Function to check if we're on a job page
function isJobPostingPage() {
  const url = window.location.href;
  console.log('Checking URL:', url);
  
  // More specific URL patterns
  const patterns = [
    /linkedin\.com\/jobs\/view/,
    /linkedin\.com\/jobs\/search/,
    /indeed\.com\/viewjob/,
    /indeed\.com\/job/,
    /glassdoor\.com\/Job/,
    /glassdoor\.com\/job/,
    /xing\.com\/Job/,
    /xing\.com\/job/
  ];
  
  return patterns.some(pattern => pattern.test(url));
}

// Function to wait for an element to be present
function waitForElement(selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

// Function to scrape job data
async function scrapeJobData() {
  console.log('Starting job data scraping...');
  
  // Updated selectors for different job portals
  const selectors = {
    linkedin: {
      title: [
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title',
        'h1.job-details-jobs-unified-top-card__job-title'
      ],
      company: [
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a'
      ],
      location: [
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__location'
      ],
      description: [
        '.job-details-jobs-unified-top-card__job-description',
        '.jobs-description__content',
        '#job-details'
      ]
    },
    indeed: {
      title: [
        '.jobsearch-JobInfoHeader-title',
        'h1.jobsearch-JobInfoHeader-title',
        '.jobsearch-DesktopStickyContainer h1'
      ],
      company: [
        '.jobsearch-CompanyInfoContainer',
        '.jobsearch-CompanyInfoContainer a',
        '.jobsearch-CompanyInfoContainer span'
      ],
      location: [
        '.jobsearch-JobInfoHeader-location',
        '.jobsearch-DesktopStickyContainer .location'
      ],
      description: [
        '#jobDescriptionText',
        '.jobsearch-jobDescriptionText',
        '.jobsearch-DesktopStickyContainer .jobsearch-jobDescriptionText'
      ]
    },
    glassdoor: {
      title: [
        '.job-details-jobs-unified-top-card__job-title',
        '.job-details-jobs-unified-top-card h1',
        '.job-details-jobs-unified-top-card__job-title span'
      ],
      company: [
        '.job-details-jobs-unified-top-card__company-name',
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name span'
      ],
      location: [
        '.job-details-jobs-unified-top-card__bullet',
        '.job-details-jobs-unified-top-card__location',
        '.job-details-jobs-unified-top-card__bullet span'
      ],
      description: [
        '.jobDescriptionContent',
        '.job-details-jobs-unified-top-card__job-description',
        '#JobDescriptionContainer'
      ]
    },
    xing: {
      title: [
        'h1[data-qa="job-title"]',
        '.job-title',
        'h1'
      ],
      company: [
        'a[data-qa="company-name"]',
        '.company',
        '.company-name',
        '.job-company'
      ],
      location: [
        'span[data-qa="job-location"]',
        '.job-location',
        '.location'
      ],
      description: [
        'section[data-qa="job-description"]',
        '.job-description',
        '.description',
        'section'
      ]
    }
  };

  // Determine which job portal we're on
  let portal = 'linkedin'; // default
  if (window.location.hostname.includes('indeed')) {
    portal = 'indeed';
  } else if (window.location.hostname.includes('glassdoor')) {
    portal = 'glassdoor';
  } else if (window.location.hostname.includes('xing')) {
    portal = 'xing';
  }
  console.log('Detected portal:', portal);

  // Get the selectors for the current portal
  const currentSelectors = selectors[portal];

  // Try to get text content using multiple selectors
  async function getTextContentWithFallback(selectorArray) {
    for (const selector of selectorArray) {
      try {
        console.log('Trying selector:', selector);
        const element = await waitForElement(selector);
        if (element) {
          const text = element.textContent.trim();
          if (text) {
            console.log('Found text for selector:', selector, text);
            return text;
          }
        }
      } catch (e) {
        console.log('Timeout for selector:', selector);
      }
    }
    return '';
  }

  // Parallelize all field scraping
  const [job_title, company_name, location, job_description] = await Promise.all([
    getTextContentWithFallback(currentSelectors.title),
    getTextContentWithFallback(currentSelectors.company),
    getTextContentWithFallback(currentSelectors.location),
    getTextContentWithFallback(currentSelectors.description)
  ]);

  const jobData = {
    job_title,
    company_name,
    location,
    job_description,
    job_url: window.location.href,
    timestamp: new Date().toISOString()
  };

  console.log('Final scraped data:', jobData);
  return jobData;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "scrapeJobData") {
    console.log('Scraping started...');
    scrapeJobData()
      .then(data => {
        console.log('Scraping finished:', data);
        sendResponse(data);
      })
      .catch(error => {
        console.error('Scraping error:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});

// Listen for messages from the background script to show the floating panel
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'showPanel') {
    injectJobTrackerPanel();
    sendResponse({status: 'panel_injected'});
  }
});

// Function to inject the floating panel
function injectJobTrackerPanel() {
  if (document.getElementById('jt-floating-panel')) return; // Prevent duplicates

  // Panel HTML (based on popup.html, with a close button)
  const panel = document.createElement('div');
  panel.id = 'jt-floating-panel';
  panel.innerHTML = `
    <div id="jt-panel-header">
      <span style="font-weight:bold;">Job Application Tracker</span>
      <button id="jt-close-btn" style="float:right;font-size:18px;background:none;border:none;cursor:pointer;">&times;</button>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="job">Job Details</div>
    </div>
    <div id="jobTab" class="tab-content active">
      <h2>Job Application Details</h2>
      <form id="jobForm">
        <div class="form-group">
          <label for="jobTitle">Job Title:</label>
          <input type="text" id="jobTitle">
        </div>
        <div class="form-group">
          <label for="companyName">Company Name:</label>
          <input type="text" id="companyName">
        </div>
        <div class="form-group">
          <label for="location">Location:</label>
          <input type="text" id="location">
        </div>
        <div class="form-group">
          <label for="jobType">Job Type:</label>
          <select id="jobType">
            <option value="full-time">Full Time</option>
            <option value="part-time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </div>
        <div class="form-group">
          <label for="salaryRange">Salary Range:</label>
          <input type="text" id="salaryRange" placeholder="e.g., $80,000 - $100,000">
        </div>
        <div class="form-group">
          <label for="status">Application Status:</label>
          <select id="status">
            <option value="saved">Saved</option>
            <option value="applied">Applied</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="accepted">Accepted</option>
          </select>
        </div>
        <div class="form-group">
          <label for="jobDescription">Job Description:</label>
          <textarea id="jobDescription"></textarea>
        </div>
        <div class="form-group">
          <label for="jobUrl">Job URL:</label>
          <input type="url" id="jobUrl">
        </div>
        <div class="form-group">
          <label for="tags">Tags:</label>
          <div class="tag-input" id="tagInput">
            <input type="text" id="tagField" placeholder="Add tags...">
          </div>
        </div>
        <div class="form-group">
          <label for="notes">Notes:</label>
          <textarea id="notes" placeholder="Add any additional notes..."></textarea>
        </div>
        <div class="button-group">
          <button type="submit">Save Application</button>
        </div>
      </form>
    </div>
    <div id="status" class="status"></div>
    <div id="loadingSpinner" style="display:none; text-align:center; margin-top:10px;">
      <svg width="32" height="32" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" fill="none" stroke="#4CAF50" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 31.4" transform="rotate(-90 25 25)">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
    </div>
  `;

  // Panel CSS
  Object.assign(panel.style, {
    position: 'fixed',
    top: '40px',
    right: '40px',
    width: '370px',
    background: 'white',
    border: '2px solid #4CAF50',
    borderRadius: '10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    zIndex: 999999,
    padding: '0 0 20px 0',
    fontFamily: 'Arial, sans-serif',
    maxHeight: '90vh',
    overflowY: 'auto',
  });

  // Panel header CSS
  const style = document.createElement('style');
  style.textContent = `
    #jt-panel-header {
      padding: 12px 20px 8px 20px;
      border-bottom: 1px solid #eee;
      background: #f7f7f7;
      border-radius: 10px 10px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #jobForm { padding: 20px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, textarea, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    textarea { height: 100px; resize: vertical; }
    .button-group { display: flex; gap: 10px; margin-top: 20px; }
    button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; flex: 1; }
    button:hover { background-color: #45a049; }
    button.secondary { background-color: #2196F3; }
    button.secondary:hover { background-color: #1976D2; }
    .status { margin-top: 10px; padding: 10px; border-radius: 4px; display: none; }
    .success { background-color: #dff0d8; color: #3c763d; }
    .error { background-color: #f2dede; color: #a94442; }
    .tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid #ddd; }
    .tab { padding: 10px 20px; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #4CAF50; font-weight: bold; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .tag-input { display: flex; flex-wrap: wrap; gap: 5px; padding: 5px; border: 1px solid #ddd; border-radius: 4px; }
    .tag { background-color: #e0e0e0; padding: 2px 8px; border-radius: 12px; display: flex; align-items: center; gap: 5px; }
    .tag button { background: none; border: none; color: #666; padding: 0; font-size: 16px; cursor: pointer; }
    .tag-input input { border: none; outline: none; flex: 1; min-width: 100px; }
  `;
  document.head.appendChild(style);

  document.body.appendChild(panel);

  // Close button logic
  panel.querySelector('#jt-close-btn').onclick = () => {
    panel.remove();
    style.remove();
  };

  // Tab logic
  const tabs = panel.querySelectorAll('.tab');
  const tabContents = panel.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}Tab`) {
          content.classList.add('active');
        }
      });
    });
  });

  // Tag logic
  const tagInput = panel.querySelector('#tagInput');
  const tagField = panel.querySelector('#tagField');
  const tags = new Set();
  tagField.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && this.value.trim()) {
      e.preventDefault();
      addTag(this.value.trim());
      this.value = '';
    }
  });
  function addTag(tag) {
    if (!tags.has(tag)) {
      tags.add(tag);
      const tagElement = document.createElement('div');
      tagElement.className = 'tag';
      tagElement.innerHTML = `
        ${tag}
        <button type="button">&times;</button>
      `;
      tagElement.querySelector('button').onclick = function() {
        tagElement.remove();
        tags.delete(tag);
      };
      tagInput.insertBefore(tagElement, tagField);
    }
  }

  // Autofill job URL
  panel.querySelector('#jobUrl').value = window.location.href;

  // Autofill scraped data
  scrapeJobData().then(data => {
    if (data.job_title) panel.querySelector('#jobTitle').value = data.job_title;
    if (data.company_name) panel.querySelector('#companyName').value = data.company_name;
    if (data.location) panel.querySelector('#location').value = data.location;
    if (data.job_description) panel.querySelector('#jobDescription').value = data.job_description;
    if (data.job_url) panel.querySelector('#jobUrl').value = data.job_url;
  });

  // Form submission logic
  const jobForm = panel.querySelector('#jobForm');
  const status = panel.querySelector('#status');
  const loadingSpinner = panel.querySelector('#loadingSpinner');
  const submitBtn = jobForm.querySelector('button[type="submit"]');
  const API_BASE_URL = 'https://job-tracker-kh1h.onrender.com';

  jobForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    loadingSpinner.style.display = 'block';
    submitBtn.disabled = true;
    showStatus('Submitting...', '');
    const jobData = {
      job_title: panel.querySelector('#jobTitle').value,
      company_name: panel.querySelector('#companyName').value,
      location: panel.querySelector('#location').value,
      job_description: panel.querySelector('#jobDescription').value,
      job_url: panel.querySelector('#jobUrl').value,
      job_type: panel.querySelector('#jobType').value,
      salary_range: panel.querySelector('#salaryRange').value,
      status: panel.querySelector('#status').value,
      notes: panel.querySelector('#notes').value,
      tags: Array.from(tags)
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData)
      });
      const result = await response.json();
      if (response.ok) {
        showStatus('Job application saved successfully! OneDrive folder created.', 'success');
        jobForm.reset();
        tags.clear();
        panel.querySelectorAll('.tag').forEach(tag => tag.remove());
        // Store the OneDrive folder URL
        if (chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({[jobData.company_name]: result.onedrive_folder_url});
        }
      } else {
        showStatus('Error saving job application: ' + result.detail, 'error');
      }
    } catch (error) {
      showStatus('Error connecting to server: ' + error.message, 'error');
    } finally {
      loadingSpinner.style.display = 'none';
      submitBtn.disabled = false;
    }
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status';
    if (type === 'success') {
      status.classList.add('success');
    } else if (type === 'error') {
      status.classList.add('error');
    }
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 4000);
  }
}

console.log('Content script loaded');

document.addEventListener('DOMContentLoaded', async function() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log('Popup: Sending scrapeJobData message to tab', tab.id, tab.url);

  chrome.tabs.sendMessage(tab.id, { action: "scrapeJobData" }, (response) => {
    console.log('Popup: Received response from content script:', response);
    if (chrome.runtime.lastError) {
      console.error('Popup: Error:', chrome.runtime.lastError);
      return;
    }
  });
}); 