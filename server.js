// ################################################################
// # UPDATED: 2025-11-10 - Veo3 Video Generation Integration
// # - Added GET /api/veo3/get-session endpoint
// # - Updated /api/veo3/set-project to accept both projectId & sceneId
// # - Manual project/scene setup workflow (no auto-create)
// ################################################################
const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/images', express.static('images'));
app.use('/assets', express.static('assets'));
app.use('/projects', express.static('projects'));
app.use(express.static(__dirname));

const IMAGE_DIR = path.join(__dirname, 'images');
const ASSET_DIR = path.join(__dirname, 'assets');
const PROJECT_DIR = path.join(__dirname, 'projects');
const CHROME_PROFILE_DIR = path.join(__dirname, 'chrome-profile');

// Session state
let session = {
  accessToken: null,
  cookies: null,
  sessionToken: null,
  workflowId: null,
  sessionId: null,
  lastUpdate: null,
  page: null,
  browser: null,
  chromeReady: false
};

// Conversation history for context
let conversationHistory = [];

// Logs for debugging
let serverLogs = [];
const MAX_LOGS = 500;

const log = (msg, level = 'info') => {
  const time = new Date().toTimeString().split(' ')[0];
  const timestamp = Date.now();
  console.log(`[${time}] ${msg}`);

  // Add to server logs
  serverLogs.push({
    timestamp,
    time,
    level,
    message: msg
  });

  // Keep only last MAX_LOGS entries
  if (serverLogs.length > MAX_LOGS) {
    serverLogs = serverLogs.slice(-MAX_LOGS);
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateWorkflowId() {
  return crypto.randomUUID();
}

function generateSessionId() {
  return `;${Date.now()}`;
}

// ============================================
// AUTHENTICATION
// ============================================

const getAccessToken = async () => {
  log('Getting access token from Whisk session...');

  try {
    if (!session.cookies || !session.sessionToken) {
      await extractCredentials();
    }

    const response = await axios.get('https://labs.google/fx/api/auth/session', {
      headers: {
        'Cookie': session.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://labs.google/fx/tools/whisk/project',
        'Accept': '*/*'
      },
      timeout: 30000
    });

    if (response.data && response.data.access_token) {
      session.accessToken = response.data.access_token;
      session.lastUpdate = Date.now();
      log(`✓ Access token obtained: ${session.accessToken.substring(0, 30)}...`);
      return session.accessToken;
    } else {
      throw new Error('No access token in response');
    }
  } catch (error) {
    log(`✗ Failed to get access token: ${error.message}`, 'error');
    log(`Error details: ${error.stack}`, 'error');
    throw error;
  }
};

const extractCredentials = async () => {
  log('Extracting credentials from Chrome...');

  try {
    // If we have a page from launchChrome(), use it
    if (session.page) {
      const cookies = await session.page.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // Extract session token
      const sessionCookie = cookies.find(c => c.name === '__Secure-next-auth.session-token');
      if (sessionCookie) {
        session.sessionToken = sessionCookie.value;
      }

      session.cookies = cookieString;
      log('✓ Credentials extracted successfully');
      return true;
    }

    // Fallback: Try to connect to remote debugging port (legacy method)
    const res = await axios.get('http://localhost:9222/json/version', { timeout: 5000 });
    const wsEndpoint = res.data.webSocketDebuggerUrl;

    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null
    });

    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('labs.google'));

    if (!page) {
      throw new Error('Whisk page not found! Please launch Chrome using "Khởi động Chrome" button');
    }

    session.page = page;

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Extract session token
    const sessionCookie = cookies.find(c => c.name === '__Secure-next-auth.session-token');
    if (sessionCookie) {
      session.sessionToken = sessionCookie.value;
    }

    session.cookies = cookieString;
    log('✓ Credentials extracted successfully');

    return true;
  } catch (error) {
    log(`✗ Failed to extract credentials: ${error.message}`);
    throw error;
  }
};

// ============================================
// WORKFLOW CREATION - BƯỚC QUAN TRỌNG!
// ============================================

const createOrUpdateWorkflow = async () => {
  log('\n==== CREATE/UPDATE WORKFLOW ====');

  try {
    // Ensure we have credentials
    if (!session.cookies) {
      await extractCredentials();
    }

    // Generate new IDs if not exists
    if (!session.workflowId || !session.sessionId) {
      session.workflowId = generateWorkflowId();
      session.sessionId = generateSessionId();
    }

    const workflowName = `Whisk Project: ${new Date().toLocaleDateString()}`;

    const payload = {
      json: {
        clientContext: {
          tool: 'BACKBONE',
          sessionId: session.sessionId
        },
        mediaGenerationIdsToCopy: [],
        workflowMetadata: {
          workflowName: workflowName
        }
      }
    };

    log(`Creating workflow: ${workflowName}`);
    log(`Session ID: ${session.sessionId}`);

    const response = await axios.post(
      'https://labs.google/fx/api/trpc/media.createOrUpdateWorkflow',
      payload,
      {
        headers: {
          'Cookie': session.cookies,
          'Content-Type': 'application/json',
          'Origin': 'https://labs.google',
          'Referer': 'https://labs.google/fx/tools/whisk/project',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
      }
    );

    log(`Workflow response status: ${response.status}`);

    // Parse workflow ID từ response
    if (response.data && response.data.result && response.data.result.data) {
      const workflowId = response.data.result.data.json?.result?.workflowId;
      if (workflowId) {
        session.workflowId = workflowId;
        log(`✓ Workflow created: ${session.workflowId}`);
        return { success: true, workflowId: session.workflowId };
      }
    }

    // Nếu không parse được, vẫn dùng UUID local
    log(`⚠ Could not parse workflowId from response, using local: ${session.workflowId}`);
    return { success: true, workflowId: session.workflowId };

  } catch (error) {
    log(`✗ Workflow creation failed: ${error.message}`, 'error');
    if (error.response) {
      log(`API Response: ${JSON.stringify(error.response.data)}`, 'error');
    }
    // Vẫn tiếp tục với UUID local
    return { success: true, workflowId: session.workflowId };
  }
};

// ============================================
// IMAGE GENERATION
// ============================================

const generateImage = async (prompt, options = {}) => {
  log(`\n==== GENERATE IMAGE ====`);
  log(`Prompt: "${prompt}"`);

  try {
    // Ensure we have access token
    if (!session.accessToken || Date.now() - session.lastUpdate > 30 * 60 * 1000) {
      await getAccessToken();
    }

    // BƯỚC QUAN TRỌNG: Tạo workflow qua API trước!
    if (!session.workflowId || !session.sessionId) {
      await createOrUpdateWorkflow();
      log(`✓ Using workflow: ${session.workflowId}`);
      log(`✓ Using session: ${session.sessionId}`);
    }

    const seed = options.seed || Math.floor(Math.random() * 1000000);
    const aspectRatio = options.aspectRatio || 'IMAGE_ASPECT_RATIO_LANDSCAPE';

    const payload = {
      clientContext: {
        workflowId: session.workflowId,
        tool: 'BACKBONE',
        sessionId: session.sessionId
      },
      imageModelSettings: {
        imageModel: 'IMAGEN_3_5',
        aspectRatio: aspectRatio
      },
      seed: seed,
      prompt: prompt,
      mediaCategory: 'MEDIA_CATEGORY_BOARD'
    };

    log('Sending request to Whisk API...');

    const response = await axios.post(
      'https://aisandbox-pa.googleapis.com/v1/whisk:generateImage',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          'Origin': 'https://labs.google',
          'Referer': 'https://labs.google/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 180000
      }
    );

    log(`Response status: ${response.status}`);

    if (response.data) {
      // Debug: Log response structure (not saving to file anymore)
      log(`Response has ${response.data.imagePanels?.length || 0} image panels`);

      // Extract base64 encoded image and generation ID
      const result = extractImageFromResponse(response.data);

      if (result.encodedImage) {
        // Save base64 image directly
        const localUrl = await saveImageFromBase64(result.encodedImage, `gen_${Date.now()}`);

        if (localUrl) {
          // Add to conversation history
          conversationHistory.push({
            type: 'generate',
            prompt: prompt,
            seed: seed,
            generationId: result.generationId,
            imageUrl: localUrl,
            timestamp: Date.now()
          });

          log(`✓ Image generated successfully`);
          return {
            success: true,
            imageUrl: localUrl,
            generationId: result.generationId,
            seed: seed
          };
        }
      }
    }

    throw new Error('No encoded image in response');

  } catch (error) {
    log(`✗ Generation failed: ${error.message}`, 'error');
    if (error.response) {
      log(`API Response status: ${error.response.status}`, 'error');
      log(`API Response data: ${JSON.stringify(error.response.data)}`, 'error');
    }
    log(`Error stack: ${error.stack}`, 'error');
    return { success: false, error: error.message };
  }
};

// ============================================
// IMAGE EDITING (with reference)
// ============================================

const editImage = async (prompt, referenceImagePath, options = {}) => {
  log(`\n==== EDIT IMAGE ====`);
  log(`Prompt: "${prompt}"`);
  log(`Reference: ${referenceImagePath}`);

  try {
    // Ensure we have access token
    if (!session.accessToken || Date.now() - session.lastUpdate > 30 * 60 * 1000) {
      await getAccessToken();
    }

    // Get reference image data
    const imageBuffer = await fs.readFile(path.join(__dirname, referenceImagePath.replace(/^\//, '')));
    const base64Image = imageBuffer.toString('base64');

    // Get generation ID from options or find in conversation history
    let originalGenerationId = options.generationId || null;

    if (!originalGenerationId) {
      // Fallback: find reference in conversation history
      const reference = conversationHistory.find(h => h.imageUrl === referenceImagePath);
      originalGenerationId = reference ? reference.generationId : null;

      if (originalGenerationId) {
        log(`✓ Found generationId from history: ${originalGenerationId.substring(0, 20)}...`);
      } else {
        log(`⚠ No generationId found for reference image`);
      }
    } else {
      log(`✓ Using provided generationId: ${originalGenerationId.substring(0, 20)}...`);
    }

    const aspectRatio = options.aspectRatio || 'IMAGE_ASPECT_RATIO_LANDSCAPE';

    // Build editInput object
    const editInput = {
      caption: prompt,
      userInstruction: prompt,
      originalMediaGenerationId: originalGenerationId,
      mediaInput: {
        mediaCategory: 'MEDIA_CATEGORY_BOARD',
        rawBytes: base64Image
      }
    };

    // Only include seed if provided (API doesn't accept null)
    if (options.seed !== undefined && options.seed !== null) {
      editInput.seed = options.seed;
    }

    // Set safetyMode to valid enum value (API doesn't accept null)
    editInput.safetyMode = 'SAFETY_MODE_UNSPECIFIED';

    const payload = {
      json: {
        clientContext: {
          workflowId: session.workflowId,
          tool: 'BACKBONE',
          sessionId: session.sessionId
        },
        imageModelSettings: {
          imageModel: 'GEM_PIX',
          aspectRatio: aspectRatio
        },
        flags: {},
        editInput: editInput
      }
    };

    log('Sending edit request to Whisk API...');

    const response = await axios.post(
      'https://labs.google/fx/api/trpc/backbone.editImage',
      payload,
      {
        headers: {
          'Cookie': session.cookies,
          'Content-Type': 'application/json',
          'Origin': 'https://labs.google',
          'Referer': 'https://labs.google/fx/tools/whisk/project',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 180000
      }
    );

    log(`Response status: ${response.status}`);

    if (response.data) {
      // Debug: Log response structure (not saving to file anymore)
      log(`Edit response received successfully`);

      // Extract base64 encoded image and generation ID
      const result = extractImageFromResponse(response.data);

      if (result.encodedImage) {
        // Save base64 image directly
        const localUrl = await saveImageFromBase64(result.encodedImage, `edit_${Date.now()}`);

        if (localUrl) {
          // Add to conversation history
          conversationHistory.push({
            type: 'edit',
            prompt: prompt,
            referenceImagePath: referenceImagePath,
            generationId: result.generationId,
            imageUrl: localUrl,
            timestamp: Date.now()
          });

          log(`✓ Image edited successfully`);
          return {
            success: true,
            imageUrl: localUrl,
            generationId: result.generationId
          };
        }
      }
    }

    throw new Error('No encoded image in response');

  } catch (error) {
    log(`✗ Edit failed: ${error.message}`, 'error');
    if (error.response) {
      log(`API Response status: ${error.response.status}`, 'error');
      log(`API Response data: ${JSON.stringify(error.response.data)}`, 'error');
    }
    log(`Error stack: ${error.stack}`, 'error');
    return { success: false, error: error.message };
  }
};

// ============================================
// IMAGE PROCESSING
// ============================================

function extractImageFromResponse(data) {
  // Extract image and generation ID from response
  // Response structure: { imagePanels: [{ generatedImages: [{ encodedImage: "base64..." }] }] }

  let encodedImage = null;
  let generationId = null;

  try {
    // Method 1: Parse structured response (generateImage API)
    if (data.imagePanels && data.imagePanels.length > 0) {
      const panel = data.imagePanels[0];
      if (panel.generatedImages && panel.generatedImages.length > 0) {
        encodedImage = panel.generatedImages[0].encodedImage;
        log(`✓ Found encodedImage in imagePanels (length: ${encodedImage ? encodedImage.length : 0})`);
      }
    }

    // Method 2: Parse from editImage response (có thể khác structure)
    if (!encodedImage && data.result && data.result.data) {
      const resultData = data.result.data;
      if (resultData.json && resultData.json.result) {
        const result = resultData.json.result;
        if (result.imagePanels && result.imagePanels.length > 0) {
          const panel = result.imagePanels[0];
          if (panel.generatedImages && panel.generatedImages.length > 0) {
            encodedImage = panel.generatedImages[0].encodedImage;
            log(`✓ Found encodedImage in result.imagePanels (length: ${encodedImage ? encodedImage.length : 0})`);
          }
        }
      }
    }

    // Extract generation ID from various places
    const jsonStr = JSON.stringify(data);

    // Try different patterns
    const genIdMatch = jsonStr.match(/"mediaGenerationId":"([^"]+)"/);
    if (genIdMatch) {
      generationId = genIdMatch[1];
    }

    // Alternative pattern
    if (!generationId) {
      const altMatch = jsonStr.match(/"generationId":"([^"]+)"/);
      if (altMatch) {
        generationId = altMatch[1];
      }
    }

    log(`Extracted encodedImage: ${encodedImage ? 'YES (' + encodedImage.length + ' chars)' : 'NOT FOUND'}`);
    log(`Generation ID: ${generationId || 'NOT FOUND'}`);

  } catch (error) {
    log(`Error extracting from response: ${error.message}`);
  }

  return { encodedImage, generationId };
}

async function saveImageFromBase64(encodedImage, prefix = 'img') {
  log(`Saving base64 encoded image...`);

  try {
    const filename = `${prefix}_${Date.now()}.jpg`;
    const filepath = path.join(IMAGE_DIR, filename);

    // Decode base64 to buffer
    const imageBuffer = Buffer.from(encodedImage, 'base64');

    await fs.writeFile(filepath, imageBuffer);
    log(`✓ Image saved: ${filename} (${imageBuffer.length} bytes)`);

    return `/images/${filename}`;

  } catch (error) {
    log(`✗ Save failed: ${error.message}`);
    return null;
  }
}

async function downloadImage(imageUrl, prefix = 'img') {
  log(`Downloading image: ${imageUrl.substring(0, 80)}...`);

  try {
    const filename = `${prefix}_${Date.now()}.jpg`;
    const filepath = path.join(IMAGE_DIR, filename);

    // If it's a blob URL, we need to use Puppeteer to capture it
    if (imageUrl.startsWith('blob:')) {
      return await downloadBlobImage(imageUrl, filepath);
    }

    // Otherwise, download directly
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://labs.google/'
      },
      timeout: 60000
    });

    await fs.writeFile(filepath, response.data);
    log(`✓ Image saved: ${filename}`);

    return `/images/${filename}`;

  } catch (error) {
    log(`✗ Download failed: ${error.message}`);
    return null;
  }
}

async function downloadBlobImage(blobUrl, filepath) {
  log('Downloading blob image via Puppeteer...');

  try {
    if (!session.page) {
      throw new Error('No page reference');
    }

    // Use page.evaluate to fetch blob and convert to base64
    const base64Data = await session.page.evaluate(async (url) => {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, blobUrl);

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(filepath, buffer);

    const filename = path.basename(filepath);
    log(`✓ Blob image saved: ${filename}`);

    return `/images/${filename}`;

  } catch (error) {
    log(`✗ Blob download failed: ${error.message}`);
    return null;
  }
}

// ============================================
// INITIALIZE
// ============================================

(async () => {
  log('Starting Whisk AI Server...');

  await fs.mkdir(IMAGE_DIR, { recursive: true });
  await fs.mkdir(ASSET_DIR, { recursive: true });
  await fs.mkdir(PROJECT_DIR, { recursive: true });

  log('✓ Server ready: http://localhost:3002\n');
  log('📌 Next steps:');
  log('   1. Open http://localhost:3002 in your browser');
  log('   2. Click "🚀 Khởi động Chrome" button');
  log('   3. Log in to Google if needed, then click "Bắt Token"\n');
})();

// ============================================
// CHROME LAUNCHER
// ============================================

async function launchChrome() {
  log('🚀 Launching Chrome with Puppeteer...');

  try {
    // Close existing browser if any
    if (session.browser) {
      try {
        await session.browser.close();
      } catch (e) {
        // Ignore errors
      }
      session.browser = null;
      session.page = null;
      session.chromeReady = false;
    }

    // Launch Chrome in headful mode with persistent profile
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      userDataDir: CHROME_PROFILE_DIR,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    session.browser = browser;
    log('✓ Chrome launched');

    // Open new page
    const page = await browser.newPage();
    session.page = page;

    // Navigate to Whisk
    log('📍 Navigating to Whisk...');
    await page.goto('https://labs.google/fx/tools/whisk/project', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    log('✓ Page loaded');

    // Wait a bit for any dynamic content
    await page.waitForTimeout(3000);

    // Try to extract credentials
    log('🔑 Extracting credentials...');

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const sessionCookie = cookies.find(c => c.name === '__Secure-next-auth.session-token');
    if (sessionCookie) {
      session.sessionToken = sessionCookie.value;
      session.cookies = cookieString;
      log('✓ Session token found');
    }

    // Try to get access token
    try {
      await getAccessToken();
      session.chromeReady = true;
      log('✅ Chrome ready! You can now generate images.');
      return { success: true, message: 'Chrome launched and ready' };
    } catch (error) {
      log('⚠ Could not get access token yet. Please log in to Google if needed.');
      session.chromeReady = false;
      return {
        success: true,
        message: 'Chrome launched. Please log in to Google, then click "Bắt Token" button.',
        needsLogin: true
      };
    }

  } catch (error) {
    log(`✗ Failed to launch Chrome: ${error.message}`);
    throw error;
  }
}

async function captureToken() {
  log('🔑 Capturing token from current page...');

  try {
    if (!session.page) {
      throw new Error('No Chrome page available. Please launch Chrome first.');
    }

    // Extract credentials
    const cookies = await session.page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const sessionCookie = cookies.find(c => c.name === '__Secure-next-auth.session-token');
    if (sessionCookie) {
      session.sessionToken = sessionCookie.value;
    }

    session.cookies = cookieString;
    log('✓ Credentials extracted');

    // Get access token
    await getAccessToken();
    session.chromeReady = true;

    log('✅ Token captured! System is ready.');
    return { success: true, message: 'Token captured successfully' };

  } catch (error) {
    log(`✗ Failed to capture token: ${error.message}`);
    throw error;
  }
}

// ============================================
// API ENDPOINTS
// ============================================

app.post('/api/launch-chrome', async (req, res) => {
  try {
    const result = await launchChrome();
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/capture-token', async (req, res) => {
  try {
    const result = await captureToken();
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/chrome-status', async (req, res) => {
  res.json({
    success: true,
    chromeReady: session.chromeReady,
    hasPage: !!session.page,
    hasBrowser: !!session.browser,
    hasToken: !!session.accessToken
  });
});

app.post('/api/generate', async (req, res) => {
  const { prompt, aspectRatio, seed } = req.body;

  if (!prompt) {
    return res.json({ success: false, error: 'Prompt is required' });
  }

  const result = await generateImage(prompt, { aspectRatio, seed });
  res.json(result);
});

app.post('/api/edit', async (req, res) => {
  const { prompt, referenceImage, aspectRatio, generationId, seed } = req.body;

  if (!prompt || !referenceImage) {
    return res.json({ success: false, error: 'Prompt and reference image are required' });
  }

  const result = await editImage(prompt, referenceImage, { aspectRatio, generationId, seed });
  res.json(result);
});

app.get('/api/session', async (req, res) => {
  try {
    await getAccessToken();
    res.json({
      success: true,
      hasToken: !!session.accessToken,
      workflowId: session.workflowId,
      sessionId: session.sessionId,
      conversationLength: conversationHistory.length
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/history', async (req, res) => {
  res.json({
    success: true,
    history: conversationHistory
  });
});

app.post('/api/reset', async (req, res) => {
  session.workflowId = generateWorkflowId();
  session.sessionId = generateSessionId();
  conversationHistory = [];

  log('✓ Session reset');

  res.json({
    success: true,
    message: 'Session reset successfully',
    workflowId: session.workflowId
  });
});

app.post('/api/save-asset', async (req, res) => {
  try {
    const { name, imageUrl } = req.body;
    const sourcePath = path.join(__dirname, imageUrl.replace(/^\//, ''));
    const filename = `asset_${Date.now()}_${name.replace(/[^a-z0-9]/gi, '_')}.jpg`;
    const destPath = path.join(ASSET_DIR, filename);
    await fs.copyFile(sourcePath, destPath);
    res.json({ success: true, asset: { name, url: `/assets/${filename}` }});
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/save-project', async (req, res) => {
  try {
    const { name, data } = req.body;
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    await fs.writeFile(path.join(PROJECT_DIR, filename), JSON.stringify(data, null, 2));
    res.json({ success: true, filename });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/projects', async (req, res) => {
  try {
    const files = await fs.readdir(PROJECT_DIR);
    res.json({ success: true, projects: files.filter(f => f.endsWith('.json')) });
  } catch (err) {
    res.json({ success: false, projects: [] });
  }
});

app.get('/api/project/:filename', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(PROJECT_DIR, req.params.filename), 'utf-8');
    res.json({ success: true, data: JSON.parse(data) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const since = parseInt(req.query.since) || 0;

    // Filter logs since timestamp
    let filtered = serverLogs.filter(log => log.timestamp > since);

    // Return latest logs
    const logs = filtered.slice(-limit);

    res.json({
      success: true,
      logs: logs,
      count: logs.length,
      totalCount: serverLogs.length
    });
  } catch (err) {
    res.json({ success: false, error: err.message, logs: [] });
  }
});

app.post('/api/logs/clear', async (req, res) => {
  try {
    serverLogs = [];
    log('Logs cleared by user');
    res.json({ success: true, message: 'Logs cleared' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============================================
// VEO3 VIDEO GENERATION ENDPOINTS
// ============================================

// Veo3 state - manual projectId và sceneId (ngon.js approach)
let veo3Session = {
  projectId: null,
  sceneId: null,
  createdAt: null,
  manualProjectId: null, // User set qua API
  manualSceneId: null // User set qua API
};

// Set manual project ID and scene ID (theo cách ngon.js)
app.post('/api/veo3/set-project', async (req, res) => {
  try {
    const { projectId, sceneId } = req.body;

    if (!projectId) {
      return res.json({ success: false, error: 'No projectId provided' });
    }

    if (!sceneId) {
      return res.json({ success: false, error: 'No sceneId provided. Both projectId and sceneId are required!' });
    }

    veo3Session.projectId = projectId;
    veo3Session.sceneId = sceneId;
    veo3Session.manualProjectId = projectId;
    veo3Session.manualSceneId = sceneId;
    veo3Session.createdAt = Date.now();

    log(`✓ Manual project ID set: ${projectId}`);
    log(`✓ Manual scene ID set: ${sceneId}`);
    res.json({
      success: true,
      projectId,
      sceneId,
      message: 'Manual project ID and scene ID set successfully'
    });
  } catch (err) {
    log(`✗ Set project/scene failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Get current Veo3 session (projectId & sceneId)
app.get('/api/veo3/get-session', (req, res) => {
  try {
    if (veo3Session.projectId && veo3Session.sceneId) {
      res.json({
        success: true,
        projectId: veo3Session.projectId,
        sceneId: veo3Session.sceneId,
        createdAt: veo3Session.createdAt
      });
    } else {
      res.json({
        success: false,
        message: 'No project/scene set. Please set manually first.'
      });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Create Veo3 project (tự động - KHÔNG DÙNG)
app.post('/api/veo3/create-project', async (req, res) => {
  try {
    // Nếu đã có manual project, dùng luôn
    if (veo3Session.manualProjectId) {
      log(`Using existing manual project: ${veo3Session.manualProjectId}`);
      return res.json({ success: true, projectId: veo3Session.manualProjectId, manual: true });
    }

    log('Creating Veo3 project...');

    const token = await getAccessToken();

    // Try standard TRPC format
    const response = await axios.post(
      'https://labs.google/fx/api/trpc/project.create',
      { json: { toolName: 'PINHOLE' } },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/vi/tools/flow',
          'Origin': 'https://labs.google/fx'
        },
        timeout: 30000
      }
    );

    const projectId = response.data.result.data.json.projectId;
    veo3Session.projectId = projectId;
    veo3Session.createdAt = Date.now();

    log(`✓ Veo3 project created: ${projectId}`);
    res.json({ success: true, projectId });
  } catch (err) {
    log(`✗ Create project failed: ${err.message}`, 'error');
    if (err.response?.data) {
      log(`Error response: ${JSON.stringify(err.response.data)}`);
    }

    // Gợi ý workaround
    const errorMsg = `Cannot auto-create project. Please create manually at https://labs.google/fx/tools/flow and use /api/veo3/set-project`;

    res.json({
      success: false,
      error: err.message,
      details: err.response?.data,
      workaround: errorMsg
    });
  }
});

// Create Veo3 scene
app.post('/api/veo3/create-scene', async (req, res) => {
  try {
    const { projectId } = req.body;
    const useProjectId = projectId || veo3Session.projectId;

    if (!useProjectId) {
      return res.json({ success: false, error: 'No project ID' });
    }

    log(`Creating Veo3 scene in project ${useProjectId}...`);

    const token = await getAccessToken();
    const response = await axios.post(
      'https://labs.google/fx/api/trpc/project.createScene',
      { json: { projectId: useProjectId, toolName: 'PINHOLE' } },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/vi/tools/flow',
          'Origin': 'https://labs.google/fx'
        }
      }
    );

    const sceneId = response.data.result.data.json.sceneId;
    veo3Session.sceneId = sceneId;

    log(`✓ Veo3 scene created: ${sceneId}`);
    res.json({ success: true, sceneId, projectId: useProjectId });
  } catch (err) {
    log(`✗ Create scene failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Upload image for Veo3
app.post('/api/veo3/upload-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.json({ success: false, error: 'No image provided' });
    }

    log('Uploading image to Veo3...');

    const token = await getAccessToken();
    const response = await axios.post(
      'https://labs.google/fx/api/trpc/media.uploadImage',
      { json: { userUploadedImage: { image: imageBase64 } } },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/vi/tools/flow',
          'Origin': 'https://labs.google/fx'
        }
      }
    );

    const mediaKey = response.data.result.data.json.mediaGenerationId.mediaKey;

    log(`✓ Image uploaded: ${mediaKey.substring(0, 20)}...`);
    res.json({ success: true, mediaKey });
  } catch (err) {
    log(`✗ Upload image failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Generate Veo3 video
app.post('/api/veo3/generate', async (req, res) => {
  try {
    const {
      prompt,
      startImageKey,
      endImageKey,
      modelKey,
      aspectRatio,
      lengthSeconds,
      projectId,
      sceneId
    } = req.body;

    const useProjectId = projectId || veo3Session.projectId;
    const useSceneId = sceneId || veo3Session.sceneId;

    if (!useProjectId || !useSceneId) {
      return res.json({ success: false, error: 'Missing project or scene ID' });
    }

    log(`Generating Veo3 video: "${prompt.substring(0, 50)}..."`);

    const payload = {
      modelKey: modelKey || 'veo_3_1_i2v_s_fast_ultra_fl',
      prompt,
      startImageKey,
      aspectRatio: aspectRatio || 'VIDEO_ASPECT_RATIO_LANDSCAPE',
      lengthSeconds: lengthSeconds || 8,
      fps: 24,
      projectId: useProjectId,
      sceneId: useSceneId
    };

    if (endImageKey) {
      payload.endImageKey = endImageKey;
    }

    const token = await getAccessToken();
    const response = await axios.post(
      'https://labs.google/fx/api/trpc/video.generate',
      { json: payload },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/vi/tools/flow',
          'Origin': 'https://labs.google/fx'
        }
      }
    );

    const mediaGenerationId = response.data.result.data.json.mediaGenerationId;

    log(`✓ Video generation started: ${mediaGenerationId.mediaKey.substring(0, 20)}...`);
    res.json({ success: true, mediaGenerationId });
  } catch (err) {
    log(`✗ Generate video failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Get Veo3 generation status
app.post('/api/veo3/status', async (req, res) => {
  try {
    const { mediaGenerationId } = req.body;

    if (!mediaGenerationId) {
      return res.json({ success: false, error: 'No mediaGenerationId' });
    }

    const token = await getAccessToken();
    const response = await axios.post(
      'https://labs.google/fx/api/trpc/video.getGenerationStatus',
      { json: { mediaGenerationId } },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/vi/tools/flow',
          'Origin': 'https://labs.google/fx'
        }
      }
    );

    const status = response.data.result.data.json;
    res.json({ success: true, status });
  } catch (err) {
    log(`✗ Get status failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Save Veo3 video variants
app.post('/api/veo3/save-variants', async (req, res) => {
  try {
    const { variants, baseFilename } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return res.json({ success: false, error: 'No variants provided' });
    }

    const VIDEO_DIR = path.join(__dirname, 'videos');
    await fs.mkdir(VIDEO_DIR, { recursive: true });

    const savedVideos = [];

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (!variant.videoBase64) continue;

      const filename = `${baseFilename}_v${i + 1}.mp4`;
      const filepath = path.join(VIDEO_DIR, filename);

      const buffer = Buffer.from(variant.videoBase64, 'base64');
      await fs.writeFile(filepath, buffer);

      log(`✓ Saved video: ${filename}`);

      savedVideos.push({
        filename,
        url: `/videos/${filename}`,
        index: i
      });
    }

    res.json({ success: true, videos: savedVideos });
  } catch (err) {
    log(`✗ Save variants failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// ============================================
// VEO3 NEW ENDPOINTS - THEO ĐÚNG FLOW THỰC TẾ
// ============================================

// Submit batch log (PINHOLE_UPLOAD_IMAGE_TO_CROP, PINHOLE_RESIZE_IMAGE)
app.post('/api/veo3/submit-batch-log', async (req, res) => {
  try {
    const { event, sessionId, properties, aspectRatio } = req.body;

    log(`Veo3 Event: ${event}`);

    const token = await getAccessToken();

    // Build event payload
    const eventProperties = [
      { key: 'TOOL_NAME', stringValue: 'PINHOLE' },
      { key: 'G1_PAYGATE_TIER', stringValue: 'PAYGATE_TIER_TWO' },
      { key: 'PINHOLE_PROMPT_BOX_MODE', stringValue: 'IMAGE_TO_VIDEO' },
      { key: 'USER_AGENT', stringValue: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      { key: 'IS_DESKTOP' }
    ];

    if (properties?.width) {
      eventProperties.push({ key: 'PINHOLE_UPLOAD_IMAGE_TO_CROP_WIDTH', doubleValue: properties.width });
      eventProperties.push({ key: 'PINHOLE_UPLOAD_IMAGE_TO_CROP_HEIGHT', doubleValue: properties.height });
    }

    if (aspectRatio) {
      eventProperties.push({ key: 'PINHOLE_IMAGE_ASPECT_RATIO', stringValue: aspectRatio });
    }

    const response = await axios.post(
      'https://labs.google/fx/api/trpc/general.submitBatchLog',
      {
        json: {
          appEvents: [{
            event,
            eventMetadata: { sessionId },
            eventProperties,
            activeExperiments: [],
            eventTime: new Date().toISOString()
          }]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/tools/flow',
          'Origin': 'https://labs.google'
        }
      }
    );

    log(`✓ Event ${event} sent`);
    res.json({ success: true });
  } catch (err) {
    log(`✗ Submit batch log failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Upload cropped image và lấy mediaId
app.post('/api/veo3/upload-cropped-image', async (req, res) => {
  try {
    const { imageBase64, sessionId, aspectRatio } = req.body;

    log('Uploading cropped image to Veo3...');

    const token = await getAccessToken();

    // Upload image qua media.uploadImage
    const uploadResponse = await axios.post(
      'https://labs.google/fx/api/trpc/media.uploadImage',
      {
        json: {
          userUploadedImage: { image: imageBase64 }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/tools/flow',
          'Origin': 'https://labs.google'
        }
      }
    );

    const mediaGenerationId = uploadResponse.data.result.data.json.mediaGenerationId;
    const mediaId = mediaGenerationId.mediaKey;

    log(`✓ Image uploaded: ${mediaId.substring(0, 30)}...`);

    // Submit PINHOLE_CROP_IMAGE event
    await axios.post(
      'https://labs.google/fx/api/trpc/general.submitBatchLog',
      {
        json: {
          appEvents: [{
            event: 'PINHOLE_CROP_IMAGE',
            eventMetadata: {
              mediaGenerationId: mediaId,
              sessionId
            },
            eventProperties: [
              { key: 'TOOL_NAME', stringValue: 'PINHOLE' },
              { key: 'PINHOLE_IMAGE_ASPECT_RATIO', stringValue: aspectRatio },
              { key: 'G1_PAYGATE_TIER', stringValue: 'PAYGATE_TIER_TWO' },
              { key: 'PINHOLE_PROMPT_BOX_MODE', stringValue: 'IMAGE_TO_VIDEO' },
              { key: 'USER_AGENT', stringValue: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              { key: 'IS_DESKTOP' }
            ],
            activeExperiments: [],
            eventTime: new Date().toISOString()
          }]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Referer': 'https://labs.google/fx/tools/flow',
          'Origin': 'https://labs.google'
        }
      }
    );

    res.json({ success: true, mediaId });
  } catch (err) {
    log(`✗ Upload cropped image failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Generate video from 2 images (start + end)
app.post('/api/veo3/generate-start-end', async (req, res) => {
  try {
    const { projectId, sceneId, startImageMediaId, endImageMediaId, prompt, aspectRatio } = req.body;

    log(`Generating video: "${prompt.substring(0, 50)}..."`);

    const token = await getAccessToken();

    // Generate 2 variants với seeds khác nhau
    const seed1 = Math.floor(Math.random() * 65536);
    const seed2 = Math.floor(Math.random() * 65536);

    const response = await axios.post(
      'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartAndEndImage',
      {
        clientContext: {
          projectId,
          tool: 'PINHOLE',
          userPaygateTier: 'PAYGATE_TIER_TWO'
        },
        requests: [
          {
            aspectRatio,
            seed: seed1,
            textInput: { prompt },
            videoModelKey: 'veo_3_1_i2v_s_fast_ultra_fl',
            startImage: { mediaId: startImageMediaId },
            endImage: { mediaId: endImageMediaId },
            metadata: { sceneId }
          },
          {
            aspectRatio,
            seed: seed2,
            textInput: { prompt },
            videoModelKey: 'veo_3_1_i2v_s_fast_ultra_fl',
            startImage: { mediaId: startImageMediaId },
            endImage: { mediaId: endImageMediaId },
            metadata: { sceneId }
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          'Referer': 'https://labs.google/',
          'x-browser-channel': 'stable',
          'x-browser-year': '2025',
          'x-client-data': 'CIyIywE='
        }
      }
    );

    const operations = response.data.operations.map(op => ({
      operation: { name: op.operation.name },
      sceneId: op.sceneId,
      status: op.status
    }));

    log(`✓ Video generation started! ${operations.length} variants`);
    res.json({ success: true, operations });
  } catch (err) {
    log(`✗ Generate video failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Extend video (từ ngon.js)
app.post('/api/veo3/extend-video', async (req, res) => {
  try {
    const { projectId, sceneId, sourceMediaId, prompt, aspectRatio } = req.body;

    log(`Extending video: "${prompt.substring(0, 50)}..."`);

    const token = await getAccessToken();
    const seed = Math.floor(Math.random() * 65536);

    const response = await axios.post(
      'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoExtendVideo',
      {
        clientContext: {
          projectId,
          tool: 'PINHOLE',
          userPaygateTier: 'PAYGATE_TIER_TWO'
        },
        requests: [{
          textInput: { prompt },
          videoInput: {
            mediaId: sourceMediaId,
            startFrameIndex: 168,
            endFrameIndex: 191
          },
          videoModelKey: 'veo_3_1_extend_fast_landscape_ultra',
          aspectRatio,
          seed,
          metadata: { sceneId }
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          'Referer': 'https://labs.google/',
          'x-browser-channel': 'stable',
          'x-browser-year': '2025',
          'x-client-data': 'CIyIywE='
        }
      }
    );

    const operation = {
      operation: { name: response.data.operations[0].operation.name },
      sceneId: response.data.operations[0].sceneId,
      status: response.data.operations[0].status
    };

    log(`✓ Extend started!`);
    res.json({ success: true, operation });
  } catch (err) {
    log(`✗ Extend video failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Check video generation status
app.post('/api/veo3/check-status', async (req, res) => {
  try {
    const { operations } = req.body;

    const token = await getAccessToken();

    const response = await axios.post(
      'https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus',
      { operations },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          'Referer': 'https://labs.google/',
          'x-browser-channel': 'stable',
          'x-browser-year': '2025',
          'x-client-data': 'CIyIywE='
        }
      }
    );

    res.json({ success: true, operations: response.data.operations });
  } catch (err) {
    log(`✗ Check status failed: ${err.message}`, 'error');
    res.json({ success: false, error: err.message });
  }
});

// Serve videos
app.use('/videos', express.static(path.join(__dirname, 'videos')));

app.listen(3002, () => {
  log('Server listening on http://localhost:3002');
  log('Open: http://localhost:3002/index2.html\n');
});
