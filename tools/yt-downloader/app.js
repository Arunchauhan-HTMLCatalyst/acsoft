document.addEventListener('DOMContentLoaded', () => {
    const youtubeUrlInput = document.getElementById('youtubeUrl');
    const previewCard = document.getElementById('previewCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    
    // Engine Buttons
    const btnSavefrom = document.getElementById('btnSavefrom');
    const btnY2mate = document.getElementById('btnY2mate');
    const btnCobalt = document.getElementById('btnCobalt');

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
            
            // Standardize URL to clean standard watch link (removes tracking params)
            const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
            
            // Load YouTube high-res thumbnail with fallback to high-quality
            videoThumbnail.src = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
            videoThumbnail.onerror = () => {
                videoThumbnail.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            };

            // Pre-fill the download links dynamically for the engines
            btnSavefrom.href = `https://savefrom.net/?url=${encodeURIComponent(cleanUrl)}`;
            btnY2mate.href = `https://youtubepp.com/watch?v=${id}`;
            btnCobalt.href = `https://cobalt.tools/`;

            // Copy to clipboard helper on clicking Cobalt button
            btnCobalt.onclick = (e) => {
                navigator.clipboard.writeText(cleanUrl);
                // Simple feedback toast inside the button
                const origText = btnCobalt.querySelector('div').innerHTML;
                btnCobalt.querySelector('div').innerHTML = `
                    <div style="font-weight: 700; font-size: 0.88rem; color: var(--color-accent);">Copied URL to Clipboard!</div>
                    <div style="font-size: 0.7rem; color: var(--color-accent); font-weight: 500;">Now paste it inside the Cobalt window</div>
                `;
                setTimeout(() => {
                    btnCobalt.querySelector('div').innerHTML = origText;
                }, 2000);
            };

            previewCard.classList.remove('hidden');
        } else {
            currentVideoId = null;
            previewCard.classList.add('hidden');
        }
    });
});
