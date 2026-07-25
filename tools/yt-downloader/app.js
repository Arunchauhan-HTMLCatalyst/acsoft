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
        resolutionGroup.classList.add('hidden'); // Hide quality select for audio-only downloads
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

    // Download Handler
    downloadBtn.addEventListener('click', async () => {
        const rawUrl = youtubeUrlInput.value.trim();
        if (!rawUrl) {
            alert('Please paste a valid YouTube URL first.');
            return;
        }

        // Show spinner overlay
        loaderText.textContent = "Connecting to Cobalt API server...";
        loaderOverlay.classList.remove('hidden');

        // Body parameters
        const requestPayload = {
            url: rawUrl,
            vQuality: activeFormat === 'video' ? activeQuality : 'max',
            isAudioOnly: activeFormat === 'audio',
            aFormat: 'mp3',
            filenamePattern: 'basic'
        };

        // Attempt download using multiple public Cobalt API endpoints for high reliability
        const endpoints = [
            'https://api.cobalt.tools/',
            'https://co.wuk.sh/'
        ];

        let success = false;
        let errorMessage = "Unable to fetch download link. Please try again later.";

        for (const endpoint of endpoints) {
            try {
                loaderText.textContent = `Requesting download link from endpoint...`;
                
                const response = await fetch(endpoint, {
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
                        // Success: open download stream URL in a new tab to trigger browser download
                        const a = document.createElement('a');
                        a.href = result.url;
                        a.target = '_blank';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        
                        success = true;
                        break;
                    }
                } else {
                    const errData = await response.json().catch(() => ({}));
                    if (errData && errData.text) {
                        errorMessage = errData.text;
                    }
                }
            } catch (err) {
                console.warn(`Endpoint ${endpoint} failed:`, err);
            }
        }

        loaderOverlay.classList.add('hidden');

        if (!success) {
            alert(`Download failed: ${errorMessage}`);
        }
    });
});
