document.addEventListener('DOMContentLoaded', () => {
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const previewCard = document.getElementById('previewCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const resolutionGroup = document.getElementById('resolutionGroup');
    const downloadBtn = document.getElementById('downloadBtn');
    const loaderOverlay = document.getElementById('loaderOverlay');
    const loaderText = document.getElementById('loaderText');
    const qualitySelector = document.querySelector('.quality-selector');

    // Local Flask Server Base URL
    const API_BASE = 'http://localhost:5000';

    // Form states
    let activeFormat = 'video'; // 'video' or 'audio'
    let selectedFormatId = 'best'; // Flask backend format ID
    let currentVideoId = null;
    let fetchedFormats = [];
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

    // Ping Flask backend to check if it's active
    async function checkServerStatus() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            
            const res = await fetch(`${API_BASE}/api/info?url=test`, { 
                signal: controller.signal 
            });
            serverRunning = true;
        } catch (e) {
            serverRunning = false;
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

    // Dynamically render format resolution choices
    function renderQualityButtons() {
        qualitySelector.innerHTML = '';
        
        if (serverRunning && fetchedFormats.length > 0) {
            // Render actual formats returned by yt-dlp backend
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
            // Fallback default buttons if server is not online
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
            
            // Query Flask server for dynamic metadata
            loaderText.textContent = "Connecting to local Python server...";
            loaderOverlay.classList.remove('hidden');
            
            await checkServerStatus();
            
            if (serverRunning) {
                try {
                    const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
                    const response = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(cleanUrl)}`);
                    if (response.ok) {
                        const data = await response.json();
                        fetchedFormats = data.formats || [];
                    }
                } catch (err) {
                    console.error("Failed to fetch info from local server:", err);
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
        
        // Double check server status on click
        await checkServerStatus();

        if (serverRunning) {
            // Direct premium streaming via Flask backend
            const downloadUrl = `${API_BASE}/api/download?url=${encodeURIComponent(cleanUrl)}&format=${selectedFormatId}`;
            window.open(downloadUrl, '_blank');
        } else {
            // Fallback: Alert and open SaveFrom redirect if server is not online
            alert("Local Python server is not running on port 5000.\nPlease launch the server by running:\npython3 server.py\n\nRedirecting to secure web fallback (SaveFrom.net)...");
            const fallbackUrl = `https://savefrom.net/?url=${encodeURIComponent(cleanUrl)}`;
            window.open(fallbackUrl, '_blank');
        }
    });
});
