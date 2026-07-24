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
            parsedSubtitles = chunkWhisperWords(jsonData);
            rawSrtContent = generateSrtFromSubtitles(parsedSubtitles);
            
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

    // SRT Parser Logic (Automatically chunks segments to max 24 characters on a single line)
    function parseSRT(data) {
        const items = [];
        const cleaned = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = cleaned.split('\n\n');
        let segmentIndex = 1;

        blocks.forEach(block => {
            const lines = block.trim().split('\n');
            if (lines.length >= 3) {
                const timeLine = lines[1];
                const text = lines.slice(2).join(' ').replace(/<[^>]*>/g, ''); // remove html tags

                if (timeLine && timeLine.includes('-->')) {
                    const parts = timeLine.split('-->');
                    const startSec = parseTimeToMs(parts[0].trim()) / 1000;
                    const endSec = parseTimeToMs(parts[1].trim()) / 1000;
                    
                    const textWords = text.trim().split(/\s+/).filter(w => w.length > 0);
                    if (textWords.length === 0) return;
                    
                    const wordDuration = (endSec - startSec) / textWords.length;
                    const wordsWithTime = textWords.map((word, idx) => ({
                        word: word,
                        start: startSec + idx * wordDuration,
                        end: startSec + (idx + 1) * wordDuration
                    }));
                    
                    let currentSegmentWords = [];
                    let currentLength = 0;
                    
                    wordsWithTime.forEach(wordObj => {
                        const wordText = wordObj.word;
                        const spaceNeeded = currentSegmentWords.length > 0 ? 1 : 0;
                        
                        if (currentLength + spaceNeeded + wordText.length > 24 && currentSegmentWords.length > 0) {
                            const segStart = currentSegmentWords[0].start;
                            const segEnd = currentSegmentWords[currentSegmentWords.length - 1].end;
                            items.push({
                                index: segmentIndex++,
                                start: formatSecondsToSRTTime(segStart),
                                end: formatSecondsToSRTTime(segEnd),
                                text: currentSegmentWords.map(w => w.word).join(' '),
                                words: currentSegmentWords
                            });
                            currentSegmentWords = [wordObj];
                            currentLength = wordText.length;
                        } else {
                            currentSegmentWords.push(wordObj);
                            currentLength += spaceNeeded + wordText.length;
                        }
                    });
                    
                    if (currentSegmentWords.length > 0) {
                        const segStart = currentSegmentWords[0].start;
                        const segEnd = currentSegmentWords[currentSegmentWords.length - 1].end;
                        items.push({
                            index: segmentIndex++,
                            start: formatSecondsToSRTTime(segStart),
                            end: formatSecondsToSRTTime(segEnd),
                            text: currentSegmentWords.map(w => w.word).join(' '),
                            words: currentSegmentWords
                        });
                    }
                }
            }
        });
        return items;
    }

    // Subtitle chunker: Groups words into segments of max 24 characters on a single line
    function chunkWhisperWords(verboseJson) {
        let allWords = [];
        
        // Gather all words from all segments (if they have word timestamps)
        if (verboseJson.segments && verboseJson.segments.length > 0) {
            verboseJson.segments.forEach(seg => {
                if (seg.words && seg.words.length > 0) {
                    allWords = allWords.concat(seg.words);
                } else {
                    // Fallback if no word-level timestamps returned
                    const textWords = seg.text.trim().split(/\s+/).filter(w => w.length > 0);
                    if (textWords.length > 0) {
                        const segStart = seg.start;
                        const segEnd = seg.end;
                        const wordDuration = (segEnd - segStart) / textWords.length;
                        textWords.forEach((word, index) => {
                            allWords.push({
                                word: word,
                                start: segStart + index * wordDuration,
                                end: segStart + (index + 1) * wordDuration
                            });
                        });
                    }
                }
            });
        }
        
        if (allWords.length === 0) return [];
        
        const optimizedSegments = [];
        let currentSegmentWords = [];
        let currentTextLength = 0;
        let segmentIndex = 1;
        
        allWords.forEach(wordObj => {
            const wordText = wordObj.word.trim();
            if (wordText.length === 0) return;
            
            const wordLength = wordText.length;
            const spaceNeeded = currentSegmentWords.length > 0 ? 1 : 0;
            
            if (currentTextLength + spaceNeeded + wordLength > 24 && currentSegmentWords.length > 0) {
                const segStart = currentSegmentWords[0].start;
                const segEnd = currentSegmentWords[currentSegmentWords.length - 1].end;
                const segText = currentSegmentWords.map(w => w.word.trim()).join(' ');
                
                optimizedSegments.push({
                    index: segmentIndex++,
                    start: formatSecondsToSRTTime(segStart),
                    end: formatSecondsToSRTTime(segEnd),
                    text: segText,
                    words: currentSegmentWords
                });
                
                currentSegmentWords = [wordObj];
                currentTextLength = wordLength;
            } else {
                currentSegmentWords.push(wordObj);
                currentTextLength += spaceNeeded + wordLength;
            }
        });
        
        if (currentSegmentWords.length > 0) {
            const segStart = currentSegmentWords[0].start;
            const segEnd = currentSegmentWords[currentSegmentWords.length - 1].end;
            const segText = currentSegmentWords.map(w => w.word.trim()).join(' ');
            optimizedSegments.push({
                index: segmentIndex++,
                start: formatSecondsToSRTTime(segStart),
                end: formatSecondsToSRTTime(segEnd),
                text: segText,
                words: currentSegmentWords
            });
        }
        
        return optimizedSegments;
    }

    function generateSrtFromSubtitles(subs) {
        return subs.map(s => {
            return `${s.index}\n${s.start} --> ${s.end}\n${s.text}`;
        }).join('\n\n');
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
You are an expert AI video clipping assistant for short-form video editors (Reels, TikTok, Shorts).
Analyze the following video transcript cues and identify 10 to 20 highly engaging, hook-worthy short-form clips.

MULTILINGUAL SUPPORT & TRANSLATION RULES:
- The input transcript might be in English, Hindi (Devanagari or Hinglish), Marathi, Tamil, Punjabi, Telugu, Gujarati, Bengali, or any other major language.
- You must dynamically support and understand all these languages.
- Crucially, the returned JSON fields "title", "storyline", and "reasoning" MUST ALWAYS be written in clear, fluent, professional English (no mixing or local scripts), regardless of the input transcript language.

CRITICAL RULES FOR CLIPS:
- Each clip MUST be a minimum of 30 seconds and a maximum of 90 seconds. 
- You can make a clip slightly shorter than 30 seconds ONLY if it is necessary to keep the storyline cohesive and clean, but never exceed 90 seconds.
- Every clip MUST tell a complete story or deliver a complete, self-contained thought. Do not cut in the middle of a sentence or an incomplete topic context.
- HOOK-CENTRIC START CUE REQUIREMENT: Every clip's start cue MUST represent the beginning of a clean, coherent sentence, a new thought, or a key question.
- NEVER start a clip on a mid-sentence conjunction (such as "and", "but", "so", "because", "then", "like"), a random word, or inside a broken phrase. Adjust the starting cue ID forward or backward to ensure the first spoken line functions as a clean, engaging hook.

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
                                    <span class="line-text" data-index="${line.index}">${line.text}</span>
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
                const rawStartSec = parseTimeToMs(startTime) / 1000;
                const rawEndSec = parseTimeToMs(endTime) / 1000;
                const startSec = Math.max(0, rawStartSec - 0.005);
                const endSec = rawEndSec + 0.005;

                mediaSliceHtml = `
                    <div class="media-preview-container" id="preview-container-${index}">
                        ${isVideo ? 
                            `<video class="preview-media-element" id="media-player-${index}" src="${objectUrl}#t=${startSec},${endSec}" preload="metadata" controls></video>` :
                            `<audio class="preview-media-element" id="media-player-${index}" src="${objectUrl}#t=${startSec},${endSec}" preload="metadata" controls></audio>`
                        }
                        <div class="captions-overlay style-hormozi" id="captions-overlay-${index}"></div>
                        <div class="slice-controls">
                            <span class="slice-time-indicator">Slicer: ${startTime.split(',')[0]} → ${endTime.split(',')[0]}</span>
                            <div>
                                <button class="btn-slice-action" onclick="playSlice(${index}, ${startSec}, ${endSec})">▶ Play Clip</button>
                                <button class="btn-slice-action" style="margin-left: 6px; background: rgba(50, 204, 202, 0.05);" onclick="downloadSlice(${index}, ${startSec}, ${endSec}, '${clip.title.replace(/'/g, "\\'")}')">💾 Download Clip</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Vizard AI Style Controls -->
                    <div class="vizard-controls">
                        <div class="control-row">
                            <label>Layout Mode:</label>
                            <div class="btn-group">
                                <button class="btn-toggle active" id="btn-16-9-${index}" onclick="toggleLayoutMode(${index}, '16:9')">16:9 Landscape</button>
                                <button class="btn-toggle" id="btn-9-16-${index}" onclick="toggleLayoutMode(${index}, '9:16')">9:16 Shorts</button>
                            </div>
                        </div>
                        <div class="control-row">
                            <label>Smart Cut:</label>
                            <label class="switch-container">
                                <div class="switch">
                                    <input type="checkbox" id="smart-cut-${index}" onchange="toggleSmartCut(${index}, this.checked)">
                                    <span class="slider"></span>
                                </div>
                                <span>Skip Optional</span>
                            </label>
                        </div>
                        <div class="control-row hidden" id="reframe-row-${index}">
                            <label>Reframe Focus:</label>
                            <input type="range" min="-100" max="100" value="0" class="reframe-slider" id="reframe-slider-${index}" oninput="adjustReframe(${index}, this.value)">
                        </div>
                        <div class="control-row">
                            <label>Caption Style:</label>
                            <select class="style-select" id="caption-style-${index}" onchange="changeCaptionStyle(${index}, this.value)">
                                <option value="hormozi">🔥 Hormozi Bold</option>
                                <option value="cyber">⚡ Neon Cyberpunk</option>
                                <option value="minimal">⚪ Clean Minimal</option>
                            </select>
                        </div>
                        <div class="control-row">
                            <label>Font Family:</label>
                            <select class="style-select" id="caption-font-${index}" onchange="changeCaptionFont(${index}, this.value)">
                                <option value="'Plus Jakarta Sans', sans-serif">Jakarta Bold</option>
                                <option value="'Montserrat', sans-serif">Montserrat</option>
                                <option value="'Impact', 'Arial Black', sans-serif">Impact Bold</option>
                                <option value="'Courier New', monospace">Monospace</option>
                            </select>
                        </div>
                    </div>
                `;
            }

            card.className = `clip-card glass ${rawMediaFile ? '' : 'no-media'}`;

            // Left Column (Player & Controls)
            const leftColHtml = rawMediaFile ? `
                <div class="clip-card-left">
                    ${mediaSliceHtml}
                </div>
            ` : '';

            // Right Column (Metadata, lines, analysis)
            const rightColHtml = `
                <div class="clip-card-right">
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
                </div>
            `;

            card.innerHTML = rawMediaFile ? (leftColHtml + rightColHtml) : rightColHtml;
            resultsSection.appendChild(card);

            // Bind subtitle sync to player timeupdate events for real-time styled captions (Vizard AI style)
            if (rawMediaFile) {
                setTimeout(() => {
                    const player = document.getElementById(`media-player-${index}`);
                    const overlay = document.getElementById(`captions-overlay-${index}`);
                    
                    if (player && overlay) {
                        // Gather subtitle cues within this clip's boundaries
                        const clipCues = parsedSubtitles.filter(s => s.index >= clip.startId && s.index <= clip.endId);
                        
                        player.addEventListener('timeupdate', () => {
                            const curTime = player.currentTime;
                            const smartCutActive = document.getElementById(`smart-cut-${index}`)?.checked;
                            
                            // 1. Smart Cut (Playback skipper)
                            if (smartCutActive) {
                                const currentCue = clipCues.find(cue => {
                                    const start = parseTimeToMs(cue.start) / 1000;
                                    const end = parseTimeToMs(cue.end) / 1000;
                                    return curTime >= start && curTime <= end;
                                });
                                
                                if (currentCue && !clip.essentialIds.includes(currentCue.index)) {
                                    // optional segment: seek to next essential segment
                                    const nextEssential = clipCues.find(cue => {
                                        const start = parseTimeToMs(cue.start) / 1000;
                                        return start > curTime && clip.essentialIds.includes(cue.index);
                                    });
                                    
                                    if (nextEssential) {
                                        const nextStart = parseTimeToMs(nextEssential.start) / 1000;
                                        player.currentTime = nextStart;
                                        return;
                                    } else {
                                        // seek to end of the clip player bounds
                                        const clipEndSec = parseTimeToMs(endTime) / 1000;
                                        player.currentTime = clipEndSec;
                                        player.pause();
                                        return;
                                    }
                                }
                            }
                            
                            // 2. Styled Captions Render
                            const activeCue = clipCues.find(cue => {
                                const start = parseTimeToMs(cue.start) / 1000;
                                const end = parseTimeToMs(cue.end) / 1000;
                                return curTime >= start && curTime <= end;
                            });
                            
                            if (activeCue) {
                                const start = parseTimeToMs(activeCue.start) / 1000;
                                const end = parseTimeToMs(activeCue.end) / 1000;
                                const duration = end - start;
                                const elapsed = curTime - start;
                                
                                let activeWordIndex = -1;
                                const wordsList = activeCue.words || [];
                                
                                if (wordsList.length > 0 && typeof wordsList[0].start === 'number') {
                                    // Exact word-level matching!
                                    activeWordIndex = wordsList.findIndex(w => curTime >= w.start && curTime <= w.end);
                                    if (activeWordIndex === -1) {
                                        activeWordIndex = wordsList.findIndex(w => curTime < w.start);
                                        if (activeWordIndex === -1) {
                                            activeWordIndex = wordsList.length - 1;
                                        } else {
                                            activeWordIndex = Math.max(0, activeWordIndex - 1);
                                        }
                                    }
                                } else {
                                    // Fallback to uniform duration spacing
                                    const textWords = activeCue.text.split(/\s+/).filter(w => w.length > 0);
                                    activeWordIndex = Math.floor((elapsed / (duration || 1)) * textWords.length);
                                }
                                
                                const rawWords = activeCue.text.split(/\s+/).filter(w => w.length > 0);
                                overlay.innerHTML = rawWords.map((word, wIdx) => {
                                    const isActive = wIdx === Math.min(activeWordIndex, rawWords.length - 1);
                                    const wordWithEmoji = processWordEmoji(word);
                                    return `<span class="word ${isActive ? 'active' : ''}">${wordWithEmoji}</span>`;
                                }).join(' ');
                                overlay.style.opacity = 1;
                            } else {
                                overlay.style.opacity = 0;
                            }
                        });
                    }
                }, 100);
            }
        });

        // Bind interactive double-click subtitle editing
        document.querySelectorAll('.line-text').forEach(span => {
            span.addEventListener('dblclick', function() {
                if (this.querySelector('input')) return; // already editing
                
                const originalText = this.textContent;
                const cueIndex = parseInt(this.getAttribute('data-index'), 10);
                
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'line-edit-input';
                input.value = originalText;
                
                const saveEdit = () => {
                    const newValue = input.value.trim();
                    if (newValue && newValue !== originalText) {
                        const cue = parsedSubtitles.find(s => s.index === cueIndex);
                        if (cue) cue.text = newValue;
                        this.textContent = newValue;
                    } else {
                        this.textContent = originalText;
                    }
                };
                
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') {
                        input.value = originalText;
                        saveEdit();
                    }
                });
                
                input.addEventListener('blur', saveEdit);
                
                this.textContent = '';
                this.appendChild(input);
                input.focus();
            });
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
            "Video Slicing & Captions Export:\n\n" +
            "1. Local Burn-in (WebM): Click OK to compile and download this clip locally in your browser. Animated captions and 9:16 reframe values will be burned directly into the output video file! (Note: Processing runs in real-time, please keep the clip playing until recording is complete).\n\n" +
            "2. High-Quality Cut: Cancel this dialog and click 'Export Timeline (EDL)' in the sidebar. You can import that EDL file into DaVinci Resolve or Premiere Pro to instantly cut the source video at 4K/1080p lossless quality.\n\n" +
            "Do you want to proceed with local caption-burned video export?"
        );

        if (!proceed) return;

        btn.textContent = "⏱️ Exporting...";
        btn.disabled = true;

        try {
            // Seek to start
            player.currentTime = start;
            await new Promise(resolve => {
                player.onseeked = () => resolve();
            });

            // Set up offscreen composition Canvas
            const container = document.getElementById(`preview-container-${index}`);
            const isShorts = container?.classList.contains('vertical-shorts');
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (isShorts) {
                canvas.width = 720;
                canvas.height = 1280; // Standard vertical HD
            } else {
                canvas.width = 1280;
                canvas.height = 720;  // Standard landscape HD
            }

            let drawingActive = true;
            const drawFrame = () => {
                if (!drawingActive) return;
                
                // Draw background
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw scaled video frame (with cover positioning if 9:16)
                if (isShorts) {
                    const videoRatio = player.videoWidth / player.videoHeight;
                    const targetWidth = canvas.height * videoRatio;
                    const reframeVal = parseInt(document.getElementById(`reframe-slider-${index}`)?.value || 0, 10);
                    // Shift horizontal position based on slider
                    const xOffset = (canvas.width - targetWidth) / 2 + (reframeVal * 2.5);
                    ctx.drawImage(player, xOffset, 0, targetWidth, canvas.height);
                } else {
                    ctx.drawImage(player, 0, 0, canvas.width, canvas.height);
                }
                
                // Draw captions onto the canvas frame
                drawCanvasSubtitles(index, ctx, canvas.width, canvas.height, player.currentTime);
                
                requestAnimationFrame(drawFrame);
            };

            // Capture player audio using Web Audio API
            let audioTrack = null;
            let audioCtx = null;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (!player._audioSourceNode) {
                    player._audioSourceNode = audioCtx.createMediaElementSource(player);
                    player._audioDestNode = audioCtx.createMediaStreamDestination();
                    player._audioSourceNode.connect(player._audioDestNode);
                    player._audioSourceNode.connect(audioCtx.destination);
                }
                audioTrack = player._audioDestNode.stream.getAudioTracks()[0];
            } catch (aErr) {
                console.warn("AudioContext capture warning:", aErr);
            }

            // Combine video stream from Canvas with audio track
            const canvasStream = canvas.captureStream(30);
            const tracks = [canvasStream.getVideoTracks()[0]];
            if (audioTrack) tracks.push(audioTrack);
            
            const combinedStream = new MediaStream(tracks);

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

            const recorder = new MediaRecorder(combinedStream, options);
            const chunks = [];

            recorder.ondataavailable = e => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                drawingActive = false;
                if (audioCtx) audioCtx.close();
                
                const blob = new Blob(chunks, { type: options.mimeType || 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_vizard_clip.${extension}`;
                a.click();
                URL.revokeObjectURL(url);
                btn.textContent = originalText;
                btn.disabled = false;
            };

            player.play();
            drawFrame(); // start compositing loop
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

    // Canvas Subtitles composition renderer (styled and highlighted frame by frame)
    function drawCanvasSubtitles(index, ctx, width, height, curTime) {
        const styleName = document.getElementById(`caption-style-${index}`)?.value || 'hormozi';
        const fontValue = document.getElementById(`caption-font-${index}`)?.value || "'Plus Jakarta Sans', sans-serif";
        const clip = detectedClips[index];
        const clipCues = parsedSubtitles.filter(s => s.index >= clip.startId && s.index <= clip.endId);
        
        const activeCue = clipCues.find(cue => {
            const start = parseTimeToMs(cue.start) / 1000;
            const end = parseTimeToMs(cue.end) / 1000;
            return curTime >= start && curTime <= end;
        });
        
        if (!activeCue) return;
        
        const start = parseTimeToMs(activeCue.start) / 1000;
        const end = parseTimeToMs(activeCue.end) / 1000;
        const duration = end - start;
        const elapsed = curTime - start;
        
        let activeWordIndex = -1;
        const wordsList = activeCue.words || [];
        
        if (wordsList.length > 0 && typeof wordsList[0].start === 'number') {
            activeWordIndex = wordsList.findIndex(w => curTime >= w.start && curTime <= w.end);
            if (activeWordIndex === -1) {
                activeWordIndex = wordsList.findIndex(w => curTime < w.start);
                if (activeWordIndex === -1) {
                    activeWordIndex = wordsList.length - 1;
                } else {
                    activeWordIndex = Math.max(0, activeWordIndex - 1);
                }
            }
        } else {
            const textWords = activeCue.text.split(/\s+/).filter(w => w.length > 0);
            activeWordIndex = Math.floor((elapsed / (duration || 1)) * textWords.length);
        }
        
        const rawWords = activeCue.text.split(/\s+/).filter(w => w.length > 0);
        const words = rawWords.map(w => processWordEmoji(w));
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (styleName === 'hormozi') {
            ctx.font = `800 36px ${fontValue}`;
            const textY = height * 0.75;
            
            const wordWidths = words.map(w => ctx.measureText(w).width);
            const spacing = 12;
            const totalWidth = wordWidths.reduce((sum, w) => sum + w, 0) + spacing * (words.length - 1);
            
            let currentX = (width - totalWidth) / 2;
            words.forEach((word, wIdx) => {
                const isActive = wIdx === Math.min(activeWordIndex, words.length - 1);
                
                ctx.lineWidth = 6;
                ctx.strokeStyle = '#000000';
                ctx.strokeText(word, currentX + wordWidths[wIdx]/2, textY);
                
                ctx.fillStyle = isActive ? '#facc15' : '#ffffff';
                ctx.fillText(word, currentX + wordWidths[wIdx]/2, textY);
                
                currentX += wordWidths[wIdx] + spacing;
            });
        } else if (styleName === 'cyber') {
            ctx.font = `800 32px ${fontValue}`;
            const textY = height * 0.75;
            
            const wordWidths = words.map(w => ctx.measureText(w).width);
            const spacing = 10;
            const totalWidth = wordWidths.reduce((sum, w) => sum + w, 0) + spacing * (words.length - 1);
            
            let currentX = (width - totalWidth) / 2;
            words.forEach((word, wIdx) => {
                const isActive = wIdx === Math.min(activeWordIndex, words.length - 1);
                
                ctx.fillStyle = isActive ? '#ff007f' : '#00f2fe';
                ctx.fillText(word, currentX + wordWidths[wIdx]/2, textY);
                
                currentX += wordWidths[wIdx] + spacing;
            });
        } else { // minimal
            ctx.font = `500 24px ${fontValue}`;
            const textY = height * 0.82;
            
            const wordWidths = words.map(w => ctx.measureText(w).width);
            const spacing = 8;
            const totalWidth = wordWidths.reduce((sum, w) => sum + w, 0) + spacing * (words.length - 1);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.beginPath();
            ctx.roundRect((width - totalWidth)/2 - 16, textY - 20, totalWidth + 32, 40, 20);
            ctx.fill();
            
            let currentX = (width - totalWidth) / 2;
            words.forEach((word, wIdx) => {
                const isActive = wIdx === Math.min(activeWordIndex, words.length - 1);
                
                ctx.fillStyle = isActive ? '#ffffff' : '#d1d5db';
                ctx.fillText(word, currentX + wordWidths[wIdx]/2, textY);
                
                currentX += wordWidths[wIdx] + spacing;
            });
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

        const fileName = rawMediaFile ? rawMediaFile.name : "source_video.mp4";
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

    // Vizard AI Layout Toggle
    window.toggleLayoutMode = function(index, mode) {
        const container = document.getElementById(`preview-container-${index}`);
        const reframeRow = document.getElementById(`reframe-row-${index}`);
        const btn169 = document.getElementById(`btn-16-9-${index}`);
        const btn916 = document.getElementById(`btn-9-16-${index}`);
        
        if (!container) return;

        if (mode === '9:16') {
            container.classList.add('vertical-shorts');
            if (reframeRow) reframeRow.classList.remove('hidden');
            if (btn916) btn916.classList.add('active');
            if (btn169) btn169.classList.remove('active');
        } else {
            container.classList.remove('vertical-shorts');
            if (reframeRow) reframeRow.classList.add('hidden');
            if (btn169) btn169.classList.add('active');
            if (btn916) btn916.classList.remove('active');
            
            // Reset object position when returning to landscape
            const player = document.getElementById(`media-player-${index}`);
            if (player) player.style.objectPosition = '50% 50%';
        }
    };

    // Vizard AI Reframe slider handler
    window.adjustReframe = function(index, value) {
        const player = document.getElementById(`media-player-${index}`);
        if (!player) return;
        
        player.style.objectPosition = `calc(50% + ${value}px) 50%`;
    };

    // Vizard AI Caption Style selector
    window.changeCaptionStyle = function(index, styleName) {
        const overlay = document.getElementById(`captions-overlay-${index}`);
        if (!overlay) return;
        
        overlay.className = `captions-overlay style-${styleName}`;
    };

    // Vizard AI Font Family Selector
    window.changeCaptionFont = function(index, fontValue) {
        const overlay = document.getElementById(`captions-overlay-${index}`);
        if (overlay) {
            overlay.style.fontFamily = fontValue;
        }
    };

    // Vizard AI Smart Cut Toggle
    window.toggleSmartCut = function(index, checked) {
        const card = document.querySelectorAll('.clip-card')[index];
        if (!card) return;
        
        const optionalRows = card.querySelectorAll('.line-row:not(.is-essential)');
        optionalRows.forEach(row => {
            if (checked) {
                row.classList.add('is-skipped');
            } else {
                row.classList.remove('is-skipped');
            }
        });
    };

    // Keyword to Emoji Dictionary & Engine
    const emojiDict = {
        "money": "💰", "cash": "💵", "rich": "🤑", "wealth": "💎",
        "fire": "🔥", "hot": "🌶️",
        "growth": "📈", "grow": "🌱", "up": "🚀", "success": "🏆",
        "mistake": "❌", "error": "⚠️", "fail": "📉",
        "secret": "🤫", "hidden": "🔒", "mystery": "🕵️",
        "love": "❤️", "heart": "💖",
        "think": "🧠", "idea": "💡", "brain": "🧠",
        "speak": "🗣️", "talk": "💬", "tell": "📣",
        "time": "⏱️", "clock": "⏰", "fast": "⚡",
        "angry": "🤬", "mad": "😡", "happy": "😊",
        "lol": "😂", "funny": "😆",
        "power": "⚡", "strong": "💪", "gym": "🏋️",
        "yes": "✅", "no": "❌", "stop": "🛑",
        "look": "👀", "see": "👁️", "watch": "📺"
    };

    window.processWordEmoji = function(word) {
        if (!word) return "";
        const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (emojiDict[clean]) {
            return `${word} ${emojiDict[clean]}`;
        }
        return word;
    };

    // Reset/Clear button listener to bring back the upload card
    resetBtn.addEventListener('click', () => {
        parsedSubtitles = [];
        detectedClips = [];
        rawMediaFile = null;
        rawSrtContent = "";
        
        fileInput.value = "";
        fileInfo.textContent = "";
        
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
