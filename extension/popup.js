document.addEventListener('DOMContentLoaded', async function() {
  console.log('Popup DOM loaded');
  
  // Debug: Log all form elements
  const form = document.getElementById('jobApplicationForm');
  console.log('Form element:', form);
  console.log('Form elements:', {
    jobTitle: document.getElementById('jobTitle'),
    companyName: document.getElementById('companyName'),
    location: document.getElementById('location'),
    jobDescription: document.getElementById('jobDescription'),
    jobUrl: document.getElementById('jobUrl')
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log('Current tab:', tab.url);
  
  chrome.tabs.sendMessage(tab.id, { action: "scrapeJobData" }, (response) => {
    console.log('Raw response from content script:', response);
    if (chrome.runtime.lastError) {
      console.error('Chrome runtime error:', chrome.runtime.lastError);
      return;
    }
    if (response && response.error) {
      console.error('Scraping error:', response.error);
      return;
    }
    if (response) {
      // Debug logs for each field
      if (response.job_title) {
        console.log('Setting jobTitle:', response.job_title);
        const el = document.getElementById('jobTitle');
        console.log('jobTitle element:', el);
        if (el) {
          el.value = response.job_title;
          console.log('jobTitle value after setting:', el.value);
        }
      }
      if (response.company_name) {
        console.log('Setting companyName:', response.company_name);
        const el = document.getElementById('companyName');
        console.log('companyName element:', el);
        if (el) {
          el.value = response.company_name;
          console.log('companyName value after setting:', el.value);
        }
      }
      if (response.location) {
        console.log('Setting location:', response.location);
        const el = document.getElementById('location');
        console.log('location element:', el);
        if (el) {
          el.value = response.location;
          console.log('location value after setting:', el.value);
        }
      }
      if (response.job_description) {
        console.log('Setting jobDescription:', response.job_description);
        const el = document.getElementById('jobDescription');
        console.log('jobDescription element:', el);
        if (el) {
          el.value = response.job_description;
          console.log('jobDescription value after setting:', el.value);
        }
      }
      if (response.job_url) {
        console.log('Setting jobUrl:', response.job_url);
        const el = document.getElementById('jobUrl');
        console.log('jobUrl element:', el);
        if (el) {
          el.value = response.job_url;
          console.log('jobUrl value after setting:', el.value);
        }
      }
    } else {
      console.log('No response data received from content script');
    }
  });

  // Tab handling
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show active content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}Tab`) {
          content.classList.add('active');
        }
      });
    });
  });

  // Tag handling
  const tagInput = document.getElementById('tagInput');
  const tagField = document.getElementById('tagField');
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
        <button type="button" onclick="this.parentElement.remove()">×</button>
      `;
      tagInput.insertBefore(tagElement, tagField);
    }
  }

  // Job form handling
  const jobForm = document.getElementById('jobForm');
  const status = document.getElementById('status');

  // Get the current tab's URL
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    document.getElementById('jobUrl').value = tabs[0].url;
  });

  const API_BASE_URL = 'https://your-render-app-url.onrender.com';  // Update this with your Render URL

  jobForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const jobData = {
      job_title: document.getElementById('jobTitle').value,
      company_name: document.getElementById('companyName').value,
      location: document.getElementById('location').value,
      job_description: document.getElementById('jobDescription').value,
      job_url: document.getElementById('jobUrl').value,
      job_type: document.getElementById('jobType').value,
      salary_range: document.getElementById('salaryRange').value,
      status: document.getElementById('status').value,
      notes: document.getElementById('notes').value,
      tags: Array.from(tags)
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData)
      });

      const result = await response.json();

      if (response.ok) {
        showStatus('Job application saved successfully! OneDrive folder created.', 'success');
        // Clear form
        jobForm.reset();
        // Clear tags
        tags.clear();
        document.querySelectorAll('.tag').forEach(tag => tag.remove());
        // Store the OneDrive folder URL
        chrome.storage.local.set({[jobData.company_name]: result.onedrive_folder_url});
      } else {
        showStatus('Error saving job application: ' + result.detail, 'error');
      }
    } catch (error) {
      showStatus('Error connecting to server: ' + error.message, 'error');
    }
  });

  // Resume form handling
  const resumeForm = document.getElementById('resumeForm');
  
  resumeForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('version', document.getElementById('resumeVersion').value);
    formData.append('notes', document.getElementById('resumeNotes').value);
    formData.append('file', document.getElementById('resumeFile').files[0]);
    formData.append('company_name', document.getElementById('companyName').value);

    try {
      const response = await fetch('http://localhost:8000/api/resumes', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok) {
        showStatus('Resume saved successfully!', 'success');
        resumeForm.reset();
      } else {
        showStatus('Error saving resume: ' + result.detail, 'error');
      }
    } catch (error) {
      showStatus('Error connecting to server: ' + error.message, 'error');
    }
  });

  // Interview form handling
  const interviewForm = document.getElementById('interviewForm');
  
  interviewForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const interviewData = {
      job_id: '', // This should be set when scheduling from a specific job
      company_name: document.getElementById('companyName').value,
      date: new Date(document.getElementById('interviewDate').value),
      type: document.getElementById('interviewType').value,
      preparation_notes: document.getElementById('preparationNotes').value
    };

    try {
      const response = await fetch('http://localhost:8000/api/interviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(interviewData)
      });

      const result = await response.json();

      if (response.ok) {
        showStatus('Interview scheduled successfully!', 'success');
        interviewForm.reset();
      } else {
        showStatus('Error scheduling interview: ' + result.detail, 'error');
      }
    } catch (error) {
      showStatus('Error connecting to server: ' + error.message, 'error');
    }
  });

  // Dashboard button
  const viewDashboardBtn = document.getElementById('viewDashboard');
  if (viewDashboardBtn) {
    viewDashboardBtn.addEventListener('click', function() {
      chrome.tabs.create({ url: 'http://localhost:8000/' });
    });
  }

  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status ' + type;
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 5000);
  }
}); 