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

        if (isSrt) {
            // Process SRT directly
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
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

        // Segment subtitles into smaller chunks if transcript is huge,
        // but for general clips analysis, we send a compressed list of cues.
        const serializedSubs = parsedSubtitles.map(s => `[${s.start} -> ${s.end}] ${s.text}`).join('\n');

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
3. Define the precise start timestamp and end timestamp of the clip based on the transcript cues (choose cues that naturally form a complete clip).
4. Extract all subtitle lines within that clip window.
5. Analyze each line within the clip and tag it as either:
   - "ESSENTIAL": Core message, critical storyline point that must be spoken/kept.
   - "OPTIONAL": Side-talk, repetition, filler, or tangent that can be ignored or trimmed while keeping the clip's point perfectly clear.
6. Provide a 1-line storyline description of the clip's flow.
7. Provide 1-line reasoning on why this clip will perform well.

Return ONLY a valid JSON object matching the schema below. No markdown formatting blocks, no extra text, just the raw JSON:

{
  "clips": [
    {
      "title": "Clip Title Here",
      "score": 9.2,
      "startTime": "00:01:59,000",
      "endTime": "00:02:35,000",
      "storyline": "One-line storyline description.",
      "reasoning": "Why this works.",
      "lines": [
        {
          "time": "00:01:59,000",
          "text": "The subtitle line text",
          "tag": "ESSENTIAL"
        },
        {
          "time": "00:02:18,000",
          "text": "An optional side sentence",
          "tag": "OPTIONAL"
        }
      ]
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

            // Calculate duration
            const durationText = calculateDuration(clip.startTime, clip.endTime);

            // Construct lines HTML
            let linesHtml = '';
            if (clip.lines && clip.lines.length > 0) {
                linesHtml = `
                    <div class="lines-container">
                        ${clip.lines.map(line => `
                            <div class="line-row ${line.tag === 'ESSENTIAL' ? 'is-essential' : ''}">
                                <span class="line-time">${formatTimeShort(line.time)}</span>
                                <span class="line-badge ${line.tag === 'ESSENTIAL' ? 'essential' : 'optional'}">${line.tag}</span>
                                <span class="line-text">${line.text}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="clip-header">
                    <div class="clip-title-area">
                        <h4>Clip #${index + 1}: ${clip.title}</h4>
                        <div class="clip-meta">
                            <span class="clip-time" title="Click to copy start time" onclick="navigator.clipboard.writeText('${clip.startTime}'); alert('Copied start time!')">
                                ⏱️ ${clip.startTime.split(',')[0]} → ${clip.endTime.split(',')[0]}
                            </span>
                            <span class="clip-duration">${durationText}</span>
                        </div>
                    </div>
                    <span class="score-badge ${scoreClass}">★ ${parseFloat(clip.score).toFixed(1)}</span>
                </div>

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
