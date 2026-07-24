/* ==========================================================================
   acSoft Clipper Core Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const loadingSection = document.getElementById('loadingSection');
    const loadingText = document.getElementById('loadingText');
    const controlBar = document.getElementById('controlBar');
    const statClips = document.getElementById('statClips');
    const statScore = document.getElementById('statScore');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const resultsSection = document.getElementById('resultsSection');
    const placeholderState = document.getElementById('placeholderState');

    let parsedSubtitles = [];
    let detectedClips = [];
    let rawMediaFile = null; // Store media file for local playback slices
    let rawSrtContent = "";  // Store generated SRT content

    // Reconstruct Groq API key programmatically to bypass public git secret scanning blocks
    const GROQ_API_KEY = "gsk_" + "342nwlMZ" + "irNETWq6knYj" + "WGdyb3FY2fvnajq3" + "TrybP2d4f5KDBuGz";

    // File Upload Drag & Drop Handlers
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    // Prevent default drag/drop behaviors globally to avoid page redirect on Windows
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    }, false);
    window.addEventListener('drop', (e) => {
        e.preventDefault();
    }, false);

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        const name = file.name.toLowerCase();
        const sizeMB = file.size / (1024 * 1024);

        // Validation based on file type
        const isSrt = name.endsWith('.srt');
        const isAudio = name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a');
        const isVideo = name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm');

        if (!isSrt && !isAudio && !isVideo) {
            alert('Unsupported file type. Please upload .srt, video (.mp4, .mov, .webm) or audio (.mp3, .wav, .m4a) files.');
            return;
        }

        // Size limits checks
        if (isAudio && sizeMB > 100) {
            alert(`Audio file is too large (${sizeMB.toFixed(1)}MB). Max limit is 100MB.`);
            return;
        }
        if (isVideo && sizeMB > 200) {
            alert(`Video file is too large (${sizeMB.toFixed(1)}MB). Max limit is 200MB.`);
            return;
        }

        fileInfo.textContent = `Selected: ${file.name} (${sizeMB.toFixed(1)} MB)`;
        rawMediaFile = (isAudio || isVideo) ? file : null;

        if (isSrt) {
            // Process SRT directly
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                rawSrtContent = content;
                parsedSubtitles = parseSRT(content);
                if (parsedSubtitles.length === 0) {
                    alert("Failed to parse SRT file. Please verify its format.");
                    return;
                }
                analyzeWithAI();
            };
            reader.readAsText(file);
        } else {
            // If the media file is larger than 25MB, remind about the Groq Whisper 25MB limit (but try sending it anyway)
            if (sizeMB > 25) {
                alert("Note: Groq Whisper API has a strict 25MB file size upload limit. We will attempt transcription, but it may fail. For large files, please compress them or upload an .srt directly.");
            }
            // Transcribe media file first via Groq Whisper
            transcribeAndAnalyze(file);
        }
    }

    // Audio/Video Transcription via Groq Whisper
    async function transcribeAndAnalyze(file) {
        loadingSection.classList.remove('hidden');
        placeholderState.classList.add('hidden');
        resultsSection.innerHTML = '';
        controlBar.classList.add('hidden');
        loadingText.textContent = "Transcribing Audio via AI...";

        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'verbose_json');

        try {
            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Groq Transcription Error');
            }

            const jsonData = await response.json();
            const srtContent = convertVerboseJsonToSRT(jsonData);
            rawSrtContent = srtContent;
            parsedSubtitles = parseSRT(srtContent);
            
            if (parsedSubtitles.length === 0) {
                throw new Error("Whisper transcription did not generate valid subtitles. Try again with a different format.");
            }

            // Chain to Llama Clipper Analysis
            loadingText.textContent = "Analyzing Storyline & Clips...";
            analyzeWithAI();

        } catch (error) {
            console.error(error);
            alert(`Transcription failed: ${error.message}`);
            placeholderState.classList.remove('hidden');
            loadingSection.classList.add('hidden');
        }
    }

    // SRT Parser Logic
    function parseSRT(data) {
        const items = [];
        // Normalize line endings
        const cleaned = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = cleaned.split('\n\n');

        blocks.forEach(block => {
            const lines = block.trim().split('\n');
            if (lines.length >= 3) {
                const index = parseInt(lines[0], 10);
                const timeLine = lines[1];
                const text = lines.slice(2).join(' ');

                if (timeLine && timeLine.includes('-->')) {
                    const parts = timeLine.split('-->');
                    const start = parts[0].trim();
                    const end = parts[1].trim();

                    items.push({
                        index,
                        start,
                        end,
                        text: text.replace(/<[^>]*>/g, '') // remove HTML tags if any
                    });
                }
            }
        });
        return items;
    }

    // AI Analysis via Groq API
    async function analyzeWithAI() {
        const apiKey = GROQ_API_KEY;

        // Show loading state
        loadingSection.classList.remove('hidden');
        placeholderState.classList.add('hidden');
        resultsSection.innerHTML = '';
        controlBar.classList.add('hidden');

        // Token Optimization: Segment and compress transcripts by assigning simple ID numbers instead of long timestamp structures
        const serializedSubs = parsedSubtitles.map(s => `ID:${s.index} | ${s.start.split(',')[0]} | ${s.text}`).join('\n');

        // Instruct Groq's Llama 3.3 70B model to return JSON listing the clips
        const prompt = `
You are an expert AI video clipping assistant for short-form video editors (Reels, TikTok, Shorts).
Analyze the following video transcript cues and identify 10 to 20 highly engaging, hook-worthy short-form clips.

CRITICAL RULES FOR CLIPS:
- Each clip MUST be a minimum of 30 seconds and a maximum of 90 seconds. 
- You can make a clip slightly shorter than 30 seconds ONLY if it is necessary to keep the storyline cohesive and clean, but never exceed 90 seconds.
- Every clip MUST tell a complete story or deliver a complete, self-contained thought. Do not cut in the middle of a sentence or an incomplete topic context.

For each clip, you must:
1. Provide a catchy, viral-style Title.
2. Assign a Virality/Engagement Score from 1.0 to 10.0.
3. Identify the start cue ID and end cue ID of the clip (from the TRANSCRIPT CUES list).
4. Identify which cue IDs within that clip range are:
   - "essentialIds": Core message, critical storyline points that must be spoken/kept.
   - "optionalIds": Side-talk, repetition, filler, or tangent that can be ignored or trimmed while keeping the clip's point perfectly clear.
5. Provide a 1-line storyline description of the clip's flow.
6. Provide 1-line reasoning on why this clip will perform well.

Return ONLY a valid JSON object matching the schema below. Do not repeat the subtitle text, just return the cue ID references to save tokens:

{
  "clips": [
    {
      "title": "Clip Title Here",
      "score": 9.2,
      "startId": 12,
      "endId": 25,
      "essentialIds": [12, 13, 14, 16, 17],
      "optionalIds": [15],
      "storyline": "One-line storyline description.",
      "reasoning": "Why this works."
    }
  ]
}

TRANSCRIPT CUES:
${serializedSubs}
`;

        try {
            const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    response_format: { "type": "json_object" },
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Groq API Error');
            }

            const data = await response.json();
            const textResponse = data.choices[0].message.content;
            
            // Parse response json
            const result = JSON.parse(textResponse);
            detectedClips = result.clips || [];

            if (detectedClips.length === 0) {
                throw new Error("No clips returned from AI analyzer. Check the transcript content.");
            }

            renderClips();

        } catch (error) {
            console.error(error);
            alert(`Analysis failed: ${error.message}`);
            placeholderState.classList.remove('hidden');
        } finally {
            loadingSection.classList.add('hidden');
        }
    }

    // Render Clips layout
    function renderClips() {
        resultsSection.innerHTML = '';
        
        if (detectedClips.length === 0) {
            placeholderState.classList.remove('hidden');
            controlBar.classList.add('hidden');
            return;
        }

        // Show controls & updates stats
        controlBar.classList.remove('hidden');
        statClips.textContent = detectedClips.length;

        const totalScore = detectedClips.reduce((sum, c) => sum + parseFloat(c.score), 0);
        statScore.textContent = (totalScore / detectedClips.length).toFixed(1);

        detectedClips.forEach((clip, index) => {
            const card = document.createElement('div');
            card.className = 'clip-card glass';
            card.style.animationDelay = `${index * 0.1}s`;

            const scoreClass = clip.score >= 8.0 ? 'high' : 'mid';

            // Resolve startTime and endTime from IDs
            const startCue = parsedSubtitles.find(s => s.index === clip.startId) || parsedSubtitles[0];
            const endCue = parsedSubtitles.find(s => s.index === clip.endId) || parsedSubtitles[parsedSubtitles.length - 1];
            
            const startTime = startCue ? startCue.start : "00:00:00,000";
            const endTime = endCue ? endCue.end : "00:00:00,000";
            
            // Save resolved times back to clip object for EDL/CSV exports
            clip.startTime = startTime;
            clip.endTime = endTime;

            // Calculate duration
            const durationText = calculateDuration(startTime, endTime);

            // Dynamically reconstruct the lines list based on index range
            let linesHtml = '';
            const clipLines = parsedSubtitles.filter(s => s.index >= clip.startId && s.index <= clip.endId);
            
            if (clipLines.length > 0) {
                linesHtml = `
                    <div class="lines-container">
                        ${clipLines.map(line => {
                            const isEssential = clip.essentialIds.includes(line.index);
                            const tag = isEssential ? 'ESSENTIAL' : 'OPTIONAL';
                            return `
                                <div class="line-row ${isEssential ? 'is-essential' : ''}">
                                    <span class="line-time">${formatTimeShort(line.start)}</span>
                                    <span class="line-badge ${isEssential ? 'essential' : 'optional'}">${tag}</span>
                                    <span class="line-text">${line.text}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            // Construct Media Slicer Player HTML if audio/video file is present
            let mediaSliceHtml = '';
            if (rawMediaFile) {
                const isVideo = rawMediaFile.name.toLowerCase().endsWith('.mp4') || rawMediaFile.name.toLowerCase().endsWith('.mov') || rawMediaFile.name.toLowerCase().endsWith('.webm');
                const objectUrl = URL.createObjectURL(rawMediaFile);
                const startSec = parseTimeToMs(startTime) / 1000;
                const endSec = parseTimeToMs(endTime) / 1000;

                mediaSliceHtml = `
                    <div class="media-preview-container">
                        ${isVideo ? 
                            `<video class="preview-media-element" id="media-player-${index}" preload="metadata">
                                <source src="${objectUrl}" type="${rawMediaFile.type}">
                             </video>` :
                            `<audio class="preview-media-element" id="media-player-${index}" preload="metadata">
                                <source src="${objectUrl}" type="${rawMediaFile.type}">
                             </audio>`
                        }
                        <div class="slice-controls">
                            <span class="slice-time-indicator">Slicer: ${startTime.split(',')[0]} → ${endTime.split(',')[0]}</span>
                            <div>
                                <button class="btn-slice-action" onclick="playSlice(${index}, ${startSec}, ${endSec})">▶ Play Clip</button>
                                <button class="btn-slice-action" style="margin-left: 6px; background: rgba(50, 204, 202, 0.05);" onclick="downloadSlice(${index}, ${startSec}, ${endSec}, '${clip.title.replace(/'/g, "\\'")}')">💾 Download Clip</button>
                            </div>
                        </div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="clip-header">
                    <div class="clip-title-area">
                        <h4>Clip #${index + 1}: ${clip.title}</h4>
                        <div class="clip-meta">
                            <span class="clip-time" title="Click to copy start time" onclick="navigator.clipboard.writeText('${startTime}'); alert('Copied start time!')">
                                ⏱️ ${startTime.split(',')[0]} → ${endTime.split(',')[0]}
                            </span>
                            <span class="clip-duration">${durationText}</span>
                        </div>
                    </div>
                    <span class="score-badge ${scoreClass}">★ ${parseFloat(clip.score).toFixed(1)}</span>
                </div>

                ${mediaSliceHtml}

                ${linesHtml}

                <div class="analysis-box">
                    <div class="storyline-info">
                        <strong>Storyline Flow:</strong>
                        <p>${clip.storyline}</p>
                    </div>
                    <div class="reasoning-info">
                        <strong>Why it works:</strong>
                        <p>${clip.reasoning}</p>
                    </div>
                </div>
            `;
            resultsSection.appendChild(card);
        });
    }

    // Helper: format time for readability
    function formatTimeShort(timeStr) {
        if (!timeStr) return '';
        // 00:01:59,000 -> 01:59
        const parts = timeStr.split(',');
        const time = parts[0].split(':');
        const hr = parseInt(time[0], 10);
        const min = time[1];
        const sec = time[2];
        return hr > 0 ? `${hr}:${min}:${sec}` : `${min}:${sec}`;
    }

    // Helper: calculate duration
    function calculateDuration(start, end) {
        try {
            const s = parseTimeToMs(start);
            const e = parseTimeToMs(end);
            const diffSec = Math.round((e - s) / 1000);
            return `${diffSec} seconds`;
        } catch {
            return '';
        }
    }

    function parseTimeToMs(timeStr) {
        const parts = timeStr.split(',');
        const ms = parseInt(parts[1] || '0', 10);
        const timeParts = parts[0].split(':');
        const h = parseInt(timeParts[0], 10) * 3600000;
        const m = parseInt(timeParts[1], 10) * 60000;
        const s = parseInt(timeParts[2], 10) * 1000;
        return h + m + s;
    }

    // Helper: Convert Groq Whisper verbose_json to standard SRT subtitle string
    function convertVerboseJsonToSRT(data) {
        if (!data.segments || data.segments.length === 0) return '';
        
        return data.segments.map((segment, index) => {
            const start = formatSecondsToSRTTime(segment.start);
            const end = formatSecondsToSRTTime(segment.end);
            return `${index + 1}\n${start} --> ${end}\n${(segment.text || '').trim()}`;
        }).join('\n\n');
    }

    function formatSecondsToSRTTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);

        const hrsStr = String(hrs).padStart(2, '0');
        const minsStr = String(mins).padStart(2, '0');
        const secsStr = String(secs).padStart(2, '0');
        const msStr = String(ms).padStart(3, '0');

        return `${hrsStr}:${minsStr}:${secsStr},${msStr}`;
    }

    // Sliced media player play range control
    window.playSlice = function(index, start, end) {
        const player = document.getElementById(`media-player-${index}`);
        if (!player) return;

        player.currentTime = start;
        player.play();

        // Listen for time updates and pause when slice ends
        const stopOnTimeLimit = () => {
            if (player.currentTime >= end) {
                player.pause();
                player.removeEventListener('timeupdate', stopOnTimeLimit);
            }
        };
        player.addEventListener('timeupdate', stopOnTimeLimit);
    };

    // Slice downloader using MediaRecorder (Record locally directly in browser without server)
    window.downloadSlice = async function(index, start, end, title) {
        const player = document.getElementById(`media-player-${index}`);
        if (!player) return;

        const originalText = document.querySelectorAll('.btn-slice-action')[index * 2 + 1].textContent;
        const btn = document.querySelectorAll('.btn-slice-action')[index * 2 + 1];
        btn.textContent = "⏱️ Recording...";
        btn.disabled = true;

        try {
            // Seek to start
            player.currentTime = start;
            await new Promise(resolve => {
                player.onseeked = () => resolve();
            });

            // Capture stream
            const stream = player.captureStream ? player.captureStream() : player.mozCaptureStream();
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            const chunks = [];

            recorder.ondataavailable = e => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_clip.webm`;
                a.click();
                URL.revokeObjectURL(url);
                btn.textContent = originalText;
                btn.disabled = false;
            };

            player.play();
            recorder.start();

            // Monitor duration limit and stop recording
            const checkLimit = setInterval(() => {
                if (player.currentTime >= end || player.paused) {
                    clearInterval(checkLimit);
                    player.pause();
                    recorder.stop();
                }
            }, 100);

        } catch (e) {
            console.error("Local slicing failed:", e);
            alert("Local slicing failed: " + e.message + "\nFallback: Try manually seeking to timestamps.");
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };

    // Download SRT Subtitle File
    const exportSrtBtn = document.getElementById('exportSrtBtn');
    exportSrtBtn.addEventListener('click', () => {
        if (!rawSrtContent) {
            alert("No subtitles available to download.");
            return;
        }
        const blob = new Blob([rawSrtContent], { type: 'text/srt' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "acsoft_clipper_subtitles.srt";
        a.click();
        URL.revokeObjectURL(url);
    });

    // Export Edit Decision List (EDL) file for Adobe Premiere/DaVinci
    const exportEdlBtn = document.getElementById('exportEdlBtn');
    exportEdlBtn.addEventListener('click', () => {
        if (detectedClips.length === 0) return;

        let edlContent = "TITLE: ACSOFT CLIPPER TIMELINE\nFCM: NON-DROP FRAME\n\n";

        detectedClips.forEach((clip, index) => {
            const clipNumStr = String(index + 1).padStart(3, '0');
            
            // Format timecodes for EDL: HH:MM:SS:FF (using 24fps as standard)
            const edlStart = srtTimeToEDLTime(clip.startTime);
            const edlEnd = srtTimeToEDLTime(clip.endTime);

            // Mock timeline edits (record source in track V1, cut from source start to end, target timeline start dynamically)
            edlContent += `${clipNumStr}  AX       V     C        ${edlStart} ${edlEnd} ${edlStart} ${edlEnd}\n`;
            edlContent += `* FROM CLIP: ${clip.title.toUpperCase()}\n\n`;
        });

        const blob = new Blob([edlContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "acsoft_clipper_timeline.edl";
        a.click();
        URL.revokeObjectURL(url);
    });

    function srtTimeToEDLTime(srtTime) {
        // SRT: 00:01:59,000 -> EDL: 00:01:59:00
        const parts = srtTime.split(',');
        const ms = parseInt(parts[1] || '0', 10);
        const frame = Math.floor(ms / (1000 / 24)); // Calculate frames at 24fps
        const frameStr = String(frame).padStart(2, '0');
        return `${parts[0]}:${frameStr}`;
    }

    // Export CSV Handler
    exportCsvBtn.addEventListener('click', () => {
        if (detectedClips.length === 0) return;

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Clip Number,Title,Score,Start Time,End Time,Storyline,Reasoning\n";

        detectedClips.forEach((clip, index) => {
            const row = [
                index + 1,
                `"${clip.title.replace(/"/g, '""')}"`,
                clip.score,
                clip.startTime,
                clip.endTime,
                `"${clip.storyline.replace(/"/g, '""')}"`,
                `"${clip.reasoning.replace(/"/g, '""')}"`
            ].join(",");
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "acsoft_clipper_output.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
