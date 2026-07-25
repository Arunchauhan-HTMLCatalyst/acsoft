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
    let activeQuality = '720';   // '720' or '360'
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

        // Show spinner overlay
        loaderText.textContent = "Connecting to Cobalt API servers...";
        loaderOverlay.classList.remove('hidden');
        downloadBtn.disabled = true;

        // Standardize URL to remove tracking params (e.g. ?si=...) before sending to API
        const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

        // Body parameters (supporting both legacy v7/v8 and modern v10 specifications)
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

        // Active community public instances of Cobalt
        const instances = [
            'https://api.cobalt.tools',
            'https://co.wuk.sh',
            'https://cobalt.k6.cz',
            'https://api.cobalt.best',
            'https://cobalt.perennialte.ch'
        ];

        let success = false;
        let selectedStreamUrl = null;
        let errorMessage = "Unable to fetch download link. Please try again later.";

        // Step 1: Try Cobalt Instances for high quality (1080p etc.)
        for (const instance of instances) {
            const paths = [instance, `${instance}/api/json`];
            
            for (const urlPath of paths) {
                try {
                    loaderText.textContent = `Requesting download link from ${new URL(instance).hostname}...`;
                    
                    const response = await fetch(urlPath, {
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
                            selectedStreamUrl = result.url;
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
                    console.warn(`Endpoint ${urlPath} failed:`, err);
                }
            }
            if (success) break;
        }

        // Step 2: Try Invidious Fallback (100% ad-free & bypasses Cobalt API blocks)
        if (!success) {
            const invidiousInstances = [
                'https://invidious.yewtu.be',
                'https://inv.tux.im',
                'https://invidious.projectsegfau.lt',
                'https://invidious.privacydev.net'
            ];

            for (const invInstance of invidiousInstances) {
                try {
                    loaderText.textContent = `Retrying via ${new URL(invInstance).hostname}...`;
                    
                    const targetApiUrl = `${invInstance}/api/v1/videos/${currentVideoId}`;
                    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetApiUrl);
                    
                    const response = await fetch(proxyUrl);
                    if (response.ok) {
                        const invData = await response.json();
                        if (activeFormat === 'video') {
                            const streams = invData.formatStreams || [];
                            // Find the best quality matching activeQuality (720p fallback to 360p)
                            let selectedStream = null;
                            if (activeQuality === '720') {
                                selectedStream = streams.find(s => s.quality === 'hd720') || streams.find(s => s.quality === 'medium');
                            } else {
                                selectedStream = streams.find(s => s.quality === 'medium') || streams.find(s => s.quality === 'hd720');
                            }

                            if (selectedStream && selectedStream.url) {
                                selectedStreamUrl = selectedStream.url;
                                success = true;
                                break;
                            }
                        } else {
                            // Audio extraction (M4A stream)
                            const adaptive = invData.adaptiveFormats || [];
                            const audioStream = adaptive.find(s => s.type && s.type.startsWith('audio/'));
                            
                            if (audioStream && audioStream.url) {
                                selectedStreamUrl = audioStream.url;
                                success = true;
                                break;
                            }
                        }
                    }
                } catch (invErr) {
                    console.warn(`Invidious instance ${invInstance} failed:`, invErr);
                }
            }
        }

        // Hide overlay and reset button state
        loaderOverlay.classList.add('hidden');
        downloadBtn.disabled = false;

        // Step 3: Trigger instant redirect-free download in browser
        if (success && selectedStreamUrl) {
            // Trigger instant download by opening clean stream URL in a new window/tab
            window.open(selectedStreamUrl, '_blank');
        } else {
            alert(`Download failed: ${errorMessage}`);
        }
    });
});
