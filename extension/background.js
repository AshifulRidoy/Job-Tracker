// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Background script received message:', request);
  if (request.action === "jobDataScraped") {
    console.log('Processing scraped job data...');
    // Store the scraped job data
    storeJobData(request.data);
    // Send response back to content script
    sendResponse({ status: 'success' });
  }
});

function storeJobData(jobData) {
  console.log('Storing job data:', jobData);
  // Get existing jobs from storage
  chrome.storage.local.get(['jobs'], function(result) {
    console.log('Retrieved existing jobs:', result.jobs);
    const jobs = result.jobs || [];
    
    // Check if this job URL already exists
    const existingJobIndex = jobs.findIndex(job => job.job_url === jobData.job_url);
    
    if (existingJobIndex === -1) {
      console.log('Adding new job');
      // Add new job with timestamp
      jobData.timestamp = new Date().toISOString();
      jobs.push(jobData);
    } else {
      console.log('Updating existing job');
      // Update existing job
      jobs[existingJobIndex] = {
        ...jobs[existingJobIndex],
        ...jobData,
        timestamp: new Date().toISOString()
      };
    }
    
    // Save updated jobs array
    chrome.storage.local.set({ jobs: jobs }, function() {
      console.log('Jobs saved to storage:', jobs);
      // Notify that data was saved
      chrome.runtime.sendMessage({
        action: "jobDataSaved",
        data: jobData
      });
    });
  });
}

// Listen for extension icon click to show the floating panel
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'showPanel' });
  }
}); 