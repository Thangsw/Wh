// veo3-flow-auto-full.js
// TỰ ĐỘNG: Tạo project → Tạo scene → Upload 2 ảnh → Gen chuyển cảnh → Extend → Tải về .mp4

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==================== CẤU HÌNH ====================
const CONFIG = {
  BASE_URL: 'https://labs.google/fx/api',
  ACCESS_TOKEN: 'ya29.a0ATi6K2sz-xbF2SzfzhTZAeTQU30bYGg7mDU3R3yscj0-_vQ6W4Ig2FMpAB-lIBi9xS_KAq-O_kzM_C_3QC5ezfvCEO2lNlxN4xLHq9vi0-Rng7fGCVNbkzwNUa4vZmQSUH8449tVjGa0XbrReXZ5PDuDyTz_QkHbGuOM1r5Wtpv6P4lm2_9CMhMcOvsqlH0zDw-D4A3Si85dFL37aw-oGeSATBCu4jGxQBDjqmJAGvP2-tR_Ex8srU30Kz2I5jBN8k98i3qKE_T4bvF4KoEhe_uQaK_wwBdjFrUS2WElHknas1_FqnwYyvQF-1ef9P-UfyGWfOWD086g3I98QZmJ32cx0jI02KJCXzfK0bII0gaCgYKAXYSARYSFQHGX2MizqC4yC6FDS5kpduEEEkhzQ0369', // Thay bằng token của bạn
  OUTPUT_DIR: './veo3_output',
  POLL_INTERVAL: 3000, // 3s
  START_IMAGE_PATH: './images/start.jpg',   // Thay bằng ảnh thật
  END_IMAGE_PATH: './images/end.jpg',       // Thay bằng ảnh thật
};

if (!fs.existsSync(CONFIG.OUTPUT_DIR)) fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });

// Headers chung
const headers = {
  'Authorization': `Bearer ${CONFIG.ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Referer': 'https://labs.google/fx/vi/tools/flow',
  'Origin': 'https://labs.google/fx'
};

// ==================== HÀM HỖ TRỢ ====================

// Tạo project mới → trả projectId
async function createProject() {
  const res = await axios.post(`${CONFIG.BASE_URL}/trpc/project.create`, {
    json: { toolName: 'PINHOLE' }
  }, { headers });
  const projectId = res.data.result.data.json.projectId;
  console.log(`Project created: ${projectId}`);
  return projectId;
}

// Tạo scene mới trong project → trả sceneId
async function createScene(projectId) {
  const res = await axios.post(`${CONFIG.BASE_URL}/trpc/project.createScene`, {
    json: { projectId, toolName: 'PINHOLE' }
  }, { headers });
  const sceneId = res.data.result.data.json.sceneId;
  console.log(`Scene created: ${sceneId}`);
  return sceneId;
}

// Upload ảnh → trả mediaKey
async function uploadImage(imagePath) {
  const imageBase64 = fs.readFileSync(imagePath, 'base64');
  const payload = { json: { userUploadedImage: { image: imageBase64 } } };
  const res = await axios.post(`${CONFIG.BASE_URL}/trpc/media.uploadImage`, payload, { headers });
  const mediaKey = res.data.result.data.json.mediaGenerationId.mediaKey;
  console.log(`Uploaded: ${path.basename(imagePath)} → ${mediaKey}`);
  return mediaKey;
}

// Gọi generate video
async function generateVideo(payload) {
  const res = await axios.post(`${CONFIG.BASE_URL}/trpc/video.generate`, { json: payload }, { headers });
  const result = res.data.result.data.json;
  console.log(`Generate started: ${result.mediaGenerationId.mediaKey}`);
  return result.mediaGenerationId;
}

// Polling trạng thái
async function waitForCompletion(mediaGenerationId) {
  while (true) {
    await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
    try {
      const res = await axios.post(`${CONFIG.BASE_URL}/trpc/video.getGenerationStatus`, {
        json: { mediaGenerationId }
      }, { headers });
      const status = res.data.result.data.json;
      if (status.status === 'RUNNING') {
        console.log(`Generating... ${(status.progress * 100).toFixed(1)}%`);
        continue;
      }
      if (status.status === 'COMPLETED') {
        console.log(`COMPLETED!`);
        return status;
      }
      if (status.status === 'FAILED') {
        throw new Error(`Gen failed: ${status.errorMessage}`);
      }
    } catch (err) {
      console.error('Polling error:', err.message);
    }
  }
}

// Lưu video
function saveVideo(base64, filename) {
  const buffer = Buffer.from(base64, 'base64');
  const outputPath = path.join(CONFIG.OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Saved: ${outputPath}`);
  return outputPath;
}

// ==================== CHƯƠNG TRÌNH CHÍNH ====================
(async () => {
  try {
    console.log('BẮT ĐẦU TỰ ĐỘNG TẠO PROJECT → SCENE → VIDEO → EXTEND...\n');

    // BƯỚC 1: Tạo project mới
    const projectId = await createProject();

    // BƯỚC 2: Tạo scene mới
    const sceneId = await createScene(projectId);

    // BƯỚC 3: Upload 2 ảnh
    const startImageKey = await uploadImage(CONFIG.START_IMAGE_PATH);
    const endImageKey = await uploadImage(CONFIG.END_IMAGE_PATH);

    // BƯỚC 4: Gen video chuyển cảnh (8s)
    const genPayload1 = {
      modelKey: 'veo_3_1_i2v_s_fast_ultra_fl', // Image-to-Video + Start + End Image
      prompt: 'Smooth cinematic transition from sitting cat to flying in the sky, epic lighting, high quality',
      startImageKey,
      endImageKey,
      aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
      lengthSeconds: 8,
      fps: 24,
      projectId,
      sceneId
    };

    const mediaId1 = await generateVideo(genPayload1);
    const result1 = await waitForCompletion(mediaId1);
    const videoPath1 = saveVideo(result1.videoBase64, `transition_8s.mp4`);

    // BƯỚC 5: Extend video (thêm 8s → tổng 16s)
    const extendPayload = {
      modelKey: 'veo_3_1_extend_fast_landscape_ultra',
      prompt: 'Continue flying through clouds, wind, sun rays, epic continuation',
      sourceVideoKey: result1.mediaGenerationId.mediaKey, // Dùng video vừa gen
      aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
      lengthSeconds: 8,
      fps: 24,
      projectId,
      sceneId
    };

    const mediaId2 = await generateVideo(extendPayload);
    const result2 = await waitForCompletion(mediaId2);
    saveVideo(result2.videoBase64, `extended_16s.mp4`);

    console.log('\nHOÀN TẤT! TẤT CẢ VIDEO ĐÃ ĐƯỢC TẢI VỀ:');
    console.log(`Thư mục: ${CONFIG.OUTPUT_DIR}`);
    console.log(`- transition_8s.mp4 (8s)`);
    console.log(`- extended_16s.mp4 (16s)`);

  } catch (err) {
    console.error('LỖI:', err.response?.data || err.message);
  }
})();
