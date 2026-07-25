document.addEventListener('DOMContentLoaded', () => {
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const previewCard = document.getElementById('previewCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const resolutionGroup = document.getElementById('resolutionGroup');
    const downloadBtn = document.getElementById('downloadBtn');
    const loaderOverlay = document.getElementById('loaderOverlay');
    const loaderText = document.getElementById('loaderText');

    // Form states
    let activeFormat = 'video'; // 'video' or 'audio'
    let activeQuality = '1080';  // '1080', '720', '480', '360'
    let currentVideoId = null;

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

    // Monitor input changes
    youtubeUrlInput.addEventListener('input', () => {
        const id = parseYouTubeId(youtubeUrlInput.value);
        if (id) {
            currentVideoId = id;
            // Load YouTube high-res thumbnail with fallback to high-quality
            videoThumbnail.src = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
            videoThumbnail.onerror = () => {
                videoThumbnail.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            };
            previewCard.classList.remove('hidden');
        } else {
            currentVideoId = null;
            previewCard.classList.add('hidden');
        }
    });

    // Format toggles
    const formatVideoBtn = document.getElementById('formatVideo');
    const formatAudioBtn = document.getElementById('formatAudio');

    formatVideoBtn.addEventListener('click', () => {
        activeFormat = 'video';
        formatVideoBtn.classList.add('active');
        formatAudioBtn.classList.remove('active');
        resolutionGroup.classList.remove('hidden');
    });

    formatAudioBtn.addEventListener('click', () => {
        activeFormat = 'audio';
        formatAudioBtn.classList.add('active');
        formatVideoBtn.classList.remove('active');
        resolutionGroup.classList.add('hidden');
    });

    // Quality buttons selector
    const qualityButtons = document.querySelectorAll('.quality-btn');
    qualityButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            qualityButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeQuality = btn.getAttribute('data-quality');
        });
    });

    // Main Download Click handler
    downloadBtn.addEventListener('click', async () => {
        if (!currentVideoId) {
            alert('Please paste a valid YouTube URL first.');
            return;
        }

        // Show loader overlay
        loaderText.textContent = "Initiating bypass protocols...";
        loaderOverlay.classList.remove('hidden');
        downloadBtn.disabled = true;

        // Clean watch link (stripping tracking arguments)
        const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

        // Configure request options payload for Cobalt
        const requestPayload = {
            url: cleanUrl,
            videoQuality: activeFormat === 'video' ? activeQuality : '1080',
            vQuality: activeFormat === 'video' ? activeQuality : '1080', // legacy fallback
            downloadMode: activeFormat === 'audio' ? 'audio' : 'auto',
            isAudioOnly: activeFormat === 'audio', // legacy fallback
            isAudio: activeFormat === 'audio', // legacy fallback
            aFormat: 'mp3',
            audioFormat: 'mp3', // legacy fallback
            filenamePattern: 'basic'
        };

        // Community hosted instances of Cobalt
        const instances = [
            'https://api.cobalt.tools',
            'https://co.wuk.sh',
            'https://cobalt.k6.cz',
            'https://api.cobalt.best',
            'https://cobalt.perennialte.ch'
        ];

        // Public CORS Proxies to completely bypass browser security blocks
        const proxies = [
            (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        ];

        let success = false;
        let finalDownloadUrl = null;

        // Nested loop: try each Cobalt server via each CORS proxy
        for (const instance of instances) {
            const urlPath = `${instance}/api/json`;
            
            for (const proxyFn of proxies) {
                const proxiedApiUrl = proxyFn(urlPath);
                try {
                    loaderText.textContent = `Resolving via ${new URL(instance).hostname}...`;
                    
                    const response = await fetch(proxiedApiUrl, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestPayload)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (result && result.url) {
                            finalDownloadUrl = result.url;
                            success = true;
                            break;
                        }
                    }
                } catch (err) {
                    console.warn(`Query failed for ${instance} via proxy:`, err);
                }
            }
            if (success) break;
        }

        // Hide loader overlay and restore button
        loaderOverlay.classList.add('hidden');
        downloadBtn.disabled = false;

        if (success && finalDownloadUrl) {
            // Success: trigger instant download in a new tab
            window.open(finalDownloadUrl, '_blank');
        } else {
            // Fallback: Redirect user to a clean, reliable, ad-free converter site
            const fallbackUrl = `https://savefrom.net/?url=${encodeURIComponent(cleanUrl)}`;
            alert("Connection nodes are busy. Opening secure direct download page in a new tab...");
            window.open(fallbackUrl, '_blank');
        }
    });
});
