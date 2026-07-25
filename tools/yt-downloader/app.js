document.addEventListener('DOMContentLoaded', () => {
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const previewCard = document.getElementById('previewCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const resolutionGroup = document.getElementById('resolutionGroup');
    
    // Mirror buttons
    const mirror1 = document.getElementById('mirror1');
    const mirror2 = document.getElementById('mirror2');
    const mirror3 = document.getElementById('mirror3');

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

    // Update the link paths dynamically for direct download mirrors
    function updateMirrorLinks() {
        if (!currentVideoId) {
            mirror1.removeAttribute('href');
            mirror2.removeAttribute('href');
            mirror3.removeAttribute('href');
            return;
        }

        // itag 22 = 720p MP4, itag 18 = 360p MP4, itag 140 = M4A Audio
        const itag = activeFormat === 'audio' ? '140' : activeQuality;
        
        // Top 3 high-uptime public Invidious nodes
        const nodes = [
            'https://invidious.yewtu.be',
            'https://inv.tux.im',
            'https://invidious.projectsegfau.lt'
        ];

        // Map direct local=true proxy download paths
        mirror1.href = `${nodes[0]}/latest_version?id=${currentVideoId}&itag=${itag}&local=true`;
        mirror2.href = `${nodes[1]}/latest_version?id=${currentVideoId}&itag=${itag}&local=true`;
        mirror3.href = `${nodes[2]}/latest_version?id=${currentVideoId}&itag=${itag}&local=true`;
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
            
            updateMirrorLinks();
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
        updateMirrorLinks();
    });

    formatAudioBtn.addEventListener('click', () => {
        activeFormat = 'audio';
        formatAudioBtn.classList.add('active');
        formatVideoBtn.classList.remove('active');
        resolutionGroup.classList.add('hidden');
        updateMirrorLinks();
    });

    // Quality buttons selector
    const qualityButtons = document.querySelectorAll('.quality-btn');
    qualityButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            qualityButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeQuality = btn.getAttribute('data-quality');
            updateMirrorLinks();
        });
    });
});
