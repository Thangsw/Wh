// ################################################################
// # video.js - UPDATED: 2025-11-10 - Veo3 Video Generation
// # - Removed auto-create project/scene (caused 404 errors)
// # - Added checkProjectAndScene() - manual setup only
// # - Must set projectId/sceneId manually before generating videos
// ################################################################

const VideoModule = (() => {
    // State
    let scenes = [];
    let currentVariantIndex = 0;
    let currentVariants = [];
    let videoResults = [];
    let veo3ProjectId = null;
    let veo3SceneId = null;

    // ==================== TAB SWITCHING ====================
    function switchTab(tabName, evt) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        if (evt && evt.target) {
            evt.target.classList.add('active');
        } else {
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => {
                if (tab.getAttribute('onclick').includes(tabName)) {
                    tab.classList.add('active');
                }
            });
        }
        
        const tabContent = document.getElementById(tabName + 'Tab');
        if (tabContent) {
            tabContent.classList.add('active');
        }
    }

    // ==================== MOVE TO VIDEO ====================
    function saveCurrentImages() {
        const images = window.images || [];
        
        if (images.length === 0) {
            alert('Chưa có ảnh nào! Hãy tạo ảnh trước.');
            return;
        }
        
        // Lưu project tạm
        const projectName = `temp_${Date.now()}`;
        const projectData = {
            images: images,
            timestamp: Date.now(),
            count: images.length
        };
        
        fetch('/api/save-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: projectName, data: projectData })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                alert(`✓ Đã lưu ${images.length} ảnh!`);
                // Tự động chuyển sang Video
                moveToVideo();
            } else {
                alert('Lỗi lưu: ' + data.error);
            }
        }).catch(err => {
            alert('Lỗi: ' + err.message);
        });
    }

    function confirmMoveToVideo() {
        const images = window.images || [];
        
        if (images.length < 2) {
            alert('Cần ít nhất 2 ảnh để tạo video!');
            return;
        }
        
        moveToVideo();
    }

    function moveToVideo() {
        scenes = [];
        
        const images = window.images || [];
        
        if (images.length < 2) {
            alert('Cần ít nhất 2 ảnh!');
            return;
        }
        
        // Reverse để scene 1 = ảnh 1→2 (không ngược)
        const sortedImages = [...images].reverse();
        
        // Tạo scenes từ ảnh (1-2, 2-3, 3-4...)
        for (let i = 0; i < sortedImages.length - 1; i++) {
            const currentImg = sortedImages[i];
            const nextImg = sortedImages[i + 1];
            
            const img1Url = currentImg.versions[currentImg.currentVersion].imageUrl;
            const img2Url = nextImg.versions[nextImg.currentVersion].imageUrl;
            
            scenes.push({
                id: Date.now() + i,
                index: i,
                img1: {
                    imageUrl: img1Url,
                    prompt: currentImg.prompt
                },
                img2: {
                    imageUrl: img2Url,
                    prompt: nextImg.prompt
                },
                prompt: '',
                extend: false
            });
        }
        
        renderScenes();
        
        // Switch to video tab
        const videoTab = document.querySelectorAll('.tab')[1];
        if (videoTab) {
            videoTab.click();
        }
    }

    // ==================== RENDER SCENES ====================
    function renderScenes() {
        const container = document.getElementById('videoScenes');
        if (!container) return;
        
        container.innerHTML = '';

        if (scenes.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Chưa có scenes. Nhấn "Chuyển sang Video" ở tab Images.</p>';
            return;
        }

        scenes.forEach((scene, idx) => {
            const div = document.createElement('div');
            div.className = 'scene-row';
            
            const img1Html = scene.img1 
                ? `<div class="scene-counter">${idx + 1}</div>
                   <button class="remove-btn" onclick="VideoModule.removeImage(${scene.id}, 1)">×</button>
                   <img src="${scene.img1.imageUrl}">`
                : '<p style="color: var(--text-secondary);">Đã xóa</p>';
            
            const img2Html = scene.img2 
                ? `<button class="remove-btn" onclick="VideoModule.removeImage(${scene.id}, 2)">×</button>
                   <img src="${scene.img2.imageUrl}">`
                : '<p style="color: var(--text-secondary);">Đã xóa</p>';
            
            div.innerHTML = `
                <div class="scene-image">
                    ${img1Html}
                </div>
                <div class="arrow">→</div>
                <div class="scene-prompt ${scene.extend ? 'extend' : ''}">
                    <label style="font-size: 12px; margin-bottom: 8px; display: block; color: var(--text-secondary);">
                        ${scene.extend ? '🔴 Kéo dài' : 'Scene ' + (idx + 1)}
                    </label>
                    <textarea id="prompt_${scene.id}" placeholder="Nhập prompt cho scene này...">${scene.prompt}</textarea>
                    <div style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-secondary" onclick="VideoModule.toggleExtend(${scene.id})" style="font-size: 12px; padding: 6px 12px;">
                            ${scene.extend ? '⚡ Scene thường' : '🔴 Kéo dài'}
                        </button>
                        <span style="font-size: 11px; color: var(--text-secondary);">
                            ${scene.extend ? 'Nút kéo dài chuyển thành đầu = đã nhập prompt và lựa chọn kéo dài hok, gen 1 scene mới' : 'Tạo xong có thể edit prompt, regen lại hoặc chọn kéo dài hoặc gen 1 scene mới'}
                        </span>
                    </div>
                </div>
                <div class="arrow">→</div>
                <div class="scene-image" style="position: relative;">
                    ${img2Html}
                    ${!scene.extend && !scene.img2 ? '' : `
                        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: var(--text-secondary); font-size: 12px; pointer-events: none;">
                            <div style="margin-bottom: 8px;">Video sẽ xuất hiện ở đây</div>
                            <div style="font-size: 11px;">Chọn 1 trong 2 phiên bản</div>
                        </div>
                    `}
                </div>
            `;
            
            container.appendChild(div);
        });
    }

    function removeImage(sceneId, imgNum) {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) return;
        
        if (imgNum === 1) {
            scene.img1 = null;
        } else {
            scene.img2 = null;
        }
        
        renderScenes();
    }

    function toggleExtend(sceneId) {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) return;
        
        scene.extend = !scene.extend;
        renderScenes();
    }

    // ==================== LOAD PROMPTS ====================
    function loadPrompts() {
        const text = document.getElementById('masterPrompts').value;
        const prompts = text.split('\n').map(p => p.trim()).filter(p => p);
        
        if (prompts.length === 0) {
            alert('Vui lòng nhập prompts (mỗi dòng 1 prompt)!');
            return;
        }

        let loaded = 0;
        prompts.forEach((prompt, idx) => {
            if (scenes[idx]) {
                scenes[idx].prompt = prompt;
                const textarea = document.getElementById('prompt_' + scenes[idx].id);
                if (textarea) {
                    textarea.value = prompt;
                    loaded++;
                }
            }
        });

        alert(`✅ Đã load ${loaded} prompts vào timeline!`);
    }

    // ==================== VEO3 PROJECT & SCENE SETUP (Manual Only) ====================
    async function checkProjectAndScene() {
        // Lấy projectId/sceneId từ server (đã được set manual)
        const response = await fetch('/api/veo3/get-session');
        const data = await response.json();

        if (data.success && data.projectId && data.sceneId) {
            veo3ProjectId = data.projectId;
            veo3SceneId = data.sceneId;
            console.log(`✓ Using manual project: ${veo3ProjectId}`);
            console.log(`✓ Using manual scene: ${veo3SceneId}`);
            return { projectId: veo3ProjectId, sceneId: veo3SceneId };
        }

        // Chưa set manual -> báo lỗi
        throw new Error(
            '⚠️ Chưa set Project ID và Scene ID!\n\n' +
            'Vui lòng:\n' +
            '1. Tạo project tại labs.google/fx/tools/flow\n' +
            '2. Copy URL của project\n' +
            '3. Paste vào ô "Paste Project URL"\n' +
            '4. Click "Set Project & Scene"\n\n' +
            'Sau đó mới có thể gen videos!'
        );
    }

    // ==================== GENERATE VIDEOS ====================
    async function generateAllVideos() {
        if (scenes.length === 0) {
            alert('Chưa có scenes nào!');
            return;
        }

        if (!confirm(`Bắt đầu gen ${scenes.length} videos?\n\nMỗi scene sẽ gen 2 variants để bạn chọn.`)) {
            return;
        }

        try {
            // Check project and scene đã được set manual chưa
            const projectInfo = await checkProjectAndScene();
            console.log('✓ Project and scene ready:', projectInfo);

            const videoLength = parseInt(document.getElementById('videoLength').value) || 8;

            for (let i = 0; i < scenes.length; i++) {
                const scene = scenes[i];
                const promptField = document.getElementById('prompt_' + scene.id);
                const prompt = promptField ? promptField.value.trim() : scene.prompt;

                if (!prompt) {
                    alert(`Scene ${i + 1} chưa có prompt! Bỏ qua.`);
                    continue;
                }

                try {
                    await generateSingleVideo(scene, prompt, videoLength, i, projectInfo);
                } catch (err) {
                    console.error('Error generating video:', err);
                    alert(`Lỗi scene ${i + 1}: ${err.message}`);
                }
            }

            alert('✅ Hoàn thành tất cả videos!');
        } catch (err) {
            console.error('Setup error:', err);
            alert(`Lỗi setup: ${err.message}`);
        }
    }

    async function generateSingleVideo(scene, prompt, lengthSeconds, sceneIndex, projectInfo) {
        console.log(`Generating scene ${sceneIndex + 1}:`, prompt);

        const sceneContainer = document.getElementById('videoScenes');
        const progressDiv = document.createElement('div');
        progressDiv.id = `progress_${scene.id}`;
        progressDiv.className = 'video-progress';
        progressDiv.innerHTML = `
            <h4>Scene ${sceneIndex + 1}: ${prompt.substring(0, 50)}...</h4>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <p style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">Đang upload ảnh...</p>
        `;
        sceneContainer.appendChild(progressDiv);

        try {
            const img1Base64 = await imageToBase64(scene.img1.imageUrl);
            progressDiv.querySelector('p').textContent = 'Đang upload ảnh 1...';

            const uploadRes1 = await fetch('/api/veo3/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: img1Base64 })
            });
            const upload1 = await uploadRes1.json();
            if (!upload1.success) throw new Error('Upload ảnh 1 thất bại');

            let img2Key = null;
            if (scene.img2 && !scene.extend) {
                progressDiv.querySelector('p').textContent = 'Đang upload ảnh 2...';
                const img2Base64 = await imageToBase64(scene.img2.imageUrl);
                const uploadRes2 = await fetch('/api/veo3/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: img2Base64 })
                });
                const upload2 = await uploadRes2.json();
                if (!upload2.success) throw new Error('Upload ảnh 2 thất bại');
                img2Key = upload2.mediaKey;
            }

            progressDiv.querySelector('p').textContent = 'Đang gen 2 video variants...';

            const genPayload = {
                prompt: prompt,
                startImageKey: upload1.mediaKey,
                endImageKey: img2Key,
                modelKey: scene.extend ? 'veo_3_1_extend_fast_ultra' : 'veo_3_1_i2v_s_fast_ultra_fl',
                aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE',
                lengthSeconds: lengthSeconds,
                projectId: projectInfo.projectId,
                sceneId: projectInfo.sceneId
            };

            const genRes = await fetch('/api/veo3/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(genPayload)
            });
            const gen = await genRes.json();
            if (!gen.success) throw new Error('Gen video thất bại');

            const mediaGenId = gen.mediaGenerationId;
            let completed = false;

            while (!completed) {
                await new Promise(r => setTimeout(r, 3000));

                const statusRes = await fetch('/api/veo3/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mediaGenerationId: mediaGenId })
                });
                const statusData = await statusRes.json();
                if (!statusData.success) continue;

                const status = statusData.status;

                if (status.status === 'RUNNING') {
                    const progress = status.variants 
                        ? Math.max(...status.variants.map(v => (v.progress || 0) * 100))
                        : (status.progress || 0) * 100;
                    progressDiv.querySelector('.progress-fill').style.width = progress + '%';
                    progressDiv.querySelector('p').textContent = `Đang gen... ${progress.toFixed(1)}%`;
                } else if (status.status === 'COMPLETED') {
                    completed = true;
                    progressDiv.querySelector('.progress-fill').style.width = '100%';

                    const saveRes = await fetch('/api/veo3/save-variants', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            variants: status.variants,
                            baseFilename: `scene_${sceneIndex + 1}`
                        })
                    });
                    const saveData = await saveRes.json();

                    if (saveData.success) {
                        progressDiv.innerHTML = `<h4>✅ Scene ${sceneIndex + 1} hoàn thành!</h4>`;
                        showVariantViewer(saveData.videos, sceneIndex);
                    }
                } else if (status.status === 'FAILED') {
                    throw new Error(status.errorMessage || 'Gen thất bại');
                }
            }

        } catch (err) {
            progressDiv.innerHTML = `<h4>❌ Lỗi scene ${sceneIndex + 1}</h4><p style="color: var(--danger-color);">${err.message}</p>`;
            throw err;
        }
    }

    // ==================== VARIANT VIEWER ====================
    function showVariantViewer(videos, sceneIndex) {
        currentVariants = videos;
        currentVariantIndex = 0;

        const container = document.getElementById('videoScenes');
        const viewerDiv = document.createElement('div');
        viewerDiv.id = 'variantViewer_' + sceneIndex;
        viewerDiv.className = 'variant-viewer';
        viewerDiv.innerHTML = `
            <h4>Scene ${sceneIndex + 1} - ${videos.length} Variants</h4>
            <div class="variant-controls">
                <button onclick="VideoModule.prevVariant()">← Trước</button>
                <span id="variantCounter">1 / ${videos.length}</span>
                <button onclick="VideoModule.nextVariant()">Sau →</button>
            </div>
            <video id="variantVideo_${sceneIndex}" controls style="width: 100%; max-width: 800px; border-radius: 8px; background: #000;">
                <source src="${videos[0].url}" type="video/mp4">
            </video>
            <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">
                <button class="btn btn-success" onclick="VideoModule.selectBest(${sceneIndex})">✅ Chọn Best</button>
                <button class="btn btn-secondary" onclick="VideoModule.downloadVariant()">📥 Tải về</button>
            </div>
        `;

        container.appendChild(viewerDiv);
    }

    function prevVariant() {
        if (currentVariantIndex > 0) {
            currentVariantIndex--;
            updateVariantView();
        }
    }

    function nextVariant() {
        if (currentVariantIndex < currentVariants.length - 1) {
            currentVariantIndex++;
            updateVariantView();
        }
    }

    function updateVariantView() {
        if (currentVariants.length === 0) return;

        const videos = document.querySelectorAll('[id^="variantVideo_"]');
        if (videos.length > 0) {
            const lastVideo = videos[videos.length - 1];
            lastVideo.src = currentVariants[currentVariantIndex].url;
        }

        const counter = document.getElementById('variantCounter');
        if (counter) {
            counter.textContent = `${currentVariantIndex + 1} / ${currentVariants.length}`;
        }
    }

    function selectBest(sceneIndex) {
        const variant = currentVariants[currentVariantIndex];
        alert(`✅ Đã chọn Variant ${currentVariantIndex + 1} làm Best cho Scene ${sceneIndex + 1}!\n\nFile: ${variant.filename}`);
    }

    function downloadVariant() {
        if (currentVariants.length === 0) return;
        
        const url = currentVariants[currentVariantIndex].url;
        const a = document.createElement('a');
        a.href = url;
        a.download = `variant_${currentVariantIndex + 1}.mp4`;
        a.click();
    }

    // ==================== HELPER ====================
    async function imageToBase64(imageUrl) {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ==================== PUBLIC API ====================
    return {
        switchTab,
        saveCurrentImages,
        confirmMoveToVideo,
        loadPrompts,
        generateAllVideos,
        removeImage,
        toggleExtend,
        prevVariant,
        nextVariant,
        selectBest,
        downloadVariant
    };
})();

window.VideoModule = VideoModule;
