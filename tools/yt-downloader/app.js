document.addEventListener('DOMContentLoaded', () => {
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const previewCard = document.getElementById('previewCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const resolutionGroup = document.getElementById('resolutionGroup');
    const downloadBtn = document.getElementById('downloadBtn');
    const loaderOverlay = document.getElementById('loaderOverlay');
    const loaderText = document.getElementById('loaderText');
    const qualitySelector = document.querySelector('.quality-selector');

    // API Configurations
    // REPLACE THIS URL with your actual public Render/Railway URL once deployed
    const ONLINE_API_BASE = 'https://acsoft-api.onrender.com';
    const LOCAL_API_BASE = 'http://localhost:8000'; // FastAPI default port (Uvicorn)

    // Form states
    let activeFormat = 'video'; // 'video' or 'audio'
    let selectedFormatId = 'best'; // backend format ID
    let currentVideoId = null;
    let fetchedFormats = [];
    
    let API_BASE = ONLINE_API_BASE;
    let serverRunning = false;

    // Direct YouTube URL Parser
    function parseYouTubeId(url) {
        if (!url) return null;
        url = url.trim();
        
        // Check for raw 11-char ID
        if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }

        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // Dynamic Server Discovery
    async function discoverActiveServer() {
        // 1. Try Local FastAPI Server first (port 8000)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 800);
            const res = await fetch(`${LOCAL_API_BASE}/api/info?url=test`, { 
                signal: controller.signal 
            });
            API_BASE = LOCAL_API_BASE;
            serverRunning = true;
            console.log("Connection established with local FastAPI backend.");
            return;
        } catch (e) {
            // Local not running, ignore
        }

        // 2. Try Online FastAPI Server
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const res = await fetch(`${ONLINE_API_BASE}/api/info?url=test`, { 
                signal: controller.signal 
            });
            API_BASE = ONLINE_API_BASE;
            serverRunning = true;
            console.log("Connection established with online FastAPI backend.");
        } catch (e) {
            serverRunning = false;
            console.warn("No active API backend detected. Fallback route enabled.");
        }
    }

    // Format toggle event handlers
    const formatVideoBtn = document.getElementById('formatVideo');
    const formatAudioBtn = document.getElementById('formatAudio');

    formatVideoBtn.addEventListener('click', () => {
        activeFormat = 'video';
        formatVideoBtn.classList.add('active');
        formatAudioBtn.classList.remove('active');
        resolutionGroup.classList.remove('hidden');
        renderQualityButtons();
    });

    formatAudioBtn.addEventListener('click', () => {
        activeFormat = 'audio';
        formatAudioBtn.classList.add('active');
        formatVideoBtn.classList.remove('active');
        resolutionGroup.classList.add('hidden');
        selectedFormatId = 'bestaudio';
    });

    // Dynamically render quality choices
    function renderQualityButtons() {
        qualitySelector.innerHTML = '';
        
        if (serverRunning && fetchedFormats.length > 0) {
            // Render formats returned by the online/local API
            fetchedFormats.forEach((f, idx) => {
                const btn = document.createElement('button');
                btn.className = `quality-btn ${idx === 0 ? 'active' : ''}`;
                if (idx === 0) selectedFormatId = f.format_id;
                
                const sizeMB = f.filesize ? ` (${(f.filesize / (1024 * 1024)).toFixed(1)} MB)` : '';
                btn.textContent = `${f.resolution}${sizeMB}`;
                btn.setAttribute('data-format-id', f.format_id);
                
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedFormatId = f.format_id;
                });
                
                qualitySelector.appendChild(btn);
            });
        } else {
            // Fallback default buttons
            const defaults = [
                { id: 'bestvideo[height<=1080]+bestaudio/best', label: '1080p (HD)' },
                { id: 'bestvideo[height<=720]+bestaudio/best', label: '720p' },
                { id: 'bestvideo[height<=480]+bestaudio/best', label: '480p' }
            ];
            
            defaults.forEach((f, idx) => {
                const btn = document.createElement('button');
                btn.className = `quality-btn ${idx === 0 ? 'active' : ''}`;
                if (idx === 0) selectedFormatId = f.id;
                btn.textContent = f.label;
                btn.setAttribute('data-format-id', f.id);
                
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedFormatId = f.id;
                });
                
                qualitySelector.appendChild(btn);
            });
        }
    }

    // Monitor input changes
    youtubeUrlInput.addEventListener('input', async () => {
        const id = parseYouTubeId(youtubeUrlInput.value);
        if (id) {
            currentVideoId = id;
            
            // Set thumbnail preview
            videoThumbnail.src = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
            videoThumbnail.onerror = () => {
                videoThumbnail.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            };
            
            previewCard.classList.remove('hidden');
            
            // Connect and check server
            loaderText.textContent = "Connecting to API backend...";
            loaderOverlay.classList.remove('hidden');
            
            await discoverActiveServer();
            
            if (serverRunning) {
                try {
                    const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
                    const response = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(cleanUrl)}`);
                    if (response.ok) {
                        const data = await response.json();
                        fetchedFormats = data.formats || [];
                    }
                } catch (err) {
                    console.error("Failed to fetch info from API server:", err);
                }
            }
            
            loaderOverlay.classList.add('hidden');
            renderQualityButtons();
        } else {
            currentVideoId = null;
            previewCard.classList.add('hidden');
        }
    });

    // Main Download Handler
    downloadBtn.addEventListener('click', async () => {
        if (!currentVideoId) {
            alert('Please paste a valid YouTube URL first.');
            return;
        }

        const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
        
        // Final server status check before trigger
        await discoverActiveServer();

        if (serverRunning) {
            // Direct streaming download via online/local FastAPI backend
            const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(cleanUrl)}&format=${selectedFormatId}`;
            window.open(downloadUrl, '_blank');
        } else {
            // Fallback: Alert and open SaveFrom redirect if no server is active
            alert("No active API server found online or locally.\n\nRedirecting to secure web fallback (SaveFrom.net)...");
            const fallbackUrl = `https://savefrom.net/?url=${encodeURIComponent(cleanUrl)}`;
            window.open(fallbackUrl, '_blank');
        }
    });
});
