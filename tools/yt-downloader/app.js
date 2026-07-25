document.addEventListener('DOMContentLoaded', () => {
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const previewCard = document.getElementById('previewCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const resolutionGroup = document.getElementById('resolutionGroup');
    const downloadWidgetContainer = document.getElementById('downloadWidgetContainer');

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

    // Update download iframe widget
    function updateDownloadWidget() {
        if (!currentVideoId) {
            downloadWidgetContainer.innerHTML = '';
            return;
        }
        
        // Clean standard YouTube link to send to widget
        const cleanUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
        const formatParam = activeFormat === 'audio' ? 'mp3' : activeQuality;
        
        // Render Savenow (formerly Loader.to) premium button widget
        downloadWidgetContainer.innerHTML = `
            <iframe src="https://p.savenow.to/api/button/?url=${encodeURIComponent(cleanUrl)}&f=${formatParam}&color=32ccc9" 
                    style="width: 100%; height: 60px; border: none; overflow: hidden; border-radius: 8px;" 
                    scrolling="no">
            </iframe>
        `;
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
            updateDownloadWidget();
        } else {
            currentVideoId = null;
            previewCard.classList.add('hidden');
            downloadWidgetContainer.innerHTML = '';
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
        updateDownloadWidget();
    });

    formatAudioBtn.addEventListener('click', () => {
        activeFormat = 'audio';
        formatAudioBtn.classList.add('active');
        formatVideoBtn.classList.remove('active');
        resolutionGroup.classList.add('hidden'); // Hide quality select for audio-only downloads
        updateDownloadWidget();
    });

    // Quality buttons selector
    const qualityButtons = document.querySelectorAll('.quality-btn');
    qualityButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            qualityButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeQuality = btn.getAttribute('data-quality');
            updateDownloadWidget();
        });
    });
});
