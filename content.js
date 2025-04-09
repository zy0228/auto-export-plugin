let spaceRemovalInterval = null;

// Keep track of active port
let activePort = null;

// Keep track of parse status
let isParsingActive = false;

// Global state
let isProcessing = false;

// Function to remove extra spaces
function startSpaceRemoval() {
  // Check if current URL contains 'bot-preorder'
  if (!window.location.href.includes('bot-preorder')) {
    return;
  }

  console.log('startSpaceRemoval')
  setTimeout(() => {
    const singleRadio = document.querySelector('#trade > header > form > div:nth-child(4) > div > div')
    console.log(singleRadio)
    if (singleRadio) {
      singleRadio.click()
    }
  }, 1000)
  
  if (spaceRemovalInterval) return;
  
  spaceRemovalInterval = setInterval(() => {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = textarea.value.replaceAll('\n\n', '\n');
    }
  }, 200);
}

function stopSpaceRemoval() {
  if (spaceRemovalInterval) {
    clearInterval(spaceRemovalInterval);
    spaceRemovalInterval = null;
  }
}

// Function to export data
async function exportData() {
  return new Promise((resolve, reject) => {
    try {
      const rows = document.querySelectorAll('.el-table__row');
      console.log('Found rows:', rows.length);
      
      if (rows.length === 0) {
        reject(new Error('No table rows found'));
        return;
      }

      let result = '';
      let processedCount = 0;

      rows.forEach((node, index) => {
        setTimeout(() => {
          try {
            node.click();
            setTimeout(() => {
              try {
                node.click();
                const textarea = document.querySelector('.el-textarea__inner');
                if (textarea) {
                  const text = textarea.value.replace('【云果仓自动报单】', '');
                  const title = node.querySelectorAll('td')[2]?.querySelector('span')?.innerText || '';
                  result += title + '\n' + text + '\n';
                  console.log(`Processed row ${index + 1}/${rows.length}`);
                } else {
                  console.log(`No textarea found for row ${index + 1}`);
                }

                processedCount++;
                if (processedCount === rows.length) {
                  console.log('Export completed');
                  resolve(result);
                }
              } catch (error) {
                console.error(`Error processing row ${index + 1}:`, error);
                processedCount++;
                if (processedCount === rows.length) {
                  resolve(result);
                }
              }
            }, 700);
          } catch (error) {
            console.error(`Error clicking row ${index + 1}:`, error);
            processedCount++;
            if (processedCount === rows.length) {
              resolve(result);
            }
          }
        }, index * 1000);
      });
    } catch (error) {
      console.error('Error in exportData:', error);
      reject(error);
    }
  });
}

// Helper function to find buttons
function findButton(text) {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find(btn => btn.innerText.trim().includes(text));
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Listen for messages
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Received message:', request, 'isProcessing:', isProcessing);

  if (request.action === 'startAutoParse' && !isProcessing) {
    console.log('Starting auto parse process');
    handleAutoParse(request.data);
  }

  if (request.action === 'exportData') {
    exportData()
    .then(data => {
      console.log('Export successful, data length:', data.length);
      sendResponse({ data: data });
    })
    .catch(error => {
      console.error('Export failed:', error);
      sendResponse({ error: error.message });
    });
    return true; // Will respond asynchronously
  }
});

// Handle auto parse process
async function handleAutoParse(data) {
  if (!data || isProcessing) return;
  
  isProcessing = true;
  const failedTypes = [];

  try {
    // Send started message
    chrome.runtime.sendMessage({ action: 'parseStarted' });

    // Find required elements
    const textarea = document.querySelector('#analyse-content');
    const clearBtn = findButton('清除');
    const parseBtn = findButton('解析');
    const submitBtn = findButton('提交');

    if (!textarea || !clearBtn || !parseBtn || !submitBtn) {
      throw new Error('找不到必要的页面元素');
    }

    // Process each item
    for (const item of data) {
      try {
        // Send progress
        chrome.runtime.sendMessage({ 
          action: 'parseProgress', 
          type: item.type 
        });

        // Clear and set new data
        clearBtn.click();
        await sleep(500);
        
        textarea.value = item.type + '\n' + item.value.join('\n');
        await sleep(500);

        // Parse
        parseBtn.click();
        await sleep(2000);

        // Check result
        const hasResult = document.querySelector('.el-card__header');
        if (hasResult) {
          submitBtn.click();
          await sleep(2000);
        } else {
          failedTypes.push(item.type);
        }
      } catch (error) {
        console.error('Error processing item:', item.type, error);
        failedTypes.push(item.type);
      }
    }

    // Send complete message
    chrome.runtime.sendMessage({
      action: 'autoParseComplete',
      failedTypes: failedTypes
    });

  } catch (error) {
    console.error('Auto parse error:', error);
    chrome.runtime.sendMessage({
      action: 'autoParseError',
      error: error.message
    });
  } finally {
    isProcessing = false;
  }
}

// Check if URL contains 'bot-preorder' and auto enable/disable space removal
function checkUrlAndToggleSpaceRemoval() {
  if (window.location.href.includes('bot-preorder')) {
    chrome.storage.local.set({ spaceRemovalEnabled: true });
    startSpaceRemoval();
  } else {
    chrome.storage.local.set({ spaceRemovalEnabled: false });
    stopSpaceRemoval();
  }
}

// Run check when page loads
checkUrlAndToggleSpaceRemoval();

// Listen for URL changes (for single page applications)
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (lastUrl !== window.location.href) {
    lastUrl = window.location.href;
    checkUrlAndToggleSpaceRemoval();
  }
}).observe(document, { subtree: true, childList: true }); 