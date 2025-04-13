document.addEventListener('DOMContentLoaded', function() {
  const spaceRemovalSwitch = document.getElementById('spaceRemovalSwitch');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const excelFile = document.getElementById('excelFile');
  const resultContainer = document.getElementById('resultContainer');
  const resultContent = document.getElementById('resultContent');
  const parseBtn = document.getElementById('parseBtn');
  let currentData = null; // Store the processed data
  let port = null;
  let lastImportedFileName = '';

  // Load saved state
  chrome.storage.local.get(['spaceRemovalEnabled'], function(result) {
    spaceRemovalSwitch.checked = result.spaceRemovalEnabled || false;
  });

  // Function to connect to content script
  function connectToContentScript() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
          reject(new Error('无法获取当前标签页信息'));
          return;
        }
        
        try {
          console.log('Connecting to tab:', tabs[0].id);
          const port = chrome.tabs.connect(tabs[0].id, {name: "popup"});
          
          // Add connection verification
          port.onMessage.addListener(function(message) {
            console.log('Popup received message:', message);
          });

          port.onDisconnect.addListener(function() {
            console.log('Port disconnected, error:', chrome.runtime.lastError);
            port = null;
          });

          resolve(port);
        } catch (error) {
          console.error('Connection error:', error);
          reject(error);
        }
      });
    });
  }

  // Connect when popup opens
  connectToContentScript().catch(error => {
    console.error('Initial connection failed:', error);
  });

  // Handle space removal switch
  spaceRemovalSwitch.addEventListener('change', function() {
    const enabled = spaceRemovalSwitch.checked;
    chrome.storage.local.set({ spaceRemovalEnabled: enabled });
    
    if (port) {
      port.postMessage({
        action: 'toggleSpaceRemoval',
        enabled: enabled
      });
    }
  });

  // Handle import button
  importBtn.addEventListener('click', function() {
    excelFile.click();
  });

  // Function to display results
  function displayResults(data) {
    resultContent.innerHTML = '';
    if (data && data.length > 0) {
      // First add formatted data section
      const formattedDiv = document.createElement('div');
      formattedDiv.style.marginBottom = '20px';
      formattedDiv.style.padding = '10px';
      formattedDiv.style.border = '1px solid #ddd';
      formattedDiv.style.borderRadius = '4px';
      formattedDiv.style.backgroundColor = '#f9f9f9';

      const formattedTitle = document.createElement('div');
      formattedTitle.style.marginBottom = '10px';
      formattedTitle.style.fontWeight = 'bold';
      formattedTitle.textContent = '格式化数据（点击复制）：';
      formattedDiv.appendChild(formattedTitle);

      const formattedContent = document.createElement('pre');
      formattedContent.style.whiteSpace = 'pre-wrap';
      formattedContent.style.wordBreak = 'break-all';
      formattedContent.style.cursor = 'pointer';
      formattedContent.style.padding = '10px';
      formattedContent.style.backgroundColor = '#fff';
      formattedContent.style.border = '1px solid #eee';
      formattedContent.style.borderRadius = '4px';

      // Format data
      const formattedText = data.map(item => {
        return item.type + '\n' + item.value.join('\n');
      }).join('\n\n');

      formattedContent.textContent = formattedText;

      // Add click to copy functionality
      formattedContent.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(formattedText);
          alert('数据已复制到剪贴板！');
        } catch (err) {
          console.error('复制失败:', err);
          alert('复制失败，请手动复制');
        }
      });

      formattedDiv.appendChild(formattedContent);
      resultContent.appendChild(formattedDiv);

      // Then display normal results
      data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
          <span class="result-type">${item.type} (${item.value.length})</span>
          <div class="result-values">
            ${item.value.map(v => `<div>${v}</div>`).join('')}
          </div>
        `;
        resultContent.appendChild(div);
      });

      resultContainer.classList.add('show');
      currentData = data; // Store the data for later use
    } else {
      resultContent.innerHTML = '<div style="color: #666;">没有找到有效数据</div>';
      resultContainer.classList.add('show');
      currentData = null;
    }
  }

  // Handle parse button
  parseBtn.addEventListener('click', function() {
    if (!currentData) {
      alert('请先导入Excel数据');
      return;
    }

    console.log('Starting parse...');
    parseBtn.disabled = true;
    parseBtn.textContent = '解析中...';

    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        alert('无法获取当前标签页信息');
        parseBtn.disabled = false;
        parseBtn.textContent = '自动解析单';
        return;
      }

      // 不等待响应，直接发送数据
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'startAutoParse',
        data: currentData
      });
    });
  });

  // Listen for results
  chrome.runtime.onMessage.addListener(function(message) {
    if (!message || !message.action) return;

    console.log('Received message:', message);

    switch (message.action) {
      case 'parseStarted':
        console.log('Parse process started');
        break;

      case 'parseProgress':
        console.log('Processing:', message.type);
        break;

      case 'autoParseComplete':
        if (message.failedTypes && message.failedTypes.length > 0) {
          const failedDiv = document.createElement('div');
          failedDiv.style.color = 'red';
          failedDiv.style.marginTop = '10px';
          failedDiv.innerHTML = `
            <div>解析异常的种类：</div>
            <div>${message.failedTypes.join(', ')}</div>
            <div style="margin-top: 5px;">请手动处理这些异常数据</div>
          `;
          resultContent.appendChild(failedDiv);
        }
        parseBtn.disabled = false;
        parseBtn.textContent = '自动解析单';
        break;

      case 'autoParseError':
        console.error('Parse error:', message.error);
        alert('解析失败：' + message.error);
        parseBtn.disabled = false;
        parseBtn.textContent = '自动解析单';
        break;
    }
  });

  // Handle file selection
  excelFile.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Record the file name without extension
    const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
    chrome.storage.local.set({ lastImportedFileName: fileNameWithoutExtension });

    importBtn.disabled = true;
    importBtn.textContent = '导入中...';

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 'A' });

        // Process the data
        const processedData = processExcelData(jsonData);
        
        // Display results
        displayResults(processedData);
      } catch (error) {
        console.error('Error processing Excel file:', error);
        resultContent.innerHTML = '<div style="color: red;">处理Excel文件时出错</div>' + error;
        resultContainer.classList.add('show');
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = '导入Excel';
      }
    };

    reader.onerror = function() {
      console.error('Error reading file');
      resultContent.innerHTML = '<div style="color: red;">读取文件时出错</div>';
      resultContainer.classList.add('show');
      importBtn.disabled = false;
      importBtn.textContent = '导入Excel';
    };

    reader.readAsArrayBuffer(file);
  });

  // Function to process Excel data
  function processExcelData(jsonData) {
    const result = [];
    const typeMap = new Map();

    jsonData.forEach(row => {
      let type = row['G']?.trim();
      // handle startWith 'OZ', will replace with '欧足'
      if (type && type.toLowerCase().startsWith('oz')) {
        type = type.replace('OZ', '欧足');
        type = type.replace('oz', '欧足');
      }

      // 去掉17黑 会识别错的场景
      // 比如： "17黑灰；41码" 会识别成
      if (row['H']?.startsWith('17黑')) {
        row['H'] = row['H'].substring(2)
      }

      let value = type?.replace(/\s+/g, '') + ' ' + row['H']?.replace(/\s+/g, '');
      // handle 1808鞋
      if (value.startsWith('1808鞋')) {
        value = value.replace('1808鞋', '1808');
      }

      // 去掉[内长***]这种格式的字符
      if (value.includes('[内长')) {
        value = value.replace(/\[内长.*?\]/g, '');
      }


      // 判断，如果value中包含"cm （适合脚长20.6cm)", 则把括号跟里面内容去掉保留前后距离：
      // "爱浪L-23 紫色双网;34码[内长21.3cm （适合脚长20.6cm）](1)"， 则保留"爱浪L-23 紫色双网;34码[内长21.3cm](1)"
      // 使用正则表达式匹配括号及其内容
      const bracketPattern = /（适合脚长\d+\.?\d*cm）/;
      if (value.includes('cm') && bracketPattern.test(value)) {
        value = value.replace(bracketPattern, '');
      }

      if (type && value && type !== '单品商家编码') {
        let category = '';
        
        // Rule 1: Chinese characters followed by letters or numbers
        if (/^[\u4e00-\u9fa5]/.test(type)) {
          const chineseMatch = type.match(/^[\u4e00-\u9fa5]+/);
          if (chineseMatch) {
            category = chineseMatch[0];
          }
        } else if (type.includes(' ')) {  // 如果不是中文开头，且包含空格
          category = type.split(' ')[0];  // 取空格前的部分
          if (category.toLowerCase().trim().startsWith('md')) {
            category = '名点';
          }
        }
        // Rule 2: Special 1808 prefix
        else if (type.startsWith('1808')) {
          category = '1808';
        }
        // Rule 3: MD or md prefix
        else if (type.toLowerCase().trim().startsWith('md')) {
          category = '名点';
        }
        // Rule 4: Special "涌哥" prefix - keep original type
        else if (type.startsWith('涌哥')) {
          category = type;
        }
        // Default case: use the original type
        else {
          category = type;
        }

        // Special handling for "童" character
        if (category.includes('童')) {
          const beforeTong = category.split('童')[0];
          if (beforeTong) {
            category = beforeTong;
          }
        }

        if (!typeMap.has(category)) {
          typeMap.set(category, []);
        }
        typeMap.get(category).push(value);
      }
    });

    typeMap.forEach((values, type) => {
      // remove space in type
      result.push({
        type: type,
        value: values
      });
    });

    return result;
  }

  // Handle export button
  exportBtn.addEventListener('click', function() {
    exportBtn.disabled = true;
    exportBtn.textContent = '导出中...';

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        alert('无法获取当前标签页信息');
        exportBtn.disabled = false;
        exportBtn.textContent = '导出数据';
        return;
      }

      chrome.storage.local.get('lastImportedFileName', function(result) {
        const fileName = result.lastImportedFileName || 'export';

        chrome.tabs.sendMessage(tabs[0].id, { action: 'exportData' }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            alert('导出失败：' + chrome.runtime.lastError.message);
            exportBtn.disabled = false;
            exportBtn.textContent = '导出数据';
            return;
          }

          if (response && response.data && response.data.trim()) {
            // Create a blob from the data
            const blob = new Blob([response.data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            // Create a link to download the file
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.txt`;
            a.click();

            // Revoke the object URL
            URL.revokeObjectURL(url);

            // alert('数据已导出为TXT文件！');
          } else {
            alert('未找到可导出的数据');
          }
          
          exportBtn.disabled = false;
          exportBtn.textContent = '导出数据';
        });
      });
    });
  });
}); 