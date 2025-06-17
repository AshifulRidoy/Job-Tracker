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
    /glassdoor\.com\/job/
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
    }
  };

  // Determine which job portal we're on
  let portal = 'linkedin'; // default
  if (window.location.hostname.includes('indeed')) {
    portal = 'indeed';
  } else if (window.location.hostname.includes('glassdoor')) {
    portal = 'glassdoor';
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