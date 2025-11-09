# 🎨 Whisk AI - Image Generation & Editing

## 📝 Overview

Full implementation of Google Whisk AI with proper API integration:
- ✅ **Generate** images using IMAGEN 3.5
- ✅ **Edit** images with reference using GEM PIX
- ✅ Maintain conversation context across requests
- ✅ Beautiful UI optimized for 16:9 displays
- ✅ Full OAuth authentication flow
- ✅ Blob URL handling for images

## 🚀 Quick Start

### Method 1: Using Runner (Recommended)

```bash
# Install dependencies (first time only)
npm install

# Start application
npm start
```

Or run directly:
```bash
node runner.js
```

### Method 2: Manual Start

**Windows:**
```bash
run.bat
```

**Linux/Mac:**
```bash
node server.js
```

### Steps After Starting

1. Server will start on: **http://localhost:3002**
2. Open in browser: **http://localhost:3002/index.html**
3. Click **"🚀 Khởi động Chrome"** to launch browser
4. Login to Google account if needed
5. Click **"Bắt Token"** to capture credentials
6. Start generating images!

---

## 🎨 Features

### **Image Generation**
- Generate new images from text prompts
- Uses **IMAGEN 3.5** model
- Support Landscape (16:9), Portrait (9:16), Square (1:1)
- Optional seed for reproducible results

### **Image Editing**
- Edit existing images using prompts
- Uses **GEM PIX** model
- Reference any generated image
- Maintains generation context

### **UI Features**
- 🖥️ Optimized for 16:9 displays
- 📊 Real-time status monitoring
- 🖼️ Image gallery with preview
- 🔄 Quick reference selection
- 💾 Asset saving
- 📋 Session management

---

## 📡 API Endpoints

### `POST /api/generate`

Generate a new image.

**Request:**
```json
{
  "prompt": "modern city at night",
  "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE",
  "seed": 123456
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "/images/gen_1234567890.jpg",
  "generationId": "CAMaJDI2...",
  "seed": 123456
}
```

### `POST /api/edit`

Edit an image using a reference.

**Request:**
```json
{
  "prompt": "make it darker and rainy",
  "referenceImage": "/images/gen_1234567890.jpg",
  "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE"
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "/images/edit_1234567891.jpg",
  "generationId": "CAMaJDI2..."
}
```

### Other Endpoints

- `GET /api/session` - Check session status
- `GET /api/history` - Get conversation history
- `POST /api/reset` - Reset session (new workflow)
- `POST /api/save-asset` - Save image as asset
- `GET /api/projects` - List saved projects
- `POST /api/save-project` - Save project data

---

## 🔑 Technical Details

### Authentication Flow

1. Extract credentials from Chrome (cookies, session token)
2. Get access token from `https://labs.google/fx/api/auth/session`
3. Use Bearer token for API requests

### Generation API

```
POST https://aisandbox-pa.googleapis.com/v1/whisk:generateImage
Authorization: Bearer {access_token}

Payload:
{
  "clientContext": {
    "workflowId": "uuid",
    "tool": "BACKBONE",
    "sessionId": ";timestamp"
  },
  "imageModelSettings": {
    "imageModel": "IMAGEN_3_5",
    "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE"
  },
  "seed": 123456,
  "prompt": "...",
  "mediaCategory": "MEDIA_CATEGORY_BOARD"
}
```

### Edit API

```
POST https://labs.google/fx/api/trpc/backbone.editImage

Payload:
{
  "json": {
    "clientContext": { ... },
    "imageModelSettings": {
      "imageModel": "GEM_PIX"
    },
    "editInput": {
      "caption": "...",
      "userInstruction": "...",
      "originalMediaGenerationId": "...",
      "mediaInput": {
        "mediaCategory": "MEDIA_CATEGORY_BOARD",
        "rawBytes": "base64_image"
      }
    }
  }
}
```

---

## 🎯 Workflow

### Basic Generation

1. User enters prompt
2. Server generates WorkflowId and SessionId
3. Server gets access token
4. Server calls `/whisk:generateImage`
5. Server extracts image URL (blob or direct)
6. Server downloads image (with Puppeteer for blob URLs)
7. Image added to gallery

### Editing with Reference

1. User selects reference image
2. User enters edit instructions
3. Server reads and encodes image to base64
4. Server calls `/backbone.editImage` with reference
5. Server downloads edited image
6. Image added to gallery with edit badge

---

## 🐛 Troubleshooting

### ❌ "No access token in response"
- ✅ Make sure you're logged in to Whisk
- ✅ Refresh the Whisk page
- ✅ Check cookies are being captured

### ❌ "Whisk page not found"
- ✅ Chrome must run with remote debugging
- ✅ Check `http://localhost:9222`
- ✅ Open Whisk page manually

### ❌ Images not downloading
- ✅ Check console logs for errors
- ✅ Response files saved to `response_*.json`
- ✅ Blob URLs require Puppeteer page reference

### ❌ "Generation failed"
- ✅ Access token may be expired (refreshes after 30min)
- ✅ Check Whisk page is still open
- ✅ Try resetting session

---

## 📂 File Structure

```
WHISK/
├── runner.js              # Unified application launcher (NEW!)
├── server.js              # Main server with full API
├── index.html             # UI (16:9 optimized)
├── run.bat                # Quick start (Windows)
├── package.json           # Dependencies
├── README.md              # Documentation
├── images/                # Generated images
├── assets/                # Saved assets
└── projects/              # Saved projects
```

---

## 🔧 Development

### Debug Mode
```bash
node --inspect server.js
```

### Response Debugging
All API responses saved to `response_*.json` and `edit_response_*.json`.

### Running with npm
```bash
npm start     # Start the server
npm run dev   # Development mode (same as start)
```

---

## 📝 Important Notes

- **WorkflowId**: UUID that groups related generations
- **SessionId**: Format `;{timestamp}`
- **Generation ID**: Used to reference images for editing
- **Models**: IMAGEN_3_5 (generate) | GEM PIX (edit)
- **Aspect Ratios**:
  - `IMAGE_ASPECT_RATIO_LANDSCAPE` (16:9)
  - `IMAGE_ASPECT_RATIO_PORTRAIT` (9:16)
  - `IMAGE_ASPECT_RATIO_SQUARE` (1:1)

---

## 🎉 Credits

Based on reverse-engineered Google Whisk API (labs.google.com)

Developed with ❤️ using Node.js, Express, Puppeteer, and Axios.
