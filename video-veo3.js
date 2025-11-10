// ################################################################
// # video-veo3.js - VEO3 VIDEO GENERATION (Theo flow thực tế)
// # UPDATED: 2025-11-10
// # - Crop ảnh về 929x507 (landscape) hoặc 507x929 (portrait)
// # - Upload qua general.submitBatchLog (3 events)
// # - Generate qua aisandbox API (startImage + endImage)
// ################################################################

const VideoVeo3 = (() => {
    // State
    let scenes = [];
    let projectId = null;
    let sceneId = null;
    let sessionId = `;${Date.now()}`;

    // ==================== AUTO CROP IMAGE ====================
    async function cropImageToVeo3Size(imageBase64, aspectRatio = 'landscape') {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Kích thước target
                let targetWidth, targetHeight;
                if (aspectRatio === 'landscape') {
                    targetWidth = 929;
                    targetHeight = 507;
                } else {
                    targetWidth = 507;
                    targetHeight = 929;
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;

                // Tính toán crop center
                const sourceAspect = img.width / img.height;
                const targetAspect = targetWidth / targetHeight;

                let sx, sy, sWidth, sHeight;

                if (sourceAspect > targetAspect) {
                    // Source rộng hơn -> crop bên trái/phải
                    sHeight = img.height;
                    sWidth = img.height * targetAspect;
                    sx = (img.width - sWidth) / 2;
                    sy = 0;
                } else {
                    // Source cao hơn -> crop trên/dưới
                    sWidth = img.width;
                    sHeight = img.width / targetAspect;
                    sx = 0;
                    sy = (img.height - sHeight) / 2;
                }

                // Draw cropped image
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

                // Convert to base64
                const croppedBase64 = canvas.toDataURL('image/jpeg', 0.95);
                resolve(croppedBase64);
            };

            img.onerror = reject;
            img.src = imageBase64;
        });
    }

    // ==================== UPLOAD IMAGE (3 EVENTS) ====================
    async function uploadImageForVeo3(imageBase64, aspectRatio = 'landscape') {
        console.log('Step 1: Crop image to Veo3 size...');

        // Auto crop
        const croppedBase64 = await cropImageToVeo3Size(imageBase64, aspectRatio);

        const width = aspectRatio === 'landscape' ? 929 : 507;
        const height = aspectRatio === 'landscape' ? 507 : 929;

        console.log(`Step 2: Upload ${width}x${height} image...`);

        // Event 1: PINHOLE_UPLOAD_IMAGE_TO_CROP
        await fetch('/api/veo3/submit-batch-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'PINHOLE_UPLOAD_IMAGE_TO_CROP',
                sessionId,
                properties: {
                    width,
                    height
                }
            })
        });

        console.log('Step 3: Resize image...');

        // Event 2: PINHOLE_RESIZE_IMAGE
        await fetch('/api/veo3/submit-batch-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'PINHOLE_RESIZE_IMAGE',
                sessionId,
                aspectRatio: aspectRatio === 'landscape' ? 'IMAGE_ASPECT_RATIO_LANDSCAPE' : 'IMAGE_ASPECT_RATIO_PORTRAIT'
            })
        });

        console.log('Step 4: Crop and upload to get mediaId...');

        // Event 3: PINHOLE_CROP_IMAGE + actual upload
        const response = await fetch('/api/veo3/upload-cropped-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageBase64: croppedBase64,
                sessionId,
                aspectRatio: aspectRatio === 'landscape' ? 'IMAGE_ASPECT_RATIO_LANDSCAPE' : 'IMAGE_ASPECT_RATIO_PORTRAIT'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error('Upload failed: ' + data.error);
        }

        console.log(`✓ Upload complete! MediaId: ${data.mediaId.substring(0, 30)}...`);
        return data.mediaId;
    }

    // ==================== GENERATE VIDEO FROM 2 IMAGES ====================
    async function generateVideoFrom2Images(startImageMediaId, endImageMediaId, prompt, aspectRatio = 'landscape') {
        console.log('Generating video from 2 images...');

        if (!projectId || !sceneId) {
            throw new Error('Chưa set projectId và sceneId! Vui lòng paste URL project trước.');
        }

        const response = await fetch('/api/veo3/generate-start-end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                sceneId,
                startImageMediaId,
                endImageMediaId,
                prompt,
                aspectRatio: aspectRatio === 'landscape' ? 'VIDEO_ASPECT_RATIO_LANDSCAPE' : 'VIDEO_ASPECT_RATIO_PORTRAIT'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error('Generate failed: ' + data.error);
        }

        console.log(`✓ Video generation started! Operations:`, data.operations);

        // Poll status
        return await pollVideoStatus(data.operations);
    }

    // ==================== EXTEND VIDEO (từ ngon.js) ====================
    async function extendVideo(sourceMediaId, prompt, aspectRatio = 'landscape') {
        console.log('Extending video...');

        if (!projectId || !sceneId) {
            throw new Error('Chưa set projectId và sceneId!');
        }

        const response = await fetch('/api/veo3/extend-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                sceneId,
                sourceMediaId,
                prompt,
                aspectRatio: aspectRatio === 'landscape' ? 'VIDEO_ASPECT_RATIO_LANDSCAPE' : 'VIDEO_ASPECT_RATIO_PORTRAIT'
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error('Extend failed: ' + data.error);
        }

        console.log(`✓ Extend started! Operation:`, data.operation);

        return await pollVideoStatus([data.operation]);
    }

    // ==================== POLL VIDEO STATUS ====================
    async function pollVideoStatus(operations) {
        console.log('Polling video status...');

        let attempts = 0;
        const maxAttempts = 120; // 10 phút (5s/lần)

        while (attempts < maxAttempts) {
            attempts++;

            await new Promise(r => setTimeout(r, 5000)); // Chờ 5s

            const response = await fetch('/api/veo3/check-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operations })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error('Check status failed: ' + data.error);
            }

            // Count status
            let successCount = 0;
            let activeCount = 0;
            let failedCount = 0;

            data.operations.forEach(op => {
                if (op.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') successCount++;
                else if (op.status === 'MEDIA_GENERATION_STATUS_ACTIVE') activeCount++;
                else if (op.status === 'MEDIA_GENERATION_STATUS_FAILED') failedCount++;
            });

            console.log(`Poll #${attempts}: ✅${successCount} ⚙️${activeCount} ❌${failedCount}`);

            // Check nếu tất cả đã xong
            if (successCount + failedCount >= operations.length) {
                console.log('✓ Video generation complete!');
                return data.operations.filter(op => op.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL');
            }

            // Update operations for next poll
            operations = data.operations;
        }

        throw new Error('Timeout! Video generation took too long.');
    }

    // ==================== SET PROJECT/SCENE FROM URL ====================
    function setProjectFromUrl(url) {
        // Parse URL: labs.google/fx/tools/flow/project/xxx/scenes/xxx
        const projectMatch = url.match(/\/project\/([a-f0-9-]{36})/i);
        const sceneMatch = url.match(/\/scenes\/([a-f0-9-]{36})/i);

        if (!projectMatch || !sceneMatch) {
            throw new Error('URL không hợp lệ! Phải có dạng: .../project/xxx/scenes/xxx');
        }

        projectId = projectMatch[1];
        sceneId = sceneMatch[1];

        console.log(`✓ Project ID: ${projectId}`);
        console.log(`✓ Scene ID: ${sceneId}`);

        return { projectId, sceneId };
    }

    // ==================== UI FUNCTIONS ====================
    function openLabsGoogle() {
        window.open('https://labs.google/fx/tools/flow', '_blank');
    }

    async function handleGenerateVideo() {
        try {
            // Validation
            if (!projectId || !sceneId) {
                alert('⚠️ Chưa set Project/Scene!\n\n1. Click "Mở Labs Google"\n2. Tạo project\n3. Copy URL và paste vào đây');
                return;
            }

            // Get images from gallery (assumes window.images exists)
            if (!window.images || window.images.length < 2) {
                alert('⚠️ Cần ít nhất 2 ảnh để tạo video!\n\nHãy gen ảnh ở tab Images trước.');
                return;
            }

            const startImage = window.images[0].url;
            const endImage = window.images[1].url;
            const prompt = document.getElementById('videoPrompt')?.value || 'Transform from start to end';

            console.log('=== Starting video generation ===');
            console.log('Start image:', startImage);
            console.log('End image:', endImage);
            console.log('Prompt:', prompt);

            // Convert image URLs to base64
            const startBase64 = await urlToBase64(startImage);
            const endBase64 = await urlToBase64(endImage);

            // Upload 2 images
            const startMediaId = await uploadImageForVeo3(startBase64, 'landscape');
            const endMediaId = await uploadImageForVeo3(endBase64, 'landscape');

            // Generate video
            const videos = await generateVideoFrom2Images(startMediaId, endMediaId, prompt, 'landscape');

            alert(`✅ Hoàn thành!\n\nĐã tạo ${videos.length} video variants!`);

            // Display videos
            displayVideos(videos);

        } catch (err) {
            console.error('Error:', err);
            alert(`❌ Lỗi: ${err.message}`);
        }
    }

    async function urlToBase64(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function displayVideos(videos) {
        const container = document.getElementById('videoResults');
        if (!container) return;

        container.innerHTML = '<h3>🎬 Videos đã tạo:</h3>';

        videos.forEach((video, idx) => {
            const videoUrl = video.operation?.metadata?.video?.fifeUrl;
            if (!videoUrl) return;

            const div = document.createElement('div');
            div.className = 'video-result';
            div.innerHTML = `
                <h4>Variant ${idx + 1}</h4>
                <video controls width="400" src="${videoUrl}"></video>
                <a href="${videoUrl}" download="video_${idx + 1}.mp4" class="btn">📥 Tải về</a>
            `;
            container.appendChild(div);
        });
    }

    // Export public API
    return {
        openLabsGoogle,
        setProjectFromUrl,
        handleGenerateVideo,
        cropImageToVeo3Size,
        uploadImageForVeo3,
        generateVideoFrom2Images,
        extendVideo
    };
})();
