// veo3-auto-full.js
// TỰ ĐỘNG: Tạo project → Tạo scene → Upload 2 ảnh → Gen đầu → Extend N lần → Tải về + Add vào timeline

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  // === CẤU HÌNH ===
  ACCESS_TOKEN: 'ya29.a0ATi6K2sz-xbF2SzfzhTZAeTQU30bYGg7mDU3R3yscj0-_vQ6W4Ig2FMpAB-lIBi9xS_KAq-O_kzM_C_3QC5ezfvCEO2lNlxN4xLHq9vi0-Rng7fGCVNbkzwNUa4vZmQSUH8449tVjGa0XbrReXZ5PDuDyTz_QkHbGuOM1r5Wtpv6P4lm2_9CMhMcOvsqlH0zDw-D4A3Si85dFL37aw-oGeSATBCu4jGxQBDjqmJAGvP2-tR_Ex8srU30Kz2I5jBN8k98i3qKE_T4bvF4KoEhe_uQaK_wwBdjFrUS2WElHknas1_FqnwYyvQF-1ef9P-UfyGWfOWD086g3I98QZmJ32cx0jI02KJCXzfK0bII0gaCgYKAXYSARYSFQHGX2MizqC4yC6FDS5kpduEEEkhzQ0369',
  OUTPUT_DIR: './veo3_output',
  START_IMAGE: './images/start.jpg',
  END_IMAGE: './images/end.jpg',
  EXTEND_COUNT: 3, // Kéo dài 3 lần → tổng 4 đoạn (8s + 8s x 3)
  PROMPT_BASE: 'Continue the epic journey of the flying cat through clouds, wind, sun rays, cinematic, high quality',
  POLL_INTERVAL: 5000,
};

// Tạo thư mục
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });

const TRPC_HEADERS = {
  'Authorization': `Bearer ${CONFIG.ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Referer': 'https://labs.google/fx/vi/tools/flow',
  'Origin': 'https://labs.google/fx'
};

const AISANDBOX_HEADERS = {
  'Authorization': `Bearer ${CONFIG.ACCESS_TOKEN}`,
  'Content-Type': 'text/plain;charset=UTF-8',
  'Referer': 'https://labs.google/fx/',
  'x-browser-channel': 'stable',
  'x-browser-year': '2025',
  'x-client-data': 'CIyIywE=',
};

// ==================== HÀM HỖ TRỢ ====================

async function trpc(url, payload) {
  const res = await axios.post(`https://labs.google/fx/api/trpc/${url}`, { json: payload }, { headers: TRPC_HEADERS });
  return res.data.result.data.json;
}

async function aisandbox(url, payload) {
  const res = await axios.post(`https://aisandbox-pa.googleapis.com/v1/video:${url}`, payload, { headers: AISANDBOX_HEADERS });
  return res.data;
}

// Tạo project
async function createProject() {
  const data = await trpc('project.create', { toolName: 'PINHOLE' });
  console.log(`Project created: ${data.projectId}`);
  return data.projectId;
}

// Tạo scene
async function createScene(projectId) {
  const data = await trpc('project.createScene', { projectId, toolName: 'PINHOLE' });
  console.log(`Scene created: ${data.sceneId}`);
  return data.sceneId;
}

// Upload ảnh
async function uploadImage(imagePath) {
  const base64 = fs.readFileSync(imagePath, 'base64');
  const data = await trpc('media.uploadImage', { userUploadedImage: { image: base64 } });
  console.log(`Uploaded: ${path.basename(imagePath)} → ${data.mediaGenerationId.mediaKey}`);
  return data.mediaGenerationId.mediaKey;
}

// Gen video đầu từ 2 ảnh
async function generateFirstVideo(projectId, sceneId, startKey, endKey) {
  const payload = {
    modelKey: 'veo_3_1_i2v_s_fast_ultra_fl',
    prompt: 'Smooth transition from sitting cat to flying in the sky, cinematic, high quality',
    startImageKey: startKey,
    endImageKey: endKey,
    aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
    lengthSeconds: 8,
    fps: 24,
    projectId,
    sceneId
  };
  const data = await trpc('video.generate', payload);
  console.log(`First video started: ${data.mediaGenerationId.mediaKey}`);
  return data.mediaGenerationId;
}

// Extend video
async function extendVideo(projectId, sceneId, sourceKey, prompt) {
  const body = JSON.stringify({
    clientContext: { projectId, tool: 'PINHOLE', userPaygateTier: 'PAYGATE_TIER_TWO' },
    requests: [{
      textInput: { prompt },
      videoInput: { mediaId: sourceKey, startFrameIndex: 168, endFrameIndex: 191 },
      videoModelKey: 'veo_3_1_extend_fast_landscape_ultra',
      aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
      seed: Math.floor(Math.random() * 65536),
      metadata: { sceneId }
    }]
  });

  const ops = await aisandbox('batchAsyncGenerateVideoExtendVideo', body);
  const op = ops.operations[0];
  console.log(`Extend started: ${op.operation.name}`);
  return op;
}

// Poll extend
async function waitForExtend(operations) {
  const checkBody = JSON.stringify({ operations: operations.map(op => ({ operation: { name: op.operation.name }, sceneId: op.sceneId })) });
  while (true) {
    await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
    try {
      const res = await aisandbox('batchCheckAsyncVideoGenerationStatus', checkBody);
      const op = res.operations[0];
      if (op.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
        console.log(`Extend completed!`);
        return {
          mediaId: op.mediaGenerationId,
          fifeUrl: op.operation.metadata.video.fifeUrl
        };
      }
      if (op.status === 'MEDIA_GENERATION_STATUS_FAILED') throw new Error('Extend failed');
      console.log(`Extending... ${op.status}`);
    } catch (e) { console.error('Poll error:', e.message); }
  }
}

// Tải video
async function downloadVideo(url, filename) {
  const res = await axios({ method: 'GET', url, responseType: 'stream' });
  const outputPath = path.join(CONFIG.OUTPUT_DIR, filename);
  await require('stream').pipeline(res.data, fs.createWriteStream(outputPath));
  console.log(`Saved: ${filename}`);
  return outputPath;
}

// Add clip vào scene
async function addClipToScene(projectId, sceneId, clips, newClip) {
  const updated = { sceneId, clips: [...clips, newClip] };
  await trpc('project.updateScene', {
    projectId,
    scene: updated,
    toolName: 'PINHOLE',
    updateMasks: ['clips']
  });
  console.log(`Clip added: ${newClip.clipId}`);
}

// ==================== CHƯƠNG TRÌNH CHÍNH ====================
(async () => {
  try {
    console.log('BẮT ĐẦU TỰ ĐỘNG VEIO 3 FLOW...\n');

    // 1. Tạo project + scene
    const projectId = await createProject();
    const sceneId = await createScene(projectId);

    // 2. Upload 2 ảnh
    const startKey = await uploadImage(CONFIG.START_IMAGE);
    const endKey = await uploadImage(CONFIG.END_IMAGE);

    // 3. Gen video đầu
    const firstGen = await generateFirstVideo(projectId, sceneId, startKey, endKey);
    const firstResult = await waitForCompletion(firstGen); // Dùng hàm poll cũ
    const firstVideoPath = await saveVideo(firstResult.videoBase64, '01_first_8s.mp4');

    // 4. Add clip đầu vào timeline
    let clips = [];
    let lastEndTime = 0;
    clips.push({
      clipId: firstResult.mediaGenerationId.mediaKey,
      startTime: '0.000000000s',
      endTime: '8.000000000s',
      prompt: 'First transition'
    });
    await addClipToScene(projectId, sceneId, [], clips[0]);

    let lastMediaKey = firstResult.mediaGenerationId.mediaKey;

    // 5. Extend N lần
    for (let i = 1; i <= CONFIG.EXTEND_COUNT; i++) {
      console.log(`\nEXTEND #${i}/${CONFIG.EXTEND_COUNT}`);

      const op = await extendVideo(projectId, sceneId, lastMediaKey, CONFIG.PROMPT_BASE + ` (part ${i + 1})`);
      const result = await waitForExtend([op]);

      const filename = `${String(i + 1).padStart(2, '0')}_extend_8s.mp4`;
      await downloadVideo(result.fifeUrl, filename);

      // Add clip vào timeline
      const start = (lastEndTime).toFixed(9) + 's';
      const end = (lastEndTime + 8).toFixed(9) + 's';
      const newClip = { clipId: result.mediaId, startTime: start, endTime: end, prompt: CONFIG.PROMPT_BASE };
      clips.push(newClip);
      await addClipToScene(projectId, sceneId, clips.slice(0, -1), newClip);

      lastMediaKey = result.mediaId;
      lastEndTime += 8;
    }

    console.log('\nHOÀN TẤT!');
    console.log(`Tổng thời lượng: ${(8 + CONFIG.EXTEND_COUNT * 8)}s`);
    console.log(`Thư mục: ${CONFIG.OUTPUT_DIR}`);
    console.log(`Mở: https://labs.google/fx/project/${projectId} để xem timeline!`);

  } catch (err) {
    console.error('LỖI:', err.response?.data || err.message);
  }
})();
