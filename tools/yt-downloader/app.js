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
    let activeQuality = '22';    // '22' (720p) or '18' (360p)
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

        // Show loading spinner
        loaderText.textContent = "Connecting to decentralized download node...";
        loaderOverlay.classList.remove('hidden');
        downloadBtn.disabled = true;

        // List of public Invidious instances (CORS enabled by default for public apps)
        const instances = [
            'https://invidious.yewtu.be',
            'https://inv.tux.im',
            'https://invidious.projectsegfau.lt',
            'https://invidious.privacydev.net',
            'https://y.com.sb'
        ];

        let success = false;
        let finalDownloadUrl = null;

        // Loop through instances to resolve video info and check format availability
        for (const instance of instances) {
            try {
                loaderText.textContent = `Resolving link via ${new URL(instance).hostname}...`;
                
                // Fetch directly from Invidious API (No CORS proxy needed, Invidious supports CORS!)
                const response = await fetch(`${instance}/api/v1/videos/${currentVideoId}`);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Determine the target itag format code
                    // itag 22 = 720p MP4, itag 18 = 360p MP4, itag 140 = M4A Audio
                    const itag = activeFormat === 'audio' ? '140' : activeQuality;
                    
                    // Check if itag is supported in the metadata stream lists
                    let formatSupported = false;
                    if (activeFormat === 'video') {
                        formatSupported = (data.formatStreams || []).some(s => s.itag === itag || s.quality === (itag === '22' ? 'hd720' : 'medium'));
                    } else {
                        formatSupported = (data.adaptiveFormats || []).some(s => s.itag === itag || (s.type && s.type.startsWith('audio/')));
                    }

                    if (formatSupported) {
                        // Construct the direct proxied download URL
                        // local=true forces Invidious to act as the download proxy, bypassing CORS restrictions
                        finalDownloadUrl = `${instance}/latest_version?id=${currentVideoId}&itag=${itag}&local=true`;
                        success = true;
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Instance ${instance} failed:`, err);
            }
        }

        loaderOverlay.classList.add('hidden');
        downloadBtn.disabled = false;

        if (success && finalDownloadUrl) {
            // Trigger instant browser download in a new tab without redirects or popups
            const a = document.createElement('a');
            a.href = finalDownloadUrl;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            // Last resort fallback: open a clean, reliable, ad-free converter redirect
            const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
            const fallbackUrl = `https://savefrom.net/?url=${encodeURIComponent(cleanUrl)}`;
            alert("All direct download nodes are busy. Opening secure download page in a new tab...");
            window.open(fallbackUrl, '_blank');
        }
    });
});
