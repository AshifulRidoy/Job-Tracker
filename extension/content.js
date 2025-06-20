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

  // Create host and shadow root
  const host = document.createElement('div');
  host.id = 'jt-floating-panel';
  Object.assign(host.style, {
    position: 'fixed',
    top: '40px',
    right: '40px',
    width: '370px',
    zIndex: 999999,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 0,
    border: 'none',
  });
  const shadow = host.attachShadow({ mode: 'open' });

  // PureCSS and custom styles
  const styleLinks = `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/purecss@3.0.0/build/pure-min.css" integrity="sha384-X38yfunGUhNzHpBaEBsWLO+A0HDYOQi8ufWDkZ0k9e0eXz/tH3II7uKZ9msv++Ls" crossorigin="anonymous">
    <style>
      .jt-panel-bg {
        background: #fff;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        font-family: Arial, sans-serif;
      }
      .jt-panel-header {
        background: #1f8dd6;
        color: #fff;
        padding: 12px 20px 8px 20px;
        border-radius: 10px 10px 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .jt-close-btn {
        background: none;
        border: none;
        color: #fff;
        font-size: 1.5rem;
        cursor: pointer;
        margin-left: auto;
      }
      .pure-form .pure-input, .pure-form input, .pure-form select, .pure-form textarea {
        width: 100%;
        margin-bottom: 10px;
      }
      .chip-set {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-bottom: 10px;
      }
      .chip {
        background: #e0e0e0;
        padding: 2px 8px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .chip button {
        background: none;
        border: none;
        color: #666;
        padding: 0;
        font-size: 16px;
        cursor: pointer;
      }
      .status-success { color: #388e3c; margin-top: 10px; }
      .status-error { color: #d32f2f; margin-top: 10px; }
      .center { text-align: center; }
    </style>
  `;

  // Panel HTML using PureCSS
  const panelHTML = `
    <div class="jt-panel-bg">
      <div class="jt-panel-header">
        <span style="font-weight:bold;">Job Application Tracker</span>
        <button id="jt-close-btn" class="jt-close-btn" aria-label="Close">&times;</button>
      </div>
      <form id="jobForm" class="pure-form pure-form-stacked" style="padding: 20px;">
        <h4 style="margin-bottom: 18px;">Job Application Details</h4>
        <label for="jobTitle">Job Title</label>
        <input class="pure-input" type="text" id="jobTitle" required>
        <label for="companyName">Company Name</label>
        <input class="pure-input" type="text" id="companyName" required>
        <label for="location">Location</label>
        <input class="pure-input" type="text" id="location">
        <label for="jobType">Job Type</label>
        <select class="pure-input" id="jobType">
          <option value="full-time">Full Time</option>
          <option value="part-time">Part Time</option>
          <option value="contract">Contract</option>
          <option value="internship">Internship</option>
        </select>
        <label for="salaryRange">Salary Range</label>
        <input class="pure-input" type="text" id="salaryRange" placeholder="e.g., $80,000 - $100,000">
        <label for="status">Application Status</label>
        <select class="pure-input" id="status">
          <option value="saved">Saved</option>
          <option value="applied">Applied</option>
          <option value="interview">Interview</option>
          <option value="offer">Offer</option>
          <option value="rejected">Rejected</option>
          <option value="accepted">Accepted</option>
        </select>
        <label for="jobDescription">Job Description</label>
        <textarea class="pure-input" id="jobDescription"></textarea>
        <label for="jobUrl">Job URL</label>
        <input class="pure-input" type="url" id="jobUrl">
        <label for="tagField">Tags</label>
        <div class="chip-set" id="tagInput">
          <input class="pure-input" type="text" id="tagField" placeholder="Add tags...">
        </div>
        <label for="notes">Notes</label>
        <textarea class="pure-input" id="notes" placeholder="Add any additional notes..."></textarea>
        <div class="center" style="margin-top: 18px;">
          <button type="submit" class="pure-button pure-button-primary">Save Application</button>
        </div>
        <div id="status" class="center" style="display:none;"></div>
        <div id="loadingSpinner" class="center" style="display:none; margin-top:10px;">
          <progress></progress>
        </div>
      </form>
    </div>
  `;

  shadow.innerHTML = styleLinks + panelHTML;
  document.body.appendChild(host);

  // All selectors and logic must use shadowRoot
  const closeBtn = shadow.getElementById('jt-close-btn');
  closeBtn.onclick = () => {
    host.remove();
  };

  // Tag logic (chip-set)
  const tagInput = shadow.getElementById('tagInput');
  const tagField = shadow.getElementById('tagField');
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
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `
        <span>${tag}</span>
        <button type="button" aria-label="Remove tag">&times;</button>
      `;
      chip.querySelector('button').onclick = function() {
        chip.remove();
        tags.delete(tag);
      };
      tagInput.insertBefore(chip, tagField);
    }
  }

  // Autofill job URL
  shadow.getElementById('jobUrl').value = window.location.href;

  // Autofill scraped data
  scrapeJobData().then(data => {
    if (data.job_title) shadow.getElementById('jobTitle').value = data.job_title;
    if (data.company_name) shadow.getElementById('companyName').value = data.company_name;
    if (data.location) shadow.getElementById('location').value = data.location;
    if (data.job_description) shadow.getElementById('jobDescription').value = data.job_description;
    if (data.job_url) shadow.getElementById('jobUrl').value = data.job_url;
  });

  // Form submission logic
  const jobForm = shadow.getElementById('jobForm');
  const status = shadow.getElementById('status');
  const loadingSpinner = shadow.getElementById('loadingSpinner');
  const submitBtn = jobForm.querySelector('button[type="submit"]');
  const API_BASE_URL = 'https://job-tracker-kh1h.onrender.com';

  jobForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    loadingSpinner.style.display = 'block';
    submitBtn.disabled = true;
    showStatus('Submitting...', '');
    const jobData = {
      job_title: shadow.getElementById('jobTitle').value,
      company_name: shadow.getElementById('companyName').value,
      location: shadow.getElementById('location').value,
      job_description: shadow.getElementById('jobDescription').value,
      job_url: shadow.getElementById('jobUrl').value,
      job_type: shadow.getElementById('jobType').value,
      salary_range: shadow.getElementById('salaryRange').value,
      status: shadow.getElementById('status').value,
      notes: shadow.getElementById('notes').value,
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
        shadow.querySelectorAll('.chip').forEach(tag => tag.remove());
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
    status.className = 'center';
    if (type === 'success') {
      status.classList.add('status-success');
    } else if (type === 'error') {
      status.classList.add('status-error');
    }
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
      status.classList.remove('status-success', 'status-error');
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