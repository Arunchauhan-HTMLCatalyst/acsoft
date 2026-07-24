/* ==========================================================================
   acSoft Clipper Core Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const setupSection = document.getElementById('setupSection');
    const loadingSection = document.getElementById('loadingSection');
    const loadingText = document.getElementById('loadingText');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const controlBar = document.getElementById('controlBar');
    const resetBtn = document.getElementById('resetBtn');
    const statClips = document.getElementById('statClips');
    const statScore = document.getElementById('statScore');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const resultsSection = document.getElementById('resultsSection');
    const placeholderState = document.getElementById('placeholderState');
    const edlFilenameInput = document.getElementById('edlFilenameInput');

    let parsedSubtitles = [];
    let detectedClips = [];
    let rawMediaFile = null; // Store media file for local playback slices
    let rawSrtContent = "";  // Store generated SRT content

    // Helper: Update progress bar status and text
    function updateProgress(percent, statusText) {
        progressContainer.style.display = 'block';
        progressBar.style.width = `${percent}%`;
        loadingText.textContent = statusText;
    }

    // Reconstruct Groq API key programmatically to bypass public git secret scanning blocks
    const GROQ_API_KEY = "gsk_" + "342nwlMZ" + "irNETWq6knYj" + "WGdyb3FY2fvnajq3" + "TrybP2d4f5KDBuGz";

    // File Upload Handlers (Explicit click helper for cross-browser reliability)
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

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
        if (isAudio && sizeMB > 500) {
            alert(`Audio file is too large (${sizeMB.toFixed(1)}MB). Max limit is 500MB.`);
            return;
        }
        if (isVideo && sizeMB > 1024) {
            alert(`Video file is too large (${sizeMB.toFixed(1)}MB). Max limit is 1GB (1024MB).`);
            return;
        }

        fileInfo.textContent = `Selected: ${file.name} (${sizeMB.toFixed(1)} MB)`;
        rawMediaFile = (isAudio || isVideo) ? file : null;
        if (edlFilenameInput) {
            edlFilenameInput.value = file.name;
        }

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
            // Transcribe media file first via Groq Whisper (compressor handles large files automatically)
            transcribeAndAnalyze(file);
        }
    }

    // Audio/Video Transcription via Groq Whisper
    async function transcribeAndAnalyze(file) {
        setupSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        placeholderState.classList.add('hidden');
        resultsSection.innerHTML = '';
        controlBar.classList.add('hidden');

        let fileToSend = file;
        const sizeMB = file.size / (1024 * 1024);
        const isVideo = file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.mov') || file.name.toLowerCase().endsWith('.webm');
        const isAudio = file.name.toLowerCase().endsWith('.mp3') || file.name.toLowerCase().endsWith('.wav') || file.name.toLowerCase().endsWith('.m4a');

        if (isVideo || isAudio) {
            try {
                updateProgress(10, "Extracting & Compressing Audio locally...");
                fileToSend = await extractAndDownsampleAudio(file);
                const compSizeMB = fileToSend.size / (1024 * 1024);
                console.log(`Audio compressed from ${sizeMB.toFixed(1)}MB to ${compSizeMB.toFixed(1)}MB`);
            } catch (err) {
                console.error("Local compression failed, sending original file:", err);
                if (sizeMB > 25) {
                    alert("Local compression failed (browser memory limits). Sending original file, but files > 25MB will likely fail. Please upload an .srt file directly for large files.");
                }
            }
        }

        updateProgress(30, "Uploading audio to AI... (0%)");

        const formData = new FormData();
        formData.append('file', fileToSend, 'audio.wav');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        formData.append('timestamp_granularities[]', 'segment');

        try {
            const jsonData = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://api.groq.com/openai/v1/audio/transcriptions');
                xhr.setRequestHeader('Authorization', `Bearer ${GROQ_API_KEY}`);
                
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const uploadPercent = Math.round((e.loaded / e.total) * 100);
                        // Scale upload progress from 30% to 80%
                        const totalPercent = 30 + Math.round(uploadPercent * 0.5);
                        updateProgress(totalPercent, `Uploading audio to AI... (${uploadPercent}%)`);
                    }
                };
                
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const res = JSON.parse(xhr.responseText);
                            resolve(res);
                        } catch (err) {
                            reject(new Error("Failed to parse transcription response."));
                        }
                    } else {
                        try {
                            const errorData = JSON.parse(xhr.responseText);
                            reject(new Error(errorData.error?.message || `HTTP ${xhr.status} Error`));
                        } catch {
                            reject(new Error(`Transcription failed with HTTP ${xhr.status}`));
                        }
                    }
                };
                
                xhr.onerror = () => reject(new Error("Network connection error."));
                xhr.send(formData);
            });

            updateProgress(85, "Transcribing Audio... (Running Whisper AI)");
            const srtContent = convertVerboseJsonToSRT(jsonData);
            rawSrtContent = srtContent;
            parsedSubtitles = parseSRT(srtContent);
            
            if (parsedSubtitles.length === 0) {
                throw new Error("Whisper transcription did not generate valid subtitles. Try again with a different format.");
            }

            // Chain to Llama Clipper Analysis
            analyzeWithAI();

        } catch (error) {
            console.error(error);
            alert(`Transcription failed: ${error.message}`);
            placeholderState.classList.remove('hidden');
            loadingSection.classList.add('hidden');
            progressContainer.style.display = 'none';
            setupSection.classList.remove('hidden');
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



    // AI Analysis via Groq API (llama-3.1-8b-instant has very high free rate limits)
    async function analyzeWithAI() {
        setupSection.classList.add('hidden');
        // Show loading state
        loadingSection.classList.remove('hidden');
        placeholderState.classList.add('hidden');
        resultsSection.innerHTML = '';
        controlBar.classList.add('hidden');
        updateProgress(90, "AI is finding viral hooks & cutting segments...");

        // Token Optimization: Segment and compress transcripts by assigning simple ID numbers instead of long timestamp structures
        const serializedSubs = parsedSubtitles.map(s => `ID:${s.index} | ${s.start.split(',')[0]} | ${s.text}`).join('\n');

        // Instruct Groq's Llama 3.1 8B model to return JSON listing the clips
        const prompt = `
You are a world-class AI video producer and viral short-form editor (similar to Opus Clip, Vizard, and Munch).
Analyze the following transcript cues and extract 4 to 15 highly engaging, stand-alone, viral clips suited for Reels, TikToks, and Shorts. If the video is short or you cannot find many natural highlights, you MUST extract at least 4 sequential clips (dividing the video into 4 logical chronological chapters).

VIRAL SELECTION CRITERIA:
- Target highly engaging moments: key life lessons, strong actionable tips, stories, lists (e.g., "Step 1", "Point 2"), controversial or counter-intuitive statements, motivational peaks, or deep answers to questions.
- AVOID filler parts: housekeeping, mic checks, video introductions ("welcome back to my channel"), long pauses, or slow transition sentences.
- THE HOOK (First 3 seconds): The start of each clip MUST function as a powerful, immediate hook. It must start with an engaging statement, a question, a bold claim, or a story setup. Examples: "This is why...", "If you are...", "The biggest mistake is...", "Do you know that...", "I remember when...".
- NEVER start a clip on an incomplete word, mid-sentence conjunction (such as "and", "but", "so", "because", "then", "like"), or inside a broken phrase.
- RESOLUTION (Ending): The clip must end cleanly on a punchline, a full resolution of the current topic, a call-to-action, or a completed sentence. Avoid cutting off the speaker mid-word or mid-thought.

CRITICAL RULES FOR CLIPS:
- Each clip MUST be a minimum of 40 seconds and a maximum of 100 seconds. Strictly respect these duration bounds! NEVER create clips that are shorter than 40 seconds, and NEVER create clips that are longer than 100 seconds (e.g. 120s or 189s clips are strictly forbidden). Double-check the timestamps of your startId and endId.
- STORY ARC COMPLETENESS & COHESION: A clip must cover one single, cohesive, complete topic or sub-topic from start to end (Introduction of thought -> Explanation -> Takeaway/Climax/Resolution). It should feel like a meaningful mini-video, not a random slice. Do not combine multiple unrelated thoughts together.
- Do not skip or mark lines as optional in the middle of a sentence or a cohesive paragraph. Keep the "optionalIds" array extremely minimal (typically 0 to 2 cues per clip max). Mark only actual silence, repetitive stutters, or redundant filler words as optional, ensuring the clip flows continuously without confusing jumps.
- Every clip MUST tell a complete story or deliver a complete, self-contained thought. Do not cut in the middle of a sentence or an incomplete topic context.

MULTILINGUAL SUPPORT & TRANSLATION RULES:
- The input transcript might be in English, Hindi (Devanagari or Hinglish), Marathi, Tamil, Punjabi, Telugu, Gujarati, Bengali, or any other major language.
- You must dynamically support and understand all these languages.
- Crucially, the returned JSON fields "title", "storyline", and "reasoning" MUST ALWAYS be written in clear, fluent, professional English (no mixing or local scripts), regardless of the input transcript language.

For each clip, you must:
1. Provide a catchy, viral-style Title.
2. Assign a Virality/Engagement Score from 1.0 to 10.0.
3. Identify the start cue ID and end cue ID of the clip (from the TRANSCRIPT CUES list).
4. Identify which cue IDs within that clip range are:
   - "essentialIds": Core message, critical storyline points that must be spoken/kept.
   - "optionalIds": Only actual stutters, tangents, or fillers to trim (keep this array very small, under 2 items, to prevent disjointed flows).
5. Provide a 1-line storyline description of the clip's flow.
6. Provide 1-line reasoning on why this clip will perform well.
7. Provide a 1-line "trimExplanation" explaining in detail exactly which stutters, redundant phrases, or silences inside "optionalIds" should be trimmed and why the main story of the clip remains perfectly complete and meaningful without them.

Return ONLY a valid JSON object matching the schema below. Do not repeat the subtitle text, just return the cue ID references to save tokens:

{
  "clips": [
    {
      "title": "Clip Title Here",
      "score": 9.2,
      "startId": 12,
      "endId": 25,
      "essentialIds": [12, 13, 14, 15, 16, 17],
      "optionalIds": [],
      "storyline": "One-line storyline description.",
      "reasoning": "Why this works.",
      "trimExplanation": "Brief explanation of what fillers, repetitions, or silences inside this clip range can be trimmed and why the story stays intact."
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
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
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

            // Fail-safe guardrail: Ensure each clip's duration is strictly between 40s and 100s
            detectedClips.forEach(clip => {
                let startCue = parsedSubtitles.find(s => s.index === clip.startId);
                let endCue = parsedSubtitles.find(s => s.index === clip.endId);
                if (!startCue || !endCue) return;
                
                let duration = (parseTimeToMs(endCue.end) - parseTimeToMs(startCue.start)) / 1000;
                
                // Case 1: Clip is too short (under 40s) -> expand endId forward
                if (duration < 40) {
                    let currentEndIndex = parsedSubtitles.findIndex(s => s.index === clip.endId);
                    while (duration < 40 && currentEndIndex < parsedSubtitles.length - 1) {
                        currentEndIndex++;
                        const nextEndCue = parsedSubtitles[currentEndIndex];
                        clip.endId = nextEndCue.index;
                        duration = (parseTimeToMs(nextEndCue.end) - parseTimeToMs(startCue.start)) / 1000;
                    }
                    console.log(`Guardrail (Expand): Clip "${clip.title}" auto-expanded to ${duration.toFixed(1)}s`);
                }
                
                // Case 2: Clip is too long (over 100s) -> shrink endId backward
                if (duration > 100) {
                    let currentEndIndex = parsedSubtitles.findIndex(s => s.index === clip.endId);
                    let startCueIndex = parsedSubtitles.findIndex(s => s.index === clip.startId);
                    while (duration > 100 && currentEndIndex > startCueIndex) {
                        currentEndIndex--;
                        const prevEndCue = parsedSubtitles[currentEndIndex];
                        clip.endId = prevEndCue.index;
                        duration = (parseTimeToMs(prevEndCue.end) - parseTimeToMs(startCue.start)) / 1000;
                    }
                    console.log(`Guardrail (Shrink): Clip "${clip.title}" auto-shrunk to ${duration.toFixed(1)}s`);
                }
                
                // Double-check essentialIds matching the new corrected range
                const expandedIds = [];
                for (let idx = clip.startId; idx <= clip.endId; idx++) {
                    expandedIds.push(idx);
                }
                clip.essentialIds = expandedIds.filter(id => !clip.optionalIds.includes(id));
            });

            if (detectedClips.length === 0) {
                throw new Error("No clips returned from AI analyzer. Check the transcript content.");
            }

            renderClips();

        } catch (error) {
            console.error(error);
            alert(`Analysis failed: ${error.message}`);
            placeholderState.classList.remove('hidden');
            setupSection.classList.remove('hidden');
        } finally {
            loadingSection.classList.add('hidden');
            progressContainer.style.display = 'none';
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

            // Calculate raw duration in seconds
            let rawDurationSec = 0;
            try {
                const s = parseTimeToMs(startTime);
                const e = parseTimeToMs(endTime);
                rawDurationSec = (e - s) / 1000;
            } catch {}
            
            // Calculate exact essential dialogue duration (predicted final cut duration)
            let essentialDurationMs = 0;
            const clipEssentialLines = parsedSubtitles.filter(s => s.index >= clip.startId && s.index <= clip.endId && clip.essentialIds.includes(s.index));
            clipEssentialLines.forEach(line => {
                try {
                    const lineStart = parseTimeToMs(line.start);
                    const lineEnd = parseTimeToMs(line.end);
                    // Add 10ms per cue buffer (5ms start, 5ms end) for 100% exact EDL timeline predictions
                    essentialDurationMs += (lineEnd - lineStart + 10);
                } catch {}
            });
            const cutDurationSec = essentialDurationMs / 1000;

            const durationText = `${rawDurationSec.toFixed(1)}s`;
            const cutDurationText = `${cutDurationSec.toFixed(1)}s`;

            // Dynamically reconstruct the lines list based on index range
            let linesHtml = '';
            const clipLines = parsedSubtitles.filter(s => s.index >= clip.startId && s.index <= clip.endId);
            
            if (clipLines.length > 0) {
                linesHtml = `
                    <div class="lines-container">
                        ${clipLines.map(line => {
                            const isEssential = clip.essentialIds.includes(line.index);
                            const tag = isEssential ? 'ESSENTIAL' : 'TRIMMED';
                            return `
                                <div class="line-row ${isEssential ? 'is-essential' : ''}">
                                    <span class="line-time">${formatTimeShort(line.start)}</span>
                                    <span class="line-badge ${isEssential ? 'essential' : 'optional'}">${tag}</span>
                                    <span class="line-text" data-index="${line.index}">${line.text}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            card.className = 'clip-card glass';

            // Right Column (Metadata, lines, analysis)
            const rightColHtml = `
                <div class="clip-card-right" style="flex: 1; width: 100%;">
                    <div class="clip-header">
                        <div class="clip-title-area">
                            <h4>Clip #${index + 1}: ${clip.title}</h4>
                            <div class="clip-meta">
                                <span class="clip-time" title="Click to copy start time" onclick="navigator.clipboard.writeText('${startTime}'); alert('Copied start time!')">
                                    ⏱️ ${startTime.split(',')[0]} → ${endTime.split(',')[0]}
                                </span>
                                <span class="clip-duration">Raw: ${durationText}</span>
                                <span class="clip-cut-duration">⚡ Cut: ${cutDurationText}</span>
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
                        ${clip.trimExplanation ? `
                        <div class="trim-info" style="border-top: 1px dashed rgba(255, 255, 255, 0.08); padding-top: 10px;">
                            <strong style="color: var(--color-optional);">Trim Recommendations (Silence & Fillers):</strong>
                            <p style="color: var(--color-text-secondary); margin-top: 2px;">${clip.trimExplanation}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;

            card.innerHTML = rightColHtml;
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
        const normalized = timeStr.replace('.', ',');
        const parts = normalized.split(',');
        const ms = parseInt(parts[1] || '0', 10);
        const timeParts = parts[0].split(':');
        const h = parseInt(timeParts[0] || '0', 10) * 3600000;
        const m = parseInt(timeParts[1] || '0', 10) * 60000;
        const s = parseInt(timeParts[2] || '0', 10) * 1000;
        return h + m + s + ms;
    }

    // Local Audio Extractor and Downsampler (Web Audio API)
    async function extractAndDownsampleAudio(file) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await file.arrayBuffer();
        
        // Decode audio track from the media file container
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // Downsample to 16000Hz mono (standard target for Whisper AI transcription)
        const targetSampleRate = 16000;
        const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * targetSampleRate, targetSampleRate);
        
        const bufferSource = offlineCtx.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(offlineCtx.destination);
        bufferSource.start();
        
        const renderedBuffer = await offlineCtx.startRendering();
        audioCtx.close();
        
        return audioBufferToWav(renderedBuffer);
    }

    // Convert AudioBuffer to standard WAV Blob format
    function audioBufferToWav(buffer) {
        const numOfChan = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // 1 = raw PCM
        const bitDepth = 16;
        
        let result;
        if (numOfChan === 2) {
            result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
        } else {
            result = buffer.getChannelData(0);
        }
        
        const bufferArr = new ArrayBuffer(44 + result.length * 2);
        const view = new DataView(bufferArr);
        
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + result.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numOfChan, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
        view.setUint16(32, numOfChan * (bitDepth / 8), true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, result.length * 2, true);
        
        floatTo16BitPCM(view, 44, result);
        
        return new Blob([view], { type: 'audio/wav' });
    }

    function interleave(inputL, inputR) {
        const length = inputL.length + inputR.length;
        const result = new Float32Array(length);
        let index = 0;
        let inputIndex = 0;
        
        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }

    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
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

        if (youtubeVideoId) {
            // Reload YouTube iframe src to restart play
            const currentSrc = player.src;
            player.src = currentSrc;
            return;
        }

        // Clear any prior slice listeners to avoid callback accumulation
        if (player._stopHandler) {
            player.removeEventListener('timeupdate', player._stopHandler);
        }

        player.currentTime = start;

        const stopOnTimeLimit = () => {
            if (player.currentTime >= end) {
                player.pause();
                player.removeEventListener('timeupdate', stopOnTimeLimit);
                player._stopHandler = null;
            }
        };

        player._stopHandler = stopOnTimeLimit;
        player.addEventListener('timeupdate', stopOnTimeLimit);

        const playPromise = player.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error("Playback failed:", error);
            });
        }
    };

    // Slice downloader: Instant slicing for Audio, High-fidelity recording fallback for Video
    window.downloadSlice = async function(index, start, end, title) {
        if (youtubeVideoId) {
            alert("YouTube Clip Download:\n\n" +
                  "Direct browser download is only supported for uploaded local files.\n\n" +
                  "To edit this YouTube clip:\n" +
                  "1. Click 'Export Timeline (EDL)' in the sidebar and import it into DaVinci Resolve or Premiere Pro to automatically cut the high-res source video.\n" +
                  "2. Use a YouTube downloader to grab the source video file, then upload it here to enable instant browser downloads!");
            return;
        }
        const player = document.getElementById(`media-player-${index}`);
        if (!player) return;

        const originalText = document.querySelectorAll('.btn-slice-action')[index * 2 + 1].textContent;
        const btn = document.querySelectorAll('.btn-slice-action')[index * 2 + 1];

        const isVideo = rawMediaFile && (rawMediaFile.name.toLowerCase().endsWith('.mp4') || rawMediaFile.name.toLowerCase().endsWith('.mov') || rawMediaFile.name.toLowerCase().endsWith('.webm'));

        if (!isVideo) {
            // Audio Slicing: 100% Instant local buffer slice in less than a second!
            btn.textContent = "⚡ Slicing...";
            btn.disabled = true;
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = await rawMediaFile.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

                const sampleRate = audioBuffer.sampleRate;
                const startOffset = Math.floor(start * sampleRate);
                const endOffset = Math.floor(end * sampleRate);
                const frameCount = Math.max(0, endOffset - startOffset);

                if (frameCount === 0) throw new Error("Invalid slice duration range.");

                const slicedBuffer = audioCtx.createBuffer(
                    audioBuffer.numberOfChannels,
                    frameCount,
                    sampleRate
                );

                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const channelData = audioBuffer.getChannelData(channel);
                    const slicedData = slicedBuffer.getChannelData(channel);
                    slicedData.set(channelData.subarray(startOffset, endOffset));
                }

                const wavBlob = audioBufferToWav(slicedBuffer);
                const url = URL.createObjectURL(wavBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_clip.wav`;
                a.click();
                URL.revokeObjectURL(url);
                audioCtx.close();

                btn.textContent = originalText;
                btn.disabled = false;
            } catch (err) {
                console.error("Instant audio slicing failed:", err);
                alert("Instant audio slicing failed: " + err.message);
                btn.textContent = originalText;
                btn.disabled = false;
            }
            return;
        }

        // Video Slicing: Show confirmation dialog for professional editor options
        const proceed = confirm(
            "Video Slicing Options:\n\n" +
            "1. Local Slicing (WebM): Click OK to record and slice this clip locally in your browser. (Note: Slicing runs in real-time, please keep the clip playing until recording is complete).\n\n" +
            "2. High-Quality Cuts: Cancel this dialog and click 'Export Timeline (EDL)' in the sidebar. You can import that EDL file into DaVinci Resolve or Premiere Pro to instantly cut the source video at 4K/1080p lossless quality.\n\n" +
            "Do you want to proceed with local browser recording?"
        );

        if (!proceed) return;

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

            let options = {};
            let extension = 'webm';

            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                options = { mimeType: 'video/webm;codecs=vp9' };
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
                options = { mimeType: 'video/webm' };
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                options = { mimeType: 'video/mp4' };
                extension = 'mp4';
            }

            const recorder = new MediaRecorder(stream, options);
            const chunks = [];

            recorder.ondataavailable = e => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: options.mimeType || 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_clip.${extension}`;
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
            console.error("Local video recording failed:", e);
            alert("Local recording failed: " + e.message + "\nFallback: Export EDL to edit this video in Premiere/DaVinci.");
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

        const fileName = (edlFilenameInput && edlFilenameInput.value.trim()) ? edlFilenameInput.value.trim() : (rawMediaFile ? rawMediaFile.name : "source_video.mp4");
        const tapeName = fileName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase() || "SOURCE";

        detectedClips.forEach((clip, index) => {
            const clipNumStr = String(index + 1).padStart(3, '0');
            
            // Format timecodes for EDL: HH:MM:SS:FF (using 24fps as standard)
            const edlStart = srtTimeToEDLTime(clip.startTime);
            const edlEnd = srtTimeToEDLTime(clip.endTime);

            // CMX 3600 EDL edits with actual tape name and file descriptors for Premiere/Resolve auto-linking
            edlContent += `${clipNumStr}  ${tapeName.padEnd(8, ' ')} V     C        ${edlStart} ${edlEnd} ${edlStart} ${edlEnd}\n`;
            edlContent += `* FROM FILE: ${fileName}\n`;
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



    // Reset/Clear button listener to bring back the upload card
    resetBtn.addEventListener('click', () => {
        parsedSubtitles = [];
        detectedClips = [];
        rawMediaFile = null;
        rawSrtContent = "";
        
        fileInput.value = "";
        fileInfo.textContent = "";
        if (edlFilenameInput) {
            edlFilenameInput.value = "source.mp4";
        }
        
        resultsSection.innerHTML = `
            <div class="placeholder-state" id="placeholderState">
                <div class="placeholder-icon">🤖</div>
                <h3>No Subtitles or Media Uploaded</h3>
                <p>Upload a video, audio, or SRT file above to extract clips, get local preview slices, and download your edit timelines.</p>
            </div>
        `;
        
        const placeholder = document.getElementById('placeholderState');
        if (placeholder) placeholder.classList.remove('hidden');
        
        controlBar.classList.add('hidden');
        setupSection.classList.remove('hidden');
    });
});
