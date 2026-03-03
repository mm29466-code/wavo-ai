/**
 * WAVO AI - Core Audio & Video Export Engine
 * Indigo Premium Build
 */

const AppState = {
    audio: { active: false, file: null, url: null, duration: 0, isPlaying: false },
    bg: { active: false, imgObj: null, url: null, zoom: 1, blur: 8, y: 0, darkOverlay: 0, vignette: false, stars: false, showGradient: true, transparentBg: false, solidColor: '#F2F2F4', topBlurEnable: false, topBlurHeight: 40, topBlurStrength: 30, topBlurFeather: 100, topBlurOpacity: 1, topBlurY: 0, topBlurColor: '#F2F2F4', topBlurColorAlpha: 0, topBlurBlendMode: 'source-over' },
    text: {
        title: "THE MIDNIGHT GOSPEL",
        guest: "DUNCAN TRUSSELL",
        subtitle: "Exploring consciousness and existence...",
        size: 90,
        y: 400,
        lineSpacing: 1.2,
        tracking: 0,
        pill: false,
        shadow: true,
        strokeWidth: 0,
        fontFamily: "'Cairo', sans-serif"
    },
    waveform: {
        style: 'cine_horizon', color: '#10b981', scale: 150, y: 1200, alpha: 0.9,
        thickness: 6, glow: 15, blur: 0, sensitivity: 10, smoothness: 80,
        mirror: false, halo: false, autoCenter: true, cinematicMode: true,
        rounding: 0, colorMode: 'solid', stereoMode: 'mono', beatEmphasis: false,
        favorites: [], recent: []
    },
    fx: {
        gain: { enable: true, v: 0 },
        eq: { enable: true, low: 0, mid: 0, high: 0 },
        comp: { enable: false, thresh: -24, ratio: 12, attack: 3, release: 250 },
        sat: { enable: false, drive: 0 },
        stereo: { enable: false, pan: 0 },
        rev: { enable: false, mix: 0, type: 'room' },
        delay: { enable: false, mix: 0, time: 250, fbk: 30 }
    },
    imgStudio: {
        active: false,
        maskCanvas: null, maskCtx: null,
        history: [], hIdx: -1, maskMode: false, showOrig: true, feather: 2, smooth: 0,
        bSize: 60, bOpacity: 1, bHard: 0.5, bAction: 'erase', isDrawing: false,
        blend: 'source-over', subjOp: 1,
        pre: 'none', bri: 1, con: 1, exp: 0, sat: 1, tmp: 0, tint: 0,
        hi: 0, sh: 0, clar: 0, shp: 0,
        grn: 0, leak: 0, sun: 0, grad: 0,
        spot: 0, fog: 0, bokeh: false
    },
    exporting: false
};


const DOM = {
    canvas: document.getElementById('mainCanvas'),
    audioInput: document.getElementById('audioInput'),
    imgInput: document.getElementById('imgInput'),
    nativeAudio: document.getElementById('nativeAudio'),
    debugLog: document.getElementById('debugLog')
};

const ctx = DOM.canvas.getContext('2d', { alpha: false }); // Opt for performance
const C_W = 1080;
const C_H = 1920;

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let streamDest = null;
let dataArray = null;
let timeArray = null;

// FX Nodes
let jGainNode, jEqLow, jEqMid, jEqHigh, jComp, jSat, jStereo, jRevConvolver, jRevDry, jRevWet, jDelayNode, jDelayFbk, jDelayDry, jDelayWet;

// --- DIAGNOSTICS LOGGING ---
function log(msg, type = 'info') {
    const time = new Date().toISOString().split('T')[1].substring(0, 8);
    const div = document.createElement('div');
    div.innerHTML = `<span>[${time}]</span> ${msg}`;
    if (type === 'err') div.classList.add('err');
    DOM.debugLog.appendChild(div);
    DOM.debugLog.scrollTop = DOM.debugLog.scrollHeight;
    console.log(`[WAVO] ${msg}`);
}

window.onerror = function (msg) {
    log(`CRASH PREVENTED: ${msg}`, 'err');
    document.getElementById('globalError').textContent = msg;
    document.getElementById('globalError').style.display = 'block';
    setTimeout(() => { document.getElementById('globalError').style.display = 'none'; }, 4000);
    return true; // prevent bubbling
};

// --- TABS INIT ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        e.target.classList.add('active');
        document.getElementById(`tab-${e.target.dataset.tab}`).style.display = 'block';
    });
});

// --- AUDIO HANDLING ---
const setupFileDrop = (dropBoxId, fileInput, onChange) => {
    const box = document.getElementById(dropBoxId);
    if (!box) return;
    box.addEventListener('click', () => fileInput.click());
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.style.borderColor = 'var(--accent)'; box.style.background = 'rgba(16,185,129,0.1)'; });
    box.addEventListener('dragleave', (e) => { e.preventDefault(); box.style.borderColor = ''; box.style.background = ''; });
    box.addEventListener('drop', (e) => {
        e.preventDefault();
        box.style.borderColor = ''; box.style.background = '';
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            onChange({ target: { files: e.dataTransfer.files } });
        }
    });
};

const handleAudioUpload = (e) => {
    try {
        if (!e.target.files.length) return;
        const file = e.target.files[0];

        if (file.size > 50 * 1024 * 1024) throw new Error("Audio file must be under 50MB.");

        log(`Uploading audio: ${file.name}`);

        if (AppState.audio.url) URL.revokeObjectURL(AppState.audio.url);

        const url = URL.createObjectURL(file);
        AppState.audio.file = file;
        AppState.audio.url = url;
        AppState.audio.active = true;

        document.getElementById('audioUploadBtn').style.display = 'none';
        document.getElementById('audioPlayerUI').style.display = 'block';
        document.getElementById('audioFileName').textContent = file.name;
        document.getElementById('audioStatus').textContent = "Decoding...";

        DOM.nativeAudio.src = url;
        DOM.nativeAudio.load();

        if (DOM.audioInput.value) DOM.audioInput.value = '';
    } catch (err) {
        log(`Audio Upload Failed: ${err.message}`, 'err');
        alert(err.message);
    }
};

DOM.audioInput.addEventListener('change', handleAudioUpload);
setupFileDrop('audioUploadBtn', DOM.audioInput, handleAudioUpload);

DOM.nativeAudio.addEventListener('loadedmetadata', () => {
    AppState.audio.duration = DOM.nativeAudio.duration;
    document.getElementById('audioStatus').textContent = `${(AppState.audio.file.size / 1024 / 1024).toFixed(1)}MB • Audio Ready`;
    document.getElementById('timeTotal').textContent = formatTime(AppState.audio.duration);
    document.getElementById('audioScrubber').max = 1000; // Granular resolution
    log("Audio metadata loaded properly.");
});

DOM.nativeAudio.addEventListener('timeupdate', () => {
    if (!DOM.nativeAudio.paused) {
        const prog = (DOM.nativeAudio.currentTime / AppState.audio.duration) * 1000;
        document.getElementById('audioScrubber').value = prog || 0;
        document.getElementById('timeCurrent').textContent = formatTime(DOM.nativeAudio.currentTime);
    }
});

DOM.nativeAudio.addEventListener('ended', () => {
    AppState.audio.isPlaying = false;
    document.getElementById('btnPlayPause').innerHTML = '<i data-lucide="play" fill="#fff"></i>';
    lucide.createIcons();
});

document.getElementById('audioScrubber').addEventListener('input', (e) => {
    if (!AppState.audio.duration) return;
    const time = (e.target.value / 1000) * AppState.audio.duration;
    DOM.nativeAudio.currentTime = time;
    document.getElementById('timeCurrent').textContent = formatTime(time);
});

document.getElementById('audioVolume').addEventListener('input', (e) => {
    DOM.nativeAudio.volume = e.target.value;
});

document.getElementById('btnPlayPause').addEventListener('click', async () => {
    if (!AppState.audio.active) return;

    // Resume context if required by browser securely
    if (!audioCtx) setupWebAudio();
    if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();

    if (DOM.nativeAudio.paused) {
        DOM.nativeAudio.play();
        AppState.audio.isPlaying = true;
        document.getElementById('btnPlayPause').innerHTML = '<i data-lucide="pause" fill="#fff"></i>';
    } else {
        DOM.nativeAudio.pause();
        AppState.audio.isPlaying = false;
        document.getElementById('btnPlayPause').innerHTML = '<i data-lucide="play" fill="#fff"></i>';
    }
    lucide.createIcons();
});

document.getElementById('btnReplay').addEventListener('click', () => {
    if (AppState.audio.active) DOM.nativeAudio.currentTime = 0;
});

document.getElementById('btnRemoveAudio').addEventListener('click', () => {
    DOM.nativeAudio.pause();
    DOM.nativeAudio.src = '';
    if (AppState.audio.url) URL.revokeObjectURL(AppState.audio.url);
    AppState.audio.active = false;
    AppState.audio.isPlaying = false;
    document.getElementById('audioInput').value = '';
    document.getElementById('audioPlayerUI').style.display = 'none';
    document.getElementById('audioUploadBtn').style.display = 'block';
    log("Audio removed. Core objects flushed.");

    document.getElementById('btnPlayPause').innerHTML = '<i data-lucide="play" fill="#fff"></i>';
    lucide.createIcons();
});

function formatTime(s) {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

// --- WEB AUDIO ANALYSER & DSP ---
function makeDistortionCurve(amount) {
    let k = typeof amount === 'number' ? amount : 50, n_samples = 44100, curve = new Float32Array(n_samples), deg = Math.PI / 180, i = 0, x;
    for (; i < n_samples; ++i) { x = i * 2 / n_samples - 1; curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x)); }
    return curve;
}

function buildImpulse(ctx, type) {
    let dur = type === 'plate' ? 3 : type === 'hall' ? 2 : 1; let decay = type === 'plate' ? 2 : type === 'hall' ? 2 : 5; let rate = ctx.sampleRate; let length = rate * dur;
    let impulse = ctx.createBuffer(2, length, rate); let left = impulse.getChannelData(0); let right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) { let rv = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay); left[i] = rv; right[i] = rv; }
    return impulse;
}

function setupWebAudio() {
    try {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        timeArray = new Uint8Array(analyser.frequencyBinCount);

        sourceNode = audioCtx.createMediaElementSource(DOM.nativeAudio);
        streamDest = audioCtx.createMediaStreamDestination();

        // FX Nodes Creation
        jGainNode = audioCtx.createGain();
        jEqLow = audioCtx.createBiquadFilter(); jEqLow.type = 'lowshelf'; jEqLow.frequency.value = 320;
        jEqMid = audioCtx.createBiquadFilter(); jEqMid.type = 'peaking'; jEqMid.frequency.value = 1000;
        jEqHigh = audioCtx.createBiquadFilter(); jEqHigh.type = 'highshelf'; jEqHigh.frequency.value = 3200;
        jComp = audioCtx.createDynamicsCompressor();
        jSat = audioCtx.createWaveShaper(); jSat.curve = makeDistortionCurve(0); jSat.oversample = '4x';
        jStereo = audioCtx.createStereoPanner();

        jRevConvolver = audioCtx.createConvolver(); jRevConvolver.buffer = buildImpulse(audioCtx, 'room');
        jRevDry = audioCtx.createGain(); jRevWet = audioCtx.createGain(); jRevWet.gain.value = 0;

        jDelayNode = audioCtx.createDelay(); jDelayNode.delayTime.value = 0.25;
        jDelayFbk = audioCtx.createGain(); jDelayFbk.gain.value = 0.3;
        jDelayDry = audioCtx.createGain(); jDelayWet = audioCtx.createGain(); jDelayWet.gain.value = 0;

        // Routing Chain
        // Source -> Gain -> EqLow -> EqMid -> EqHigh -> Comp -> Sat -> Stereo -> Dry splits
        sourceNode.connect(jGainNode);
        jGainNode.connect(jEqLow); jEqLow.connect(jEqMid); jEqMid.connect(jEqHigh); jEqHigh.connect(jComp);
        jComp.connect(jSat); jSat.connect(jStereo);

        // Reverb Split
        jStereo.connect(jRevDry);
        jStereo.connect(jRevConvolver); jRevConvolver.connect(jRevWet);

        // Delay Split (from Reverb output)
        jRevDry.connect(jDelayDry);
        jRevWet.connect(jDelayDry);

        jRevDry.connect(jDelayNode);
        jRevWet.connect(jDelayNode);

        jDelayNode.connect(jDelayFbk); jDelayFbk.connect(jDelayNode); // feedback loop
        jDelayNode.connect(jDelayWet);

        // Final mix -> analyser -> speakers & stream
        jDelayDry.connect(analyser); jDelayWet.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.connect(streamDest);

        updateAudioFx();
        log("Advanced Web Audio FX API initialized.");
    } catch (err) {
        log(`Web Audio setup error: ${err.message}`, 'err');
    }
}

function updateAudioFx() {
    if (!audioCtx) return;
    const fx = AppState.fx;
    jGainNode.gain.value = fx.gain.enable ? Math.pow(10, fx.gain.v / 20) : 1;
    jEqLow.gain.value = fx.eq.enable ? fx.eq.low : 0;
    jEqMid.gain.value = fx.eq.enable ? fx.eq.mid : 0;
    jEqHigh.gain.value = fx.eq.enable ? fx.eq.high : 0;

    if (fx.comp.enable) {
        jComp.threshold.value = fx.comp.thresh;
        jComp.ratio.value = fx.comp.ratio;
        jComp.attack.value = fx.comp.attack / 1000;
        jComp.release.value = fx.comp.release / 1000;
    } else {
        jComp.threshold.value = 0; jComp.ratio.value = 1;
    }

    jSat.curve = makeDistortionCurve(fx.sat.enable ? fx.sat.drive : 0);
    jStereo.pan.value = fx.stereo.enable ? fx.stereo.pan : 0;

    jRevConvolver.buffer = buildImpulse(audioCtx, fx.rev.type);
    jRevWet.gain.value = fx.rev.enable ? fx.rev.mix / 100 : 0;
    jRevDry.gain.value = fx.rev.enable ? 1 - (fx.rev.mix / 100) : 1;

    jDelayNode.delayTime.value = fx.delay.time / 1000;
    jDelayFbk.gain.value = fx.delay.fbk / 100;
    jDelayWet.gain.value = fx.delay.enable ? fx.delay.mix / 100 : 0;
    jDelayDry.gain.value = fx.delay.enable ? 1 - (fx.delay.mix / 100) : 1;
}


// --- VISUAL IMAGE HANDLING ---
const handleImgUpload = (e) => {
    try {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        log(`Uploading Background: ${file.name}`);

        if (AppState.bg.url) URL.revokeObjectURL(AppState.bg.url);

        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            AppState.bg.imgObj = img;
            AppState.bg.active = true;
            AppState.bg.url = url;
            document.getElementById('imgControls').style.display = 'block';
            document.getElementById('imgUploadBtn').style.display = 'none';
            log("Background image deployed.");

            // Init Image Studio Base
            initImgStudio(img);
            if (DOM.nativeAudio.paused) requestAnimationFrame(renderCanvas);
        };
        img.onerror = () => { throw new Error("Faulty image file."); };
        img.src = url;

        if (DOM.imgInput.value) DOM.imgInput.value = '';
    } catch (err) {
        log(`Image Upload Error: ${err.message}`, 'err');
    }
};

DOM.imgInput.addEventListener('change', handleImgUpload);
setupFileDrop('imgUploadBtn', DOM.imgInput, handleImgUpload);

document.getElementById('btnRemoveImg').addEventListener('click', () => {
    if (AppState.bg.url) URL.revokeObjectURL(AppState.bg.url);
    AppState.bg.active = false;
    AppState.bg.imgObj = null;
    DOM.imgInput.value = '';
    document.getElementById('imgControls').style.display = 'none';
    document.getElementById('imgUploadBtn').style.display = 'block';
    AppState.imgStudio.active = false;
});

// --- IMAGE STUDIO PRO INITIALIZATION & LISTENERS ---

function initImgStudio(img) {
    const st = AppState.imgStudio;
    st.maskCanvas = document.createElement('canvas');
    st.maskCanvas.width = img.naturalWidth;
    st.maskCanvas.height = img.naturalHeight;
    st.maskCtx = st.maskCanvas.getContext('2d', { willReadFrequently: true });

    // Fill with white (fully opaque mask means full subject visible)
    st.maskCtx.fillStyle = '#FFFFFF';
    st.maskCtx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);

    st.active = false;
    st.history = [];
    st.hIdx = -1;
    saveMaskHistory();
    log("Image Studio initialized for new file.");
}

function saveMaskHistory() {
    const st = AppState.imgStudio;
    if (!st.maskCtx) return;
    st.hIdx++;
    st.history.length = st.hIdx; // Truncate forward history if any
    st.history.push(st.maskCtx.getImageData(0, 0, st.maskCanvas.width, st.maskCanvas.height));
    if (st.history.length > 5) { st.history.shift(); st.hIdx--; } // Max 5 steps
}

function restoreMaskHistory(offset) {
    const st = AppState.imgStudio;
    if (st.hIdx + offset >= 0 && st.hIdx + offset < st.history.length) {
        st.hIdx += offset;
        st.maskCtx.putImageData(st.history[st.hIdx], 0, 0);
        st.active = true;
    }
}

// Binders
document.getElementById('btnMaskUndo')?.addEventListener('click', () => restoreMaskHistory(-1));
document.getElementById('btnMaskRedo')?.addEventListener('click', () => restoreMaskHistory(1));
document.getElementById('btnMaskClear')?.addEventListener('click', () => {
    if (!AppState.imgStudio.maskCtx) return;
    AppState.imgStudio.maskCtx.fillStyle = '#FFFFFF';
    AppState.imgStudio.maskCtx.fillRect(0, 0, AppState.bg.imgObj.naturalWidth, AppState.bg.imgObj.naturalHeight);
    AppState.imgStudio.active = false;
    saveMaskHistory();
});

document.getElementById('btnAiRemoveBg')?.addEventListener('click', () => {
    if (!AppState.bg.imgObj) return;
    log("Processing AI Cutout algorithm...");
    AppState.imgStudio.active = true;

    document.getElementById('btnAiRemoveBg').innerHTML = "<i data-lucide='loader'></i> Processing...";
    lucide.createIcons();

    setTimeout(() => {
        // Pseudo Magic Wand / Threshold Cutout (Heuristic Edge Detection)
        const st = AppState.imgStudio;
        const w = AppState.bg.imgObj.naturalWidth;
        const h = AppState.bg.imgObj.naturalHeight;

        // Let's create an offscreen canvas of the original image to read pixels
        const oc = document.createElement('canvas');
        oc.width = w; oc.height = h;
        const oCtx = oc.getContext('2d', { willReadFrequently: true });
        oCtx.drawImage(AppState.bg.imgObj, 0, 0);

        const imgData = oCtx.getImageData(0, 0, w, h);
        const p = imgData.data;
        const maskData = st.maskCtx.getImageData(0, 0, w, h);
        const mp = maskData.data;

        // Sample top-left corner as background reference
        const refR = p[0], refG = p[1], refB = p[2];
        const tol = 60 + (st.smooth * 2);

        for (let i = 0; i < p.length; i += 4) {
            const r = p[i], g = p[i + 1], b = p[i + 2];
            const dist = Math.abs(r - refR) + Math.abs(g - refG) + Math.abs(b - refB);

            // If similar to corner, make mask black (transparent)
            if (dist < tol) {
                mp[i] = 0; mp[i + 1] = 0; mp[i + 2] = 0; mp[i + 3] = 255;
            } else {
                mp[i] = 255; mp[i + 1] = 255; mp[i + 2] = 255; mp[i + 3] = 255;
            }
        }

        st.maskCtx.putImageData(maskData, 0, 0);
        saveMaskHistory();

        document.getElementById('btnAiRemoveBg').innerHTML = "✨ Remove Background (AI Cutout)";
        log("Cutout processing complete.");
    }, 500);
});

// Studio properties binders
const bindSt = (id, propPath, isToggle = false, valFormat = v => v) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(isToggle ? 'change' : 'input', e => {
        AppState.imgStudio[propPath] = valFormat(isToggle ? e.target.checked : e.target.value);
        if (DOM.nativeAudio && DOM.nativeAudio.paused) requestAnimationFrame(renderCanvas);
    });
};

bindSt('isFeather', 'feather', false, parseFloat);
bindSt('isSmooth', 'smooth', false, parseFloat);
bindSt('isShowOrigBg', 'showOrig', true);
bindSt('isMaskEditMode', 'maskMode', true, v => {
    document.getElementById('maskEditControls').style.display = v ? 'block' : 'none';
    return v;
});
bindSt('isBrushSize', 'bSize', false, parseInt);
bindSt('isBrushOpacity', 'bOpacity', false, parseFloat);
bindSt('isBrushHardness', 'bHard', false, parseFloat);
bindSt('isBlendMode', 'blend');
bindSt('isSubjectOpacity', 'subjOp', false, parseFloat);

bindSt('isPreset', 'pre', false, v => {
    // Quick apply presets
    const p = AppState.imgStudio;
    let props = { bri: 1, con: 1, exp: 0, sat: 1, tmp: 0, tint: 0, hi: 0, sh: 0, clar: 0, shp: 0 };
    switch (v) {
        case 'cinematic': props = { bri: 0.9, con: 1.2, exp: 0, sat: 0.8, tmp: -0.2, tint: 0.1, hi: 0.2, sh: -0.2, clar: 0.4, shp: 0.2 }; break;
        case 'warm': props = { bri: 1.1, con: 1.1, exp: 0.1, sat: 1.2, tmp: 0.6, tint: 0.1, hi: 0, sh: 0.1, clar: 0.1, shp: 0 }; break;
        case 'moody': props = { bri: 0.8, con: 1.3, exp: -0.2, sat: 0.6, tmp: -0.3, tint: 0.2, hi: 0.3, sh: -0.5, clar: 0.5, shp: 0.3 }; break;
        case 'contrast': props = { bri: 1.0, con: 1.5, exp: 0, sat: 1.1, tmp: 0, tint: 0, hi: 0.5, sh: -0.5, clar: 0.2, shp: 0.2 }; break;
        case 'portrait': props = { bri: 1.1, con: 0.95, exp: 0, sat: 1.05, tmp: 0.1, tint: -0.1, hi: -0.2, sh: 0.3, clar: -0.2, shp: 0 }; break;
    }
    Object.assign(AppState.imgStudio, props);
    ['isBright', 'isCont', 'isExp', 'isSat', 'isTemp', 'isTint', 'isHigh', 'isShad', 'isClar', 'isSharp'].forEach((id, i) => {
        document.getElementById(id).value = Object.values(props)[i];
    });
    return v;
});

bindSt('isBright', 'bri', false, parseFloat);
bindSt('isCont', 'con', false, parseFloat);
bindSt('isExp', 'exp', false, parseFloat);
bindSt('isSat', 'sat', false, parseFloat);
bindSt('isTemp', 'tmp', false, parseFloat);
bindSt('isTint', 'tint', false, parseFloat);
bindSt('isHigh', 'hi', false, parseFloat);
bindSt('isShad', 'sh', false, parseFloat);
bindSt('isClar', 'clar', false, parseFloat);
bindSt('isSharp', 'shp', false, parseFloat);

bindSt('isGrain', 'grn', false, parseFloat);
bindSt('isLeak', 'leak', false, parseFloat);
bindSt('isSunGlow', 'sun', false, parseFloat);
bindSt('isGradFx', 'grad', false, parseFloat);
bindSt('isSpotlight', 'spot', false, parseFloat);
bindSt('isFog', 'fog', false, parseFloat);
bindSt('isBokeh', 'bokeh', true);

document.getElementById('btnMaskErase')?.addEventListener('click', () => AppState.imgStudio.bAction = 'erase');
document.getElementById('btnMaskRestore')?.addEventListener('click', () => AppState.imgStudio.bAction = 'restore');

// --- BRUSH DRAWING LOGIC ---
const updateBrushPosition = (e) => {
    const st = AppState.imgStudio;
    if (!st.maskMode || !st.isDrawing || !st.maskCtx || !AppState.bg.imgObj) return;
    st.active = true;

    const rect = DOM.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Scale coords back to image source natural dimensions.
    // 1. Calculate image render bounds on main canvas
    const C_W = DOM.canvas.width;
    const C_H = DOM.canvas.height;
    const cwScale = C_W / rect.width;
    const chScale = C_H / rect.height;

    const mx = cx * cwScale;
    const my = cy * chScale;

    // Inside renderCanvas, image is rendered as:
    // w = C_W * AppState.bg.zoom
    // h = C_W * (imageHeight/imageWidth) * zoom
    // dx = (C_W - w)/2, dy = (C_H/2 - h/2) + AppState.bg.y

    const w = C_W * AppState.bg.zoom;
    const h = (C_W * (AppState.bg.imgObj.naturalHeight / AppState.bg.imgObj.naturalWidth)) * AppState.bg.zoom;
    const dx = (C_W - w) / 2;
    const dy = (C_H / 2 - h / 2) + AppState.bg.y;

    if (mx < dx || mx > dx + w || my < dy || my > dy + h) return; // Out of bounds

    const normX = (mx - dx) / w;
    const normY = (my - dy) / h;

    const imgX = normX * AppState.bg.imgObj.naturalWidth;
    const imgY = normY * AppState.bg.imgObj.naturalHeight;

    const grad = st.maskCtx.createRadialGradient(imgX, imgY, 0, imgX, imgY, st.bSize * (AppState.bg.imgObj.naturalWidth / C_W));
    let color = st.bAction === 'erase' ? '0,0,0' : '255,255,255';

    grad.addColorStop(0, `rgba(${color}, ${st.bOpacity})`);
    grad.addColorStop(st.bHard, `rgba(${color}, ${st.bOpacity})`);
    grad.addColorStop(1, `rgba(${color}, 0)`);

    st.maskCtx.fillStyle = grad;
    st.maskCtx.beginPath();
    st.maskCtx.arc(imgX, imgY, st.bSize * (AppState.bg.imgObj.naturalWidth / C_W), 0, Math.PI * 2);
    st.maskCtx.fill();
};

DOM.canvas.addEventListener('mousedown', (e) => {
    if (AppState.imgStudio.maskMode) { AppState.imgStudio.isDrawing = true; updateBrushPosition(e); }
});
DOM.canvas.addEventListener('mousemove', (e) => {
    if (AppState.imgStudio.isDrawing) updateBrushPosition(e);
});
window.addEventListener('mouseup', () => {
    if (AppState.imgStudio.isDrawing) { AppState.imgStudio.isDrawing = false; saveMaskHistory(); }
});

// --- AUDIO FX LISTENERS ---
const bindFx = (id, propPath, valDisplayId, isToggle = false, valFormat = (v) => v) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(isToggle ? 'change' : 'input', (e) => {
        const val = isToggle ? e.target.checked : parseFloat(e.target.value);
        let tgt = AppState.fx;
        const parts = propPath.split('.');
        const last = parts.pop();
        for (let p of parts) tgt = tgt[p];
        tgt[last] = val;

        if (!isToggle && valDisplayId) document.getElementById(valDisplayId).textContent = valFormat(val);
        updateAudioFx();
    });
};

bindFx('fxGainEnable', 'gain.enable', null, true);
bindFx('fxGain', 'gain.v', 'fxGainVal', false, v => v > 0 ? `+${v} dB` : `${v} dB`);

bindFx('fxEqEnable', 'eq.enable', null, true);
bindFx('fxEqLow', 'eq.low', 'fxEqLowVal');
bindFx('fxEqMid', 'eq.mid', 'fxEqMidVal');
bindFx('fxEqHigh', 'eq.high', 'fxEqHighVal');

bindFx('fxCompEnable', 'comp.enable', null, true);
bindFx('fxCompThresh', 'comp.thresh', 'fxCompThreshVal');
bindFx('fxCompRatio', 'comp.ratio', 'fxCompRatioVal');
bindFx('fxCompAttack', 'comp.attack', 'fxCompAttackVal');
bindFx('fxCompRelease', 'comp.release', 'fxCompReleaseVal');

bindFx('fxSatEnable', 'sat.enable', null, true);
bindFx('fxSat', 'sat.drive', 'fxSatVal', false, v => `${v} %`);

bindFx('fxStereoEnable', 'stereo.enable', null, true);
bindFx('fxStereo', 'stereo.pan', 'fxStereoVal', false, v => v === 0 ? '0 (C)' : (v < 0 ? `${Math.round(Math.abs(v) * 100)}% L` : `${Math.round(v * 100)}% R`));

bindFx('fxRevEnable', 'rev.enable', null, true);
bindFx('fxRev', 'rev.mix', 'fxRevVal', false, v => `${v} %`);
document.getElementById('fxRevType').addEventListener('change', e => { AppState.fx.rev.type = e.target.value; updateAudioFx(); });

bindFx('fxDelayEnable', 'delay.enable', null, true);
bindFx('fxDelayMix', 'delay.mix', 'fxDelayVal', false, v => `${v} %`);
bindFx('fxDelayTime', 'delay.time', 'fxDelayTimeVal');
bindFx('fxDelayFbk', 'delay.fbk', 'fxDelayFbkVal');

// Setup FX Presets
const fxSyncUI = () => {
    const fx = AppState.fx;
    document.getElementById('fxGainEnable').checked = fx.gain.enable;
    document.getElementById('fxGain').value = fx.gain.v; document.getElementById('fxGainVal').textContent = fx.gain.v > 0 ? `+${fx.gain.v} dB` : `${fx.gain.v} dB`;

    document.getElementById('fxEqEnable').checked = fx.eq.enable;
    document.getElementById('fxEqLow').value = fx.eq.low; document.getElementById('fxEqLowVal').textContent = fx.eq.low;
    document.getElementById('fxEqMid').value = fx.eq.mid; document.getElementById('fxEqMidVal').textContent = fx.eq.mid;
    document.getElementById('fxEqHigh').value = fx.eq.high; document.getElementById('fxEqHighVal').textContent = fx.eq.high;

    document.getElementById('fxCompEnable').checked = fx.comp.enable;
    document.getElementById('fxCompThresh').value = fx.comp.thresh; document.getElementById('fxCompThreshVal').textContent = fx.comp.thresh;
    document.getElementById('fxCompRatio').value = fx.comp.ratio; document.getElementById('fxCompRatioVal').textContent = fx.comp.ratio;
    document.getElementById('fxCompAttack').value = fx.comp.attack; document.getElementById('fxCompAttackVal').textContent = fx.comp.attack;
    document.getElementById('fxCompRelease').value = fx.comp.release; document.getElementById('fxCompReleaseVal').textContent = fx.comp.release;

    document.getElementById('fxSatEnable').checked = fx.sat.enable;
    document.getElementById('fxSat').value = fx.sat.drive; document.getElementById('fxSatVal').textContent = `${fx.sat.drive} %`;

    document.getElementById('fxStereoEnable').checked = fx.stereo.enable;
    document.getElementById('fxStereo').value = fx.stereo.pan; document.getElementById('fxStereoVal').textContent = fx.stereo.pan === 0 ? '0 (C)' : (fx.stereo.pan < 0 ? `${Math.round(Math.abs(fx.stereo.pan) * 100)}% L` : `${Math.round(fx.stereo.pan * 100)}% R`);

    document.getElementById('fxRevEnable').checked = fx.rev.enable;
    document.getElementById('fxRev').value = fx.rev.mix; document.getElementById('fxRevVal').textContent = `${fx.rev.mix} %`;
    document.getElementById('fxRevType').value = fx.rev.type;

    document.getElementById('fxDelayEnable').checked = fx.delay.enable;
    document.getElementById('fxDelayMix').value = fx.delay.mix; document.getElementById('fxDelayVal').textContent = `${fx.delay.mix} %`;
    document.getElementById('fxDelayTime').value = fx.delay.time; document.getElementById('fxDelayTimeVal').textContent = fx.delay.time;
    document.getElementById('fxDelayFbk').value = fx.delay.fbk; document.getElementById('fxDelayFbkVal').textContent = fx.delay.fbk;
};

document.getElementById('btnResetFx').addEventListener('click', () => {
    AppState.fx = {
        gain: { enable: true, v: 0 },
        eq: { enable: true, low: 0, mid: 0, high: 0 },
        comp: { enable: false, thresh: -24, ratio: 12, attack: 3, release: 250 },
        sat: { enable: false, drive: 0 },
        stereo: { enable: false, pan: 0 },
        rev: { enable: false, mix: 0, type: 'room' },
        delay: { enable: false, mix: 0, time: 250, fbk: 30 }
    };
    document.getElementById('fxPreset').value = 'none';
    fxSyncUI();
    updateAudioFx();
});

const setFxPreset = (preset) => {
    switch (preset) {
        case 'none':
            document.getElementById('btnResetFx').click();
            break;
        case 'clean_podcast':
            AppState.fx = {
                gain: { enable: true, v: 2 },
                eq: { enable: true, low: 2, mid: -1, high: 3 },
                comp: { enable: true, thresh: -18, ratio: 4, attack: 2, release: 150 },
                sat: { enable: true, drive: 5 },
                stereo: { enable: false, pan: 0 },
                rev: { enable: false, mix: 0, type: 'room' },
                delay: { enable: false, mix: 0, time: 250, fbk: 30 }
            }; break;
        case 'cinematic_voice':
            AppState.fx = {
                gain: { enable: true, v: 1 },
                eq: { enable: true, low: 4, mid: -2, high: 2 },
                comp: { enable: true, thresh: -25, ratio: 8, attack: 5, release: 300 },
                sat: { enable: true, drive: 12 },
                stereo: { enable: true, pan: 0 }, // maybe slight widen if we had true stereo widener, but panner is L/R
                rev: { enable: true, mix: 15, type: 'hall' },
                delay: { enable: false, mix: 0, time: 250, fbk: 30 }
            }; break;
        case 'documentary':
            AppState.fx = {
                gain: { enable: true, v: 0 },
                eq: { enable: true, low: 1, mid: 1, high: 1 },
                comp: { enable: true, thresh: -20, ratio: 3, attack: 5, release: 250 },
                sat: { enable: false, drive: 0 },
                stereo: { enable: false, pan: 0 },
                rev: { enable: true, mix: 8, type: 'room' },
                delay: { enable: false, mix: 0, time: 250, fbk: 30 }
            }; break;
        case 'energetic_promo':
            AppState.fx = {
                gain: { enable: true, v: 3 },
                eq: { enable: true, low: 3, mid: 2, high: 5 },
                comp: { enable: true, thresh: -30, ratio: 12, attack: 1, release: 100 },
                sat: { enable: true, drive: 20 },
                stereo: { enable: false, pan: 0 },
                rev: { enable: true, mix: 10, type: 'plate' },
                delay: { enable: false, mix: 0, time: 250, fbk: 30 }
            }; break;
        case 'soft_spiritual':
            AppState.fx = {
                gain: { enable: true, v: -1 },
                eq: { enable: true, low: 2, mid: -3, high: -2 },
                comp: { enable: true, thresh: -15, ratio: 2, attack: 20, release: 500 },
                sat: { enable: false, drive: 0 },
                stereo: { enable: false, pan: 0 },
                rev: { enable: true, mix: 35, type: 'hall' },
                delay: { enable: true, mix: 10, time: 400, fbk: 40 }
            }; break;
    }
    fxSyncUI();
    updateAudioFx();
};

document.getElementById('fxPreset').addEventListener('change', e => setFxPreset(e.target.value));

// UI Event Listeners Bindings //
document.getElementById('optTitle').addEventListener('input', e => AppState.text.title = e.target.value);
document.getElementById('optGuest').addEventListener('input', e => AppState.text.guest = e.target.value);
document.getElementById('optSubtitle').addEventListener('input', e => AppState.text.subtitle = e.target.value);
document.getElementById('optTextSize').addEventListener('input', e => AppState.text.size = parseInt(e.target.value));
document.getElementById('optTextY').addEventListener('input', e => AppState.text.y = parseInt(e.target.value));
document.getElementById('optTextLineSpacing').addEventListener('input', e => AppState.text.lineSpacing = parseFloat(e.target.value));
document.getElementById('optTextSpacing').addEventListener('input', e => AppState.text.tracking = parseInt(e.target.value));
document.getElementById('optTextPill').addEventListener('change', e => AppState.text.pill = e.target.checked);
document.getElementById('optTextShadow').addEventListener('change', e => AppState.text.shadow = e.target.checked);
document.getElementById('optTextStroke').addEventListener('change', e => AppState.text.strokeWidth = parseInt(e.target.value));

// --- FONT LIBRARY SYSTEM ---
const FONT_LIBS = [
    { id: 'cairo', name: 'Cairo', family: "'Cairo', sans-serif", weight: 900, category: 'modern' },
    { id: 'tajawal', name: 'Tajawal', family: "'Tajawal', sans-serif", weight: 800, category: 'modern' },
    { id: 'almarai', name: 'Almarai', family: "'Almarai', sans-serif", weight: 800, category: 'modern' },
    { id: 'ibmplex', name: 'IBM Plex Arabic', family: "'IBM Plex Sans Arabic', sans-serif", weight: 600, category: 'modern' },
    { id: 'changa', name: 'Changa', family: "'Changa', sans-serif", weight: 600, category: 'display' },
    { id: 'kufi', name: 'Noto Kufi', family: "'Noto Kufi Arabic', sans-serif", weight: 800, category: 'kufi' },
    { id: 'reemkufi', name: 'Reem Kufi', family: "'Reem Kufi', sans-serif", weight: 600, category: 'kufi' },
    { id: 'naskh', name: 'Noto Naskh', family: "'Noto Naskh Arabic', serif", weight: 700, category: 'naskh' },
    { id: 'amiri', name: 'Amiri', family: "'Amiri', serif", weight: 700, category: 'naskh' },
    { id: 'lateef', name: 'Lateef', family: "'Lateef', serif", weight: 600, category: 'naskh' },
    { id: 'markazi', name: 'Markazi Text', family: "'Markazi Text', serif", weight: 700, category: 'classic' },
    { id: 'elmessiri', name: 'El Messiri', family: "'El Messiri', sans-serif", weight: 700, category: 'classic' },
    { id: 'harmattan', name: 'Harmattan', family: "'Harmattan', sans-serif", weight: 700, category: 'classic' },
    { id: 'aref', name: 'Aref Ruqaa', family: "'Aref Ruqaa', serif", weight: 700, category: 'hand' },
    { id: 'baloobhaijaan', name: 'Baloo Bhaijaan 2', family: "'Baloo Bhaijaan 2', display", weight: 700, category: 'display' },
    { id: 'inter', name: 'Inter (Latin)', family: "'Inter', sans-serif", weight: 800, category: 'modern' }
];

function initFontLibrary() {
    const grid = document.getElementById('fontLibraryGrid');
    const search = document.getElementById('fontSearch');
    const cat = document.getElementById('fontCategory');

    function renderFonts() {
        const q = search.value.toLowerCase();
        const c = cat.value;
        grid.innerHTML = '';

        FONT_LIBS.forEach(font => {
            if (c !== 'all' && font.category !== c) return;
            if (q && !font.name.toLowerCase().includes(q)) return;

            const div = document.createElement('div');
            div.className = `font-card ${AppState.text.fontFamily === font.family ? 'active' : ''}`;

            // Inline style forces the preview to use the specific font family/weight
            div.innerHTML = `
                <div class="font-card-preview-large" style="font-family: ${font.family}; font-weight: ${font.weight};">المسابقات الرمضانية</div>
                <div class="font-card-preview-small" style="font-family: ${font.family}; font-weight: 400;">ضيف الحلقة — محمد إبراهيم</div>
                <div class="font-card-name">${font.name}</div>
            `;

            div.onclick = () => {
                AppState.text.fontFamily = font.family;
                document.getElementById('activeFontLabel').textContent = font.name;
                renderFonts(); // update active state visually
            };
            grid.appendChild(div);
        });
    }

    search.addEventListener('input', renderFonts);
    cat.addEventListener('change', renderFonts);
    renderFonts();
    document.getElementById('activeFontLabel').textContent = FONT_LIBS.find(f => f.family === AppState.text.fontFamily)?.name || 'Cairo';
}
initFontLibrary();

document.getElementById('imgZoom').addEventListener('input', e => AppState.bg.zoom = parseFloat(e.target.value));
document.getElementById('imgY').addEventListener('input', e => AppState.bg.y = parseInt(e.target.value));
document.getElementById('imgBlur').addEventListener('input', e => AppState.bg.blur = parseInt(e.target.value));
document.getElementById('optTopBlurEnable').addEventListener('change', e => {
    AppState.bg.topBlurEnable = e.target.checked;
    document.getElementById('topBlurControls').style.display = e.target.checked ? 'block' : 'none';
});
document.getElementById('optTopBlurHeight').addEventListener('input', e => AppState.bg.topBlurHeight = parseInt(e.target.value));
document.getElementById('optTopBlurStrength').addEventListener('input', e => AppState.bg.topBlurStrength = parseInt(e.target.value));
document.getElementById('optTopBlurFeather').addEventListener('input', e => AppState.bg.topBlurFeather = parseInt(e.target.value));
document.getElementById('optTopBlurOpacity').addEventListener('input', e => AppState.bg.topBlurOpacity = parseFloat(e.target.value));
document.getElementById('optTopBlurY').addEventListener('input', e => AppState.bg.topBlurY = parseInt(e.target.value));
document.getElementById('optTopBlurBlendMode').addEventListener('change', e => AppState.bg.topBlurBlendMode = e.target.value);
document.getElementById('optTopBlurColor').addEventListener('input', e => AppState.bg.topBlurColor = e.target.value);
document.getElementById('optTopBlurColorAlpha').addEventListener('input', e => AppState.bg.topBlurColorAlpha = parseFloat(e.target.value));

document.getElementById('optDarkOverlay').addEventListener('input', e => AppState.bg.darkOverlay = parseFloat(e.target.value));
document.getElementById('optVignette').addEventListener('change', e => AppState.bg.vignette = e.target.checked);
document.getElementById('optStars').addEventListener('change', e => AppState.bg.stars = e.target.checked);

document.getElementById('optBaseGrad').addEventListener('change', e => {
    AppState.bg.showGradient = e.target.checked;
    if (e.target.checked) {
        document.getElementById('optTransparentBg').checked = false;
        AppState.bg.transparentBg = false;
        document.getElementById('bgColorGroup').style.display = 'none';
    } else if (!AppState.bg.transparentBg) {
        document.getElementById('bgColorGroup').style.display = 'block';
    }
});

document.getElementById('optTransparentBg').addEventListener('change', e => {
    AppState.bg.transparentBg = e.target.checked;
    if (e.target.checked) {
        document.getElementById('optBaseGrad').checked = false;
        AppState.bg.showGradient = false;
        document.getElementById('bgColorGroup').style.display = 'none';
    } else if (!AppState.bg.showGradient) {
        document.getElementById('bgColorGroup').style.display = 'block';
    }
});

document.getElementById('optBgColor').addEventListener('input', e => AppState.bg.solidColor = e.target.value);

// Waveform Listeners
const WAVEFORM_LIBS = [
    // 1) Bars (Vertical)
    { id: 'bars', cat: 'bars', name: 'Classic Bars', icon: '<path d="M12 20v-8M6 20V6M18 20v-4" stroke-width="2"/>' },
    { id: 'thin_bars', cat: 'bars', name: 'Thin Bars', icon: '<path d="M12 20v-8M8 20V6M16 20v-4" stroke-width="1"/>' },
    { id: 'fat_bars', cat: 'bars', name: 'Fat Bars', icon: '<path d="M12 20v-8M6 20V6M18 20v-4" stroke-width="5"/>' },
    { id: 'rounded_bars', cat: 'bars', name: 'Rounded Bars', icon: '<path d="M12 20v-8M6 20V6M18 20v-4" stroke-linecap="round" stroke-width="3"/>' },
    { id: 'soft_glow_bars', cat: 'bars', name: 'Soft Glow Bars', icon: '<path d="M12 20v-8M6 20V6M18 20v-4" filter="blur(1px)"/>' },
    { id: 'segmented', cat: 'bars', name: 'Segmented', icon: '<path d="M12 20v-2M12 16v-2M12 12v-2" stroke-dasharray="2 2" stroke-width="3"/>' },
    { id: 'peak_bars', cat: 'bars', name: 'Peak Bars', icon: '<path d="M12 20V4M6 20v-8M18 20v-8" stroke-width="2"/>' },
    { id: 'stereo_split', cat: 'bars', name: 'Stereo Split', icon: '<path d="M10 20V10M14 20V6" stroke-width="2"/>' },

    // 2) Mirror & Symmetry
    { id: 'mirror', cat: 'mirror', name: 'Mirror Bars', icon: '<path d="M12 4v16M6 8v8M18 10v4" stroke-width="2"/>' },
    { id: 'twin_mirror', cat: 'mirror', name: 'Twin Mirror', icon: '<path d="M12 4v4M12 16v4M6 8v3M6 13v3" stroke-width="2"/>' },
    { id: 'kaleido', cat: 'mirror', name: 'Kaleido Mirror', icon: '<path d="M12 2v20M2 12h20M6 6l12 12M6 18L18 6" opacity="0.5" stroke-width="2"/>' },
    { id: 'center_mirror', cat: 'mirror', name: 'Center Mirror', icon: '<path d="M4 12h16M12 10v4M8 8v8" stroke-width="2"/>' },

    // 3) Lines
    { id: 'line', cat: 'lines', name: 'Smooth Line', icon: '<path d="M4 12 Q8 6 12 12 T20 12" fill="none" stroke-width="2"/>' },
    { id: 'thin_line', cat: 'lines', name: 'Thin Line', icon: '<path d="M4 12 Q8 6 12 12 T20 12" fill="none" stroke-width="1"/>' },
    { id: 'thick_line', cat: 'lines', name: 'Thick Line', icon: '<path d="M4 12 Q8 6 12 12 T20 12" fill="none" stroke-width="4"/>' },
    { id: 'neon_line', cat: 'lines', name: 'Neon Line', icon: '<path d="M4 12 Q8 6 12 12 T20 12" fill="none" filter="blur(1px)" stroke-width="2"/>' },
    { id: 'dual_line', cat: 'lines', name: 'Dual Line', icon: '<path d="M4 10 Q8 4 12 10 M4 14 Q8 20 12 14" fill="none" stroke-width="2"/>' },
    { id: 'triple_line', cat: 'lines', name: 'Triple Line', icon: '<path d="M4 8 Q8 2 12 8 M4 12 Q8 6 12 12 M4 16 Q8 10 12 16" fill="none" stroke-width="1.5"/>' },
    { id: 'wave_ribbon', cat: 'lines', name: 'Wave Ribbon', icon: '<path d="M2 14 Q8 4 14 14 T22 14 M2 10 Q8 0 14 10 T22 10" fill="none" stroke-width="2" opacity="0.6"/>' },

    // 4) Dots & Particles
    { id: 'dots', cat: 'dots', name: 'Dotted Line', icon: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/><circle cx="18" cy="14" r="1.5" fill="currentColor"/>' },
    { id: 'dot_bars', cat: 'dots', name: 'Dotted Bars', icon: '<path d="M12 20V8M6 20v-4M18 20v-6" stroke-dasharray="2 4" stroke-width="2"/>' },
    { id: 'particle_trail', cat: 'dots', name: 'Particle Trail', icon: '<circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor" opacity="0.6"/><circle cx="16" cy="16" r="1.5" fill="currentColor" opacity="0.3"/>' },
    { id: 'particle_pulse', cat: 'dots', name: 'Particle Pulse', icon: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><circle cx="12" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/>' },
    { id: 'sparkle', cat: 'dots', name: 'Sparkle Reactive', icon: '<path d="M12 8v4M10 10h4M6 14v2M5 15h2" stroke-width="1.5"/>' },

    // 5) Circular / Ring
    { id: 'ring', cat: 'circular', name: 'Circular Ring', icon: '<circle cx="12" cy="12" r="6" fill="none" stroke-width="2"/>' },
    { id: 'double_ring', cat: 'circular', name: 'Double Ring', icon: '<circle cx="12" cy="12" r="6" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke-width="1"/>' },
    { id: 'orbit_ring', cat: 'circular', name: 'Orbit Ring', icon: '<path d="M12 2a10 10 0 100 20" fill="none" stroke-width="1" stroke-dasharray="4 4"/><circle cx="12" cy="12" r="2" fill="currentColor"/>' },
    { id: 'halo', cat: 'circular', name: 'Halo Pulse', icon: '<circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.3"/><circle cx="12" cy="12" r="4" fill="currentColor"/>' },
    { id: 'radar', cat: 'circular', name: 'Radar Sweep', icon: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="1"/><path d="M12 12l6 -6" stroke-width="2" opacity="0.5"/>' },
    { id: 'vinyl_ring', cat: 'circular', name: 'Vinyl Ring', icon: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/>' },

    // 6) Center Pulse & Minimal
    { id: 'pulse', cat: 'pulse', name: 'Center Pulse', icon: '<circle cx="12" cy="12" r="6" fill="none" stroke-width="2"/>' },
    { id: 'soft_pulse', cat: 'pulse', name: 'Soft Pulse', icon: '<circle cx="12" cy="12" r="6" fill="currentColor" filter="blur(2px)"/>' },
    { id: 'flat', cat: 'pulse', name: 'Minimal Flat', icon: '<rect x="4" y="11" width="16" height="2" fill="currentColor"/>' },
    { id: 'ticks', cat: 'pulse', name: 'Minimal Ticks', icon: '<path d="M6 10v4M12 8v8M18 10v4" stroke-width="2"/>' },

    // 7) Spectrogram / Equalizer
    { id: 'equalizer', cat: 'eq', name: 'EQ Columns', icon: '<path d="M6 20v-4M6 14v-4M12 20V8M18 20v-6" stroke-width="3"/>' },
    { id: 'eq_ladder', cat: 'eq', name: 'EQ Ladder', icon: '<path d="M4 18h4M4 14h4M4 10h4M10 18h4" stroke-width="2"/>' },
    { id: 'spec_hills', cat: 'eq', name: 'Spectrum Hills', icon: '<path d="M2 20 Q6 10 12 20 Q16 12 22 20" fill="currentColor" fill-opacity="0.5"/>' },
    { id: 'spec_water', cat: 'eq', name: 'Waterfall', icon: '<path d="M2 20L6 10L10 18L16 6L22 20" fill="none" stroke-width="2" stroke-linejoin="miter"/>' },
    { id: 'freq_glow', cat: 'eq', name: 'Frequency Glow', icon: '<path d="M4 20v-8M12 20v-14M20 20v-6" stroke-width="3" filter="blur(1px)"/>' },

    // 8) Special Cinematic
    { id: 'cine_horizon', cat: 'cinematic', name: 'Cinematic Horizon', icon: '<path d="M2 12 Q8 8 12 12 T22 12" fill="none" stroke-width="2"/>' },
    { id: 'cine_energy', cat: 'cinematic', name: 'Energy Wave', icon: '<path d="M4 12l4 -8 4 16 4 -12 4 4" fill="none" stroke-width="2" stroke-linejoin="round"/>' },
    { id: 'cine_beams', cat: 'cinematic', name: 'Cinematic Beams', icon: '<path d="M6 20V4M12 20V8M18 20v-8" stroke-opacity="0.5" stroke-width="4"/>' },
    { id: 'cine_mist', cat: 'cinematic', name: 'Mist Wave', icon: '<path d="M2 12 Q8 8 12 12 T22 12" fill="none" stroke-width="4" filter="blur(2px)"/>' },
    { id: 'dark_doc', cat: 'cinematic', name: 'Dark Doc', icon: '<path d="M6 12h12M12 8v8" stroke-width="2"/>' }
];

let wvSearchTerm = '';
let wvCurrentCat = 'all';

function renderWaveformLibrary() {
    const grid = document.getElementById('wvLibraryGrid');
    if (!grid) return;
    grid.innerHTML = '';

    let items = WAVEFORM_LIBS.filter(w => {
        const matchSearch = w.name.toLowerCase().includes(wvSearchTerm.toLowerCase());
        let matchCat = wvCurrentCat === 'all' || w.cat === wvCurrentCat;
        if (wvCurrentCat === 'favorites') matchCat = AppState.waveform.favorites.includes(w.id);
        if (wvCurrentCat === 'recent') matchCat = AppState.waveform.recent.includes(w.id);
        return matchSearch && matchCat;
    });

    if (wvCurrentCat === 'recent') {
        const recentOrdered = [];
        AppState.waveform.recent.forEach(rid => {
            const found = items.find(i => i.id === rid);
            if (found) recentOrdered.push(found);
        });
        items = recentOrdered;
    }

    if (items.length === 0) {
        grid.innerHTML = '<div style="grid-column: span 2; text-align:center; padding: 20px; color: var(--text-muted); font-size: 13px;">No waveforms found in this category.</div>';
        return;
    }

    items.forEach(w => {
        const isFav = AppState.waveform.favorites.includes(w.id);
        const isActive = AppState.waveform.style === w.id;

        const div = document.createElement('div');
        div.className = `wv-thumb ${isActive ? 'active' : ''}`;
        div.dataset.style = w.id;

        div.innerHTML = `
            <div class="wv-star ${isFav ? 'active' : ''}" data-id="${w.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </div>
            <div class="wv-thumb-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor">${w.icon}</svg>
            </div>
            <div class="wv-thumb-info">
                <div class="wv-thumb-name">${w.name}</div>
                <div class="wv-thumb-cat">${w.cat}</div>
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (e.target.closest('.wv-star')) {
                const sid = e.target.closest('.wv-star').dataset.id;
                if (AppState.waveform.favorites.includes(sid)) {
                    AppState.waveform.favorites = AppState.waveform.favorites.filter(id => id !== sid);
                } else {
                    AppState.waveform.favorites.push(sid);
                }
                renderWaveformLibrary();
                return;
            }

            AppState.waveform.style = w.id;
            AppState.waveform.recent = [w.id, ...AppState.waveform.recent.filter(i => i !== w.id)].slice(0, 10);
            renderWaveformLibrary();
        });

        grid.appendChild(div);
    });
}

document.getElementById('wvSearch').addEventListener('input', (e) => { wvSearchTerm = e.target.value; renderWaveformLibrary(); });
document.getElementById('wvCategoryFilter').addEventListener('change', (e) => { wvCurrentCat = e.target.value; renderWaveformLibrary(); });

// Waveform Controls Listeners
document.getElementById('wvColor').addEventListener('input', e => AppState.waveform.color = e.target.value);
document.getElementById('wvScale').addEventListener('input', e => AppState.waveform.scale = parseInt(e.target.value));
document.getElementById('wvPosY').addEventListener('input', e => AppState.waveform.y = parseInt(e.target.value));
document.getElementById('wvAlpha').addEventListener('input', e => AppState.waveform.alpha = parseFloat(e.target.value));
document.getElementById('wvThickness').addEventListener('input', e => AppState.waveform.thickness = parseInt(e.target.value));
document.getElementById('wvGlow').addEventListener('input', e => AppState.waveform.glow = parseInt(e.target.value));
document.getElementById('wvBlur').addEventListener('input', e => AppState.waveform.blur = parseInt(e.target.value));
document.getElementById('wvSensitivity').addEventListener('input', e => AppState.waveform.sensitivity = parseInt(e.target.value));
document.getElementById('wvSmoothness').addEventListener('input', e => AppState.waveform.smoothness = parseInt(e.target.value));
document.getElementById('wvRounding').addEventListener('input', e => AppState.waveform.rounding = parseInt(e.target.value));
document.getElementById('wvColorMode').addEventListener('change', e => AppState.waveform.colorMode = e.target.value);
document.getElementById('wvStereoMode').addEventListener('change', e => AppState.waveform.stereoMode = e.target.value);
document.getElementById('wvMirror').addEventListener('change', e => AppState.waveform.mirror = e.target.checked);
document.getElementById('wvHalo').addEventListener('change', e => AppState.waveform.halo = e.target.checked);
document.getElementById('wvAutoCenter').addEventListener('change', e => AppState.waveform.autoCenter = e.target.checked);
document.getElementById('wvCinematicMode').addEventListener('change', e => AppState.waveform.cinematicMode = e.target.checked);
document.getElementById('wvBeatEmphasis').addEventListener('change', e => AppState.waveform.beatEmphasis = e.target.checked);

const setPreset = (color, scale, thick, alpha, glow, blur, sens, smooth, mirror, halo, auto, cine, style) => {
    AppState.waveform = { ...AppState.waveform, ...{ color, scale, thickness: thick, alpha, glow, blur, sensitivity: sens, smoothness: smooth, mirror, halo, autoCenter: auto, cinematicMode: cine, style } };
    AppState.waveform.recent = [style, ...AppState.waveform.recent.filter(i => i !== style)].slice(0, 10);

    document.getElementById('wvColor').value = color;
    document.getElementById('wvScale').value = scale;
    document.getElementById('wvThickness').value = thick;
    document.getElementById('wvAlpha').value = alpha;
    document.getElementById('wvGlow').value = glow;
    document.getElementById('wvBlur').value = blur;
    document.getElementById('wvSensitivity').value = sens;
    document.getElementById('wvSmoothness').value = smooth;
    document.getElementById('wvMirror').checked = mirror;
    document.getElementById('wvHalo').checked = halo;
    document.getElementById('wvAutoCenter').checked = auto;
    document.getElementById('wvCinematicMode').checked = cine;

    renderWaveformLibrary();
};

document.getElementById('wvPreset').addEventListener('change', (e) => {
    switch (e.target.value) {
        case 'podcast': setPreset('#10b981', 120, 6, 0.9, 10, 0, 10, 80, false, false, true, false, 'bars'); break;
        case 'cinematic': setPreset('#1E1E22', 200, 2, 0.7, 30, 2, 8, 95, false, true, true, true, 'cine_horizon'); break;
        case 'neon': setPreset('#ff00aa', 250, 8, 1.0, 50, 0, 15, 60, true, true, true, false, 'neon_line'); break;
        case 'documentary': setPreset('#55565A', 80, 2, 0.5, 0, 0, 5, 90, false, false, true, true, 'dark_doc'); break;
        case 'spiritual': setPreset('#374151', 250, 4, 0.6, 40, 5, 12, 95, true, true, true, true, 'cine_mist'); break;
        case 'trailer': setPreset('#ef4444', 350, 6, 0.9, 40, 0, 20, 50, false, true, true, false, 'cine_energy'); break;
    }
});

setTimeout(renderWaveformLibrary, 100);

// --- RENDER ENGINE LOOP ---
let particleStars = Array.from({ length: 150 }).map(() => ({
    x: Math.random() * C_W, y: Math.random() * C_H,
    s: Math.random() * 3 + 1, a: Math.random(), v: Math.random() * 0.02 + 0.01
}));

function renderCanvas() {
    try {
        ctx.clearRect(0, 0, C_W, C_H);

        // Base Background
        if (!AppState.bg.transparentBg) {
            if (AppState.bg.showGradient) {
                const baseGrad = ctx.createRadialGradient(C_W / 2, 0, 0, C_W / 2, C_H / 2, C_H);
                baseGrad.addColorStop(0, '#FFFFFF');
                baseGrad.addColorStop(1, '#F2F2F4');
                ctx.fillStyle = baseGrad;
                ctx.fillRect(0, 0, C_W, C_H);
            } else {
                ctx.fillStyle = AppState.bg.solidColor;
                ctx.fillRect(0, 0, C_W, C_H);
            }
        }

        // Render Image Output
        if (AppState.bg.active && AppState.bg.imgObj) {
            const st = AppState.imgStudio;
            let filterStr = `blur(${AppState.bg.blur}px)`;

            // Unconditional color correction application if not default
            if (st.bri !== 1) filterStr += ` brightness(${st.bri})`;
            if (st.con !== 1) filterStr += ` contrast(${st.con})`;
            if (st.sat !== 1) filterStr += ` saturate(${st.sat})`;
            if (st.tint !== 0) filterStr += ` hue-rotate(${st.tint * 40}deg)`;
            if (st.tmp > 0) filterStr += ` sepia(${st.tmp * 0.5})`; // Warmth approx

            ctx.filter = filterStr;

            const w = C_W * AppState.bg.zoom;
            // Native scaling approximation
            const h = (C_W * (AppState.bg.imgObj.naturalHeight / AppState.bg.imgObj.naturalWidth)) * AppState.bg.zoom;
            const dy = (C_H / 2 - h / 2) + AppState.bg.y;
            const dx = (C_W - w) / 2;

            // Apply masked layer cutout vs normal draw
            if (st.maskCanvas && st.active && (!st.showOrig || !st.maskMode)) {
                // If mask mode is active, draw the masked subject layer
                const tc = document.createElement('canvas'); tc.width = w; tc.height = h;
                const tx = tc.getContext('2d');
                tx.filter = filterStr;
                tx.drawImage(AppState.bg.imgObj, 0, 0, w, h);
                tx.filter = 'none';

                tx.globalCompositeOperation = 'destination-in';
                tx.drawImage(st.maskCanvas, 0, 0, w, h);

                ctx.save();
                ctx.globalCompositeOperation = st.blend;
                ctx.globalAlpha = st.subjOp;
                ctx.drawImage(tc, dx, dy, w, h);
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalCompositeOperation = st.blend;
                ctx.globalAlpha = st.subjOp;
                ctx.drawImage(AppState.bg.imgObj, dx, dy, w, h);
                ctx.restore();
            }
            ctx.filter = 'none';

            // Draw mask preview overlay while Editing
            if (st.maskMode && st.showOrig && st.maskCanvas && st.active) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(dx, dy, w, h);

                const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
                const mctx = mc.getContext('2d');
                mctx.drawImage(st.maskCanvas, 0, 0, w, h);
                mctx.globalCompositeOperation = 'source-in';
                mctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
                mctx.fillRect(0, 0, w, h);

                ctx.drawImage(mc, dx, dy, w, h);
            }

            // Image Studio FX Overlays (Unconditional if > 0)
            if (st.grn > 0) {
                ctx.fillStyle = `rgba(180,180,180, ${st.grn * 0.25})`;
                for (let i = 0; i < 300; i++) ctx.fillRect(Math.random() * C_W, Math.random() * C_H, 2, 2);
            }
            if (st.leak > 0) {
                const lGrad = ctx.createLinearGradient(0, 0, C_W * 0.6, C_H * 0.4);
                lGrad.addColorStop(0, `rgba(255,100,0,${st.leak * 0.4})`);
                lGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = lGrad;
                ctx.fillRect(0, 0, C_W, C_H);
                ctx.globalCompositeOperation = 'source-over';
            }
            if (st.sun > 0) {
                const sGrad = ctx.createRadialGradient(C_W, 0, 0, C_W, 0, C_W);
                sGrad.addColorStop(0, `rgba(255, 250, 200, ${st.sun * 0.5})`);
                sGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = sGrad;
                ctx.fillRect(0, 0, C_W, C_H);
                ctx.globalCompositeOperation = 'source-over';
            }
            if (st.grad > 0) {
                const gGrad = ctx.createLinearGradient(0, 0, C_W, C_H);
                gGrad.addColorStop(0, `rgba(30, 0, 100, ${st.grad * 0.4})`);
                gGrad.addColorStop(1, `rgba(0, 150, 100, ${st.grad * 0.4})`);
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillStyle = gGrad;
                ctx.fillRect(0, 0, C_W, C_H);
                ctx.globalCompositeOperation = 'source-over';
            }
            if (st.spot > 0) {
                const spotGrad = ctx.createRadialGradient(C_W / 2, C_H * 0.4, 0, C_W / 2, C_H * 0.4, C_W * 0.6);
                spotGrad.addColorStop(0, `rgba(255, 255, 255, ${st.spot})`);
                spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillStyle = spotGrad;
                ctx.fillRect(0, 0, C_W, C_H);
                ctx.globalCompositeOperation = 'source-over';
            }
            if (st.fog > 0) {
                ctx.fillStyle = `rgba(220, 230, 240, ${st.fog * 0.5})`;
                ctx.fillRect(0, 0, C_W, C_H);
            }
            if (st.bokeh) {
                ctx.fillStyle = '#FFFFFF';
                particleStars.forEach(p => {
                    p.a += p.v; if (p.a >= Math.PI * 2) p.a = 0;
                    ctx.globalAlpha = Math.abs(Math.sin(p.a)) * 0.5;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.s * 4, 0, Math.PI * 2);
                    ctx.shadowBlur = Math.max(15, p.s * 5);
                    ctx.shadowColor = '#FFFFFF';
                    ctx.fill();
                    ctx.shadowBlur = 0;
                });
                ctx.globalAlpha = 1;
            }

        }

        // TOP BLUR FADE (Mist Effect) - Refined
        if (AppState.bg.topBlurEnable) {
            const tempC = document.createElement('canvas');
            tempC.width = C_W;
            tempC.height = C_H;
            const tempCtx = tempC.getContext('2d');

            // 1) Draw blurred image onto temp canvas
            tempCtx.filter = `blur(${AppState.bg.topBlurStrength}px)`;
            tempCtx.drawImage(AppState.bg.imgObj, dx, dy, w, h);
            tempCtx.filter = 'none';

            // 2) Optional Solid Color Tint overlay directly onto the blur buffer
            if (AppState.bg.topBlurColorAlpha > 0) {
                tempCtx.save();
                tempCtx.globalCompositeOperation = 'source-over';
                tempCtx.fillStyle = AppState.bg.topBlurColor;
                tempCtx.globalAlpha = AppState.bg.topBlurColorAlpha;
                tempCtx.fillRect(0, 0, C_W, C_H);
                tempCtx.restore();
            }

            // 3) Apply Mask (Destination-In)
            tempCtx.globalCompositeOperation = 'destination-in';
            const fH = C_H * (AppState.bg.topBlurHeight / 100);
            const startY = AppState.bg.topBlurY;
            const endY = startY + fH;

            const maskGrad = tempCtx.createLinearGradient(0, startY, 0, endY);
            // The blur is fully visible at startY
            maskGrad.addColorStop(0, 'rgba(0,0,0,1)');

            // Feather Softness controls how smooth the transition is.
            // 100% feather = gradual fade from startY to endY.
            // 0% feather = sharp cut at endY.
            const feather = AppState.bg.topBlurFeather / 100;
            const midpoint = Math.max(0, Math.min(0.99, 1 - feather));
            if (midpoint > 0 && midpoint < 1) {
                maskGrad.addColorStop(midpoint, 'rgba(0,0,0,1)');
            }

            // Fully transparent at endY
            maskGrad.addColorStop(1, 'rgba(0,0,0,0)');

            tempCtx.fillStyle = maskGrad;
            tempCtx.fillRect(0, 0, C_W, C_H);

            // 4) Blend back onto main canvas
            ctx.save();
            ctx.globalAlpha = AppState.bg.topBlurOpacity;
            ctx.globalCompositeOperation = AppState.bg.topBlurBlendMode;
            ctx.drawImage(tempC, 0, 0);
            ctx.restore();
        }
        // Particle Stars (Optional but useful if user wants white stars on gray?)
        if (AppState.bg.stars) {
            ctx.fillStyle = '#FFFFFF';
            particleStars.forEach(p => {
                p.a += p.v; if (p.a >= Math.PI * 2) p.a = 0;
                ctx.globalAlpha = Math.abs(Math.sin(p.a)) * 0.5;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        // Overlays
        if (AppState.bg.darkOverlay > 0) {
            ctx.fillStyle = `rgba(0,0,0,${AppState.bg.darkOverlay})`;
            ctx.fillRect(0, 0, C_W, C_H);
        }
        if (AppState.bg.vignette) {
            const vRad = ctx.createRadialGradient(C_W / 2, C_H / 2, C_W / 4, C_W / 2, C_H / 2, C_H);
            vRad.addColorStop(0, 'rgba(0,0,0,0)');
            vRad.addColorStop(1, 'rgba(0,0,0,0.85)');
            ctx.fillStyle = vRad;
            ctx.fillRect(0, 0, C_W, C_H);
        }

        // Audio Waveform Visuals
        const wv = AppState.waveform;
        if (analyser && !DOM.nativeAudio.paused) {

            let smooth = wv.smoothness / 100;
            if (wv.cinematicMode) smooth = Math.max(smooth, 0.90);
            analyser.smoothingTimeConstant = smooth;

            analyser.getByteFrequencyData(dataArray);
            analyser.getByteTimeDomainData(timeArray);

            const renderLen = Math.floor(dataArray.length * 0.75);
            const slice = C_W / renderLen;
            const cy = wv.y;

            const sensitivity = wv.sensitivity / 10;
            const cineDampening = wv.cinematicMode ? 0.6 : 1.0;

            ctx.save();
            ctx.globalAlpha = wv.alpha;

            // Halo Background Render
            if (wv.halo) {
                const avg = Array.from(dataArray).reduce((a, b) => a + b) / dataArray.length;
                const radius = (avg / 255) * wv.scale * 2 * sensitivity * cineDampening;
                const haloGrad = ctx.createRadialGradient(C_W / 2, cy, 0, C_W / 2, cy, C_W);
                haloGrad.addColorStop(0, wv.color);
                haloGrad.addColorStop(0.3, 'rgba(0,0,0,0)');
                ctx.save();
                ctx.globalAlpha = wv.alpha * 0.3 * (wv.cinematicMode ? 0.5 : 1);
                ctx.fillStyle = haloGrad;
                ctx.globalCompositeOperation = 'screen';
                if (radius > 10) {
                    ctx.beginPath();
                    ctx.arc(C_W / 2, cy, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            // Glow Setup
            let glow = wv.glow;
            if (wv.cinematicMode) glow = Math.max(glow, 20);
            if (glow > 0 || wv.blur > 0) {
                ctx.shadowBlur = glow + wv.blur;
                ctx.shadowColor = wv.color;
                if (wv.blur > 0) ctx.filter = `blur(${wv.blur}px)`;
            }

            ctx.fillStyle = wv.color;
            ctx.strokeStyle = wv.color;
            ctx.lineWidth = wv.thickness;
            ctx.lineCap = 'round';

            // Auto-center X offset
            let startX = wv.autoCenter ? (C_W - (renderLen * slice)) / 2 : 0;

            ctx.beginPath();

            // Reusable loop logic
            const wdef = WAVEFORM_LIBS.find(w => w.id === wv.style) || WAVEFORM_LIBS[0];
            const cat = wdef.cat;
            const id = wv.style;

            const getColor = (i, len, h) => {
                if (wv.colorMode === 'solid') return wv.color;
                if (wv.colorMode === 'duotone') return i < len / 2 ? wv.color : '#ffffff';
                if (wv.colorMode === 'gradient') {
                    let g = ctx.createLinearGradient(0, cy, 0, cy - (Math.max(1, h)));
                    g.addColorStop(0, wv.color); g.addColorStop(1, '#ffffff');
                    return g;
                }
                return wv.color;
            };

            const buildBar = (x, y, w, h, mirror, col, rounding) => {
                const drawH = Math.max(2, h * sensitivity * cineDampening);
                ctx.fillStyle = col;
                if (wv.beatEmphasis && h > 150) ctx.shadowBlur = Math.max(ctx.shadowBlur, 40);

                if (rounding > 0 && ctx.roundRect) {
                    ctx.beginPath();
                    if (mirror) ctx.roundRect(x, y - drawH, w, drawH * 2, rounding);
                    else ctx.roundRect(x, y - drawH, w, drawH, [rounding, rounding, 0, 0]);
                    ctx.fill();
                } else {
                    if (mirror) ctx.fillRect(x, y - drawH, w, drawH * 2);
                    else ctx.fillRect(x, y - drawH, w, drawH);
                }
            };

            if (cat === 'bars' || cat === 'mirror') {
                for (let i = 0; i < renderLen; i++) {
                    const h = (dataArray[i] / 255) * wv.scale;
                    let w = slice - 2;
                    let m = wv.mirror || cat === 'mirror';

                    if (id === 'thin_bars') w = Math.max(1, slice / 4);
                    if (id === 'fat_bars') w = slice + 2;
                    if (id === 'segmented') {
                        ctx.fillStyle = getColor(i, renderLen, h);
                        let segs = Math.max(1, Math.floor(h / 10));
                        for (let s = 0; s < segs; s++) ctx.fillRect(startX + i * slice, cy - (s * 12), w, 8);
                        continue;
                    }
                    if (id === 'stereo_split') {
                        if (i % 2 === 0) buildBar(startX + i / 2 * slice, cy, w, h, false, getColor(i, renderLen, h), wv.rounding);
                        else buildBar(C_W / 2 + startX + i / 2 * slice, cy, w, h, false, getColor(i, renderLen, h), wv.rounding);
                        continue;
                    }

                    buildBar(startX + i * slice, cy, Math.max(1, w), h, m, getColor(i, renderLen, h), wv.rounding);
                }
            } else if (cat === 'lines' || id === 'spec_water') {
                ctx.beginPath();
                for (let i = 0; i < renderLen; i++) {
                    let h = (dataArray[i] / 255) * wv.scale * sensitivity * cineDampening;
                    if (id === 'wave_ribbon') h *= Math.sin(i * 0.1);
                    const yPos = cy - h;
                    if (i === 0) ctx.moveTo(startX, yPos);
                    else ctx.lineTo(startX + i * slice, yPos);
                }
                ctx.stroke();

                if (id === 'dual_line' || id === 'triple_line' || id === 'neon_line' || wv.mirror) {
                    ctx.beginPath();
                    for (let i = 0; i < renderLen; i++) {
                        let h = (dataArray[i] / 255) * wv.scale * sensitivity * cineDampening;
                        if (id === 'wave_ribbon') h *= Math.sin(i * 0.1);
                        if (i === 0) ctx.moveTo(startX, cy + h);
                        else ctx.lineTo(startX + i * slice, cy + h);
                    }
                    ctx.globalAlpha = id === 'neon_line' ? wv.alpha * 0.5 : wv.alpha;
                    ctx.stroke();
                }
                if (id === 'triple_line') {
                    ctx.beginPath();
                    for (let i = 0; i < renderLen; i++) {
                        let h = (dataArray[i] / 255) * wv.scale * sensitivity * cineDampening * 0.5;
                        if (i === 0) ctx.moveTo(startX, cy - h);
                        else ctx.lineTo(startX + i * slice, cy - h);
                    }
                    ctx.stroke();
                }
            } else if (cat === 'dots') {
                for (let i = 0; i < renderLen; i += 3) {
                    const h = (dataArray[i] / 255) * wv.scale * sensitivity * cineDampening;
                    ctx.fillStyle = getColor(i, renderLen, h);
                    if (id === 'dot_bars') {
                        let ds = Math.max(1, h / 5);
                        for (let d = 0; d < ds; d++) { ctx.beginPath(); ctx.arc(startX + i * slice, cy - d * 8, wv.thickness, 0, Math.PI * 2); ctx.fill(); }
                    } else if (id === 'particle_pulse') {
                        ctx.beginPath(); ctx.arc(startX + i * slice, cy - h + Math.sin(i) * 10, wv.thickness + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
                    } else if (id === 'sparkle') {
                        ctx.beginPath(); ctx.fillRect(startX + i * slice, cy - h + (Math.random() * 10 - 5), wv.thickness, wv.thickness);
                    } else {
                        ctx.beginPath(); ctx.arc(startX + i * slice, cy - h, wv.thickness, 0, Math.PI * 2); ctx.fill();
                        if (wv.mirror) { ctx.beginPath(); ctx.arc(startX + i * slice, cy + h, wv.thickness, 0, Math.PI * 2); ctx.fill(); }
                    }
                }
            } else if (cat === 'circular') {
                const cx = C_W / 2;
                const maxH = (Math.max(...dataArray) / 255) * wv.scale * sensitivity * cineDampening;
                const rad = Math.max(50, wv.scale + maxH / 2);

                ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();

                if (id === 'double_ring') { ctx.beginPath(); ctx.arc(cx, cy, rad * 0.8, 0, Math.PI * 2); ctx.stroke(); }
                if (id === 'orbit_ring') { ctx.beginPath(); ctx.arc(cx, cy, rad * 1.2, 0, Math.PI * 2); ctx.setLineDash([10, 15]); ctx.stroke(); ctx.setLineDash([]); }
                if (id === 'radar') {
                    ctx.beginPath(); ctx.moveTo(cx, cy);
                    const angle = Date.now() / 500;
                    ctx.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
                    ctx.stroke();
                }
                if (id === 'vinyl_ring') {
                    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.lineWidth = 15; ctx.stroke(); ctx.lineWidth = wv.thickness;
                    ctx.beginPath(); ctx.arc(cx, cy, rad * 0.1, 0, Math.PI * 2); ctx.fill();
                }
            } else if (cat === 'pulse') {
                const maxA = Math.max(...dataArray) / 255 * sensitivity * cineDampening;
                const hh = maxA * wv.scale;

                if (id === 'flat') {
                    ctx.fillRect(startX, cy - hh / 2, C_W - startX * 2, Math.max(wv.thickness, hh));
                } else if (id === 'ticks') {
                    for (let i = 0; i < 10; i++) {
                        ctx.fillRect(startX + i * (C_W / 10), cy - hh / 2, wv.thickness, Math.max(2, hh));
                    }
                } else {
                    const r = wv.scale / 2 + hh;
                    ctx.beginPath(); ctx.arc(C_W / 2, cy, Math.max(1, r), 0, Math.PI * 2);
                    if (id === 'pulse') { ctx.stroke(); ctx.beginPath(); ctx.arc(C_W / 2, cy, Math.max(1, r * 0.7), 0, Math.PI * 2); ctx.fill(); }
                    else ctx.fill();
                }
            } else if (cat === 'eq' && id !== 'spec_water') {
                const bands = 12;
                const itemsP = Math.floor(renderLen / bands);
                const bW = (C_W - startX * 2) / bands;
                if (id === 'spec_hills') {
                    ctx.beginPath(); ctx.moveTo(startX, cy);
                    for (let b = 0; b < bands; b++) {
                        let sum = 0; for (let i = 0; i < itemsP; i++) sum += dataArray[b * itemsP + i];
                        const h = (sum / itemsP / 255) * wv.scale * sensitivity * cineDampening;
                        ctx.quadraticCurveTo(startX + b * bW + bW / 2, cy - h, startX + (b + 1) * bW, cy);
                    }
                    ctx.fill();
                } else if (id === 'freq_glow') {
                    for (let b = 0; b < bands; b++) {
                        let sum = 0; for (let i = 0; i < itemsP; i++) sum += dataArray[b * itemsP + i];
                        const h = (sum / itemsP / 255) * wv.scale * sensitivity * cineDampening;
                        ctx.shadowBlur = 50;
                        buildBar(startX + b * bW + bW * 0.1, cy, bW * 0.8, h, wv.mirror, wv.color, wv.rounding);
                    }
                } else {
                    for (let b = 0; b < bands; b++) {
                        let sum = 0; for (let i = 0; i < itemsP; i++) sum += dataArray[b * itemsP + i];
                        const h = (sum / itemsP / 255) * wv.scale * sensitivity * cineDampening;
                        const blocks = Math.max(1, Math.floor(h / (wv.thickness * 2 + 2)));
                        for (let k = 0; k < blocks; k++) {
                            const by = cy - (k * (wv.thickness * 2 + 2));
                            if (id === 'eq_ladder') {
                                ctx.fillRect(startX + b * bW + bW * 0.1, by, bW * 0.8, wv.thickness);
                            } else {
                                ctx.fillRect(startX + b * bW + bW * 0.1, by, bW * 0.8, wv.thickness * 2);
                                if (wv.mirror) ctx.fillRect(startX + b * bW + bW * 0.1, cy + (k * (wv.thickness * 2 + 2)), bW * 0.8, wv.thickness * 2);
                            }
                        }
                    }
                }
            } else if (cat === 'cinematic') {
                if (id === 'dark_doc') {
                    const avgA = (Array.from(dataArray).reduce((a, b) => a + b) / dataArray.length) / 255;
                    const hh = avgA * wv.scale * sensitivity * cineDampening;
                    ctx.lineWidth = wv.thickness;
                    ctx.moveTo(C_W * 0.1, cy); ctx.lineTo(C_W * 0.9, cy);
                    ctx.moveTo(C_W / 2, cy - hh); ctx.lineTo(C_W / 2, cy + hh);
                    ctx.stroke();
                } else if (id === 'cine_beams' || id === 'cine_energy') {
                    ctx.globalCompositeOperation = 'screen';
                    for (let i = 0; i < renderLen; i++) {
                        const h = (dataArray[i] / 255) * wv.scale * sensitivity * cineDampening * 2;
                        if (id === 'cine_energy') {
                            if (i % 4 === 0) { ctx.moveTo(startX + i * slice, cy); ctx.lineTo(startX + (i + 2) * slice, cy - h); ctx.lineTo(startX + (i + 4) * slice, cy); }
                        } else {
                            const grad = ctx.createLinearGradient(0, cy, 0, cy - h);
                            grad.addColorStop(0, wv.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
                            ctx.fillStyle = grad;
                            ctx.fillRect(startX + i * slice, cy - Math.max(0, h), Math.max(1, slice * 1.5), Math.max(0, h));
                            if (wv.mirror) {
                                const grad2 = ctx.createLinearGradient(0, cy, 0, cy + h);
                                grad2.addColorStop(0, wv.color); grad2.addColorStop(1, 'rgba(0,0,0,0)');
                                ctx.fillStyle = grad2;
                                ctx.fillRect(startX + i * slice, cy, Math.max(1, slice * 1.5), Math.max(0, h));
                            }
                        }
                    }
                    if (id === 'cine_energy') ctx.stroke();
                    ctx.globalCompositeOperation = 'source-over';
                } else {
                    ctx.lineWidth = wv.thickness;
                    const step = Math.ceil(timeArray.length / C_W * 2);
                    if (id === 'cine_mist') ctx.shadowBlur = Math.max(ctx.shadowBlur, 50);

                    ctx.beginPath();
                    for (let x = 0; x < C_W; x++) {
                        const dataIndex = Math.floor((x / C_W) * timeArray.length);
                        const v = (timeArray[dataIndex] - 128) / 128;
                        let yPos = cy + (v * wv.scale * sensitivity * cineDampening * 2);

                        const envelope = Math.sin((x / C_W) * Math.PI);
                        yPos = cy + ((yPos - cy) * envelope);

                        if (x === 0) ctx.moveTo(x, yPos);
                        else ctx.lineTo(x, yPos);
                    }
                    ctx.stroke();

                    if (id === 'cine_horizon' || wv.mirror) {
                        ctx.beginPath();
                        for (let x = 0; x < C_W; x++) {
                            const dataIndex = Math.floor((x / C_W) * timeArray.length);
                            const v = (timeArray[dataIndex] - 128) / 128;
                            let yPos = cy - (v * wv.scale * sensitivity * cineDampening * 2);
                            const envelope = Math.sin((x / C_W) * Math.PI);
                            yPos = cy - ((yPos - cy) * envelope);

                            if (x === 0) ctx.moveTo(x, yPos);
                            else ctx.lineTo(x, yPos);
                        }
                        ctx.globalAlpha = wv.alpha * 0.4;
                        ctx.stroke();
                    }
                }
            }

            ctx.restore();
        }

        // Texts
        const t = AppState.text;

        let texts = [
            { txt: t.title, sz: t.size, w: '900', col: '#1E1E22' },
            { txt: t.guest, sz: t.size * 0.5, w: '600', col: '#10b981' },
            { txt: t.subtitle, sz: t.size * 0.4, w: '400', col: '#55565A' }
        ];

        let ty = t.y;

        // Background Pill (dynamically sized based on text block height)
        if (t.pill) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            const tH = texts.length * t.size * t.lineSpacing;
            ctx.beginPath();
            ctx.roundRect(C_W * 0.05, ty - t.size * 1.2, C_W * 0.9, tH + t.size, 30);
            if (t.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.1)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10; }
            ctx.fill();
            ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        }

        texts.forEach((line) => {
            if (!line.txt) return;
            // Native letter-spacing in canvas (modern browsers support it)
            if (ctx.letterSpacing !== undefined) {
                ctx.letterSpacing = `${t.tracking}px`;
            }
            ctx.font = `${line.w} ${line.sz}px ${t.fontFamily}`;

            // RTL text setup
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.direction = 'rtl';

            if (t.shadow) {
                ctx.shadowColor = 'rgba(0,0,0,0.25)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetY = 4;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }

            if (t.strokeWidth > 0) {
                ctx.miterLimit = 2;
                ctx.lineJoin = 'round';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = t.strokeWidth;
                ctx.strokeText(line.txt, C_W / 2, ty);
            }

            ctx.fillStyle = line.col;
            ctx.fillText(line.txt, C_W / 2, ty);

            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';

            ty += (line.sz * t.lineSpacing);
        });

    } catch (e) {
        log(`Canvas Render Error: ${e.message}`, 'err');
    }

    if (!AppState.exporting) requestAnimationFrame(renderCanvas);
}

// Start visual engine securely
requestAnimationFrame(renderCanvas);

// --- MEDIA RECORDER EXPORT SYSTEM (CRASH FREE OPTIONS) ---
let mediaRecorder;
let recordedChunks = [];

document.getElementById('headerExportBtn').addEventListener('click', () => { document.querySelector('[data-tab="export"]').click(); });

document.getElementById('btnStartExport').addEventListener('click', async () => {
    try {
        if (!AppState.audio.active) throw new Error("Upload audio to begin export.");

        AppState.exporting = true;
        log("Export initialized: Option B (MediaRecorder Canvas Capture).");

        const uiStatus = document.getElementById('exportStatus');
        const uiProgress = document.getElementById('exportProgress');
        const uiBox = document.getElementById('exportProgressBox');

        document.getElementById('btnStartExport').style.display = 'none';
        document.getElementById('btnDownloadExport').style.display = 'none';
        uiBox.style.display = 'block';
        uiStatus.innerHTML = "<i data-lucide='loader' class='loader-icon'></i> Recording Output Engine in Real-Time...";
        uiProgress.style.width = '0%';
        lucide.createIcons();

        // Bind Context & Dest
        if (!audioCtx) setupWebAudio();
        if (audioCtx.state === 'suspended') await audioCtx.resume();

        // Canvas Track (30FPS)
        const canvasStream = DOM.canvas.captureStream(30);
        // Audio Track mapped to MediaDest
        const audioTracks = streamDest.stream.getAudioTracks();
        if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);

        // Output Bitrate Validation
        const bps = parseInt(document.getElementById('exportQuality').value);
        let options = { mimeType: 'video/webm; codecs=vp8,opus', videoBitsPerSecond: bps, audioBitsPerSecond: 192000 };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm', videoBitsPerSecond: bps };

        mediaRecorder = new MediaRecorder(canvasStream, options);
        recordedChunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };

        mediaRecorder.onstop = async () => {
            let finalOutputUrl = null;
            let finalFileName = null;

            try {
                log("MediaRecorder closed chunks. Beginning MP4 packaging...");
                lucide.createIcons();

                const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });

                // FINAL FALLBACK UI - WebM (Hidden by default)
                const fallbackBtn = document.getElementById('btnFallbackDownload');
                if (fallbackBtn) {
                    fallbackBtn.href = URL.createObjectURL(webmBlob);
                    fallbackBtn.download = `WAVO_WebM_Backup_${Date.now()}.webm`;
                }

                if (webmBlob.size === 0) throw new Error("Render generated an empty video. Canvas might be frozen.");

                // Attempt 1: Server Side Transcoding (Preferred for stability and speed if available)
                try {
                    uiStatus.innerHTML = "<i data-lucide='server' class='loader-icon'></i> Server-Side MP4 Encoding (Fast)...";
                    uiProgress.style.width = '100%';
                    uiProgress.style.background = '#fbbf24'; // Warning-ish yellow for process wait
                    lucide.createIcons();
                    log("Attempting Server-Side Transcode via /api/transcode...");

                    const formData = new FormData();
                    formData.append('video', webmBlob, 'input.webm');

                    const reqStart = Date.now();
                    const response = await fetch('/api/transcode', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) throw new Error(`Server returned ${response.status}`);

                    const mp4Blob = await response.blob();
                    if (mp4Blob.size === 0) throw new Error("Server returned empty MP4.");

                    log(`Server transcode successful in ${(Date.now() - reqStart)}ms!`);
                    finalOutputUrl = URL.createObjectURL(mp4Blob);
                    finalFileName = `WAVO_AI_Video_${Date.now()}.mp4`;

                } catch (serverErr) {
                    log(`Server-side transcode skipped/failed: ${serverErr.message}. Falling back to Browser FFmpeg...`, 'warn');

                    // Attempt 2: Local FFmpeg WASM Transcoding
                    uiStatus.innerHTML = "<i data-lucide='cpu' class='loader-icon'></i> Browser MP4 Transcoding... (May take a moment)";
                    uiProgress.style.background = '#60a5fa'; // Blue for processing
                    lucide.createIcons();

                    const arrayBuffer = await webmBlob.arrayBuffer();
                    const uint8 = new Uint8Array(arrayBuffer);

                    if (!window.FFmpegWASM) throw new Error("FFmpeg WASM library is not loaded.");

                    const { FFmpeg } = window.FFmpegWASM;
                    const ffmpeg = new FFmpeg();

                    // Listen for progress to show true progress
                    ffmpeg.on('progress', ({ progress, time }) => {
                        const p = Math.max(0, Math.min(100, progress * 100));
                        uiProgress.style.width = `${p}%`;
                    });

                    ffmpeg.on('log', ({ message }) => log("FFmpeg: " + message));

                    await ffmpeg.load({
                        coreURL: '/ffmpeg/ffmpeg-core.js',
                        wasmURL: '/ffmpeg/ffmpeg-core.wasm',
                        workerURL: '/ffmpeg/ffmpeg-core.worker.js'
                    });

                    await ffmpeg.writeFile('input.webm', uint8);

                    await ffmpeg.exec([
                        '-i', 'input.webm',
                        '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart',
                        '-preset', 'medium',
                        '-crf', '20',
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-f', 'mp4',
                        'output.mp4'
                    ]);

                    const mp4Data = await ffmpeg.readFile('output.mp4');
                    const mp4BlobClient = new Blob([mp4Data.buffer], { type: 'video/mp4' });

                    if (mp4BlobClient.size === 0) throw new Error("Client encode returned empty MP4.");

                    log("Browser FFmpeg transcode successful!");
                    finalOutputUrl = URL.createObjectURL(mp4BlobClient);
                    finalFileName = `WAVO_AI_Video_${Date.now()}.mp4`;

                    ffmpeg.terminate();
                }

                // If we got here, finalOutputUrl is fully valid.
                uiStatus.innerHTML = "<i data-lucide='check-circle' style='color:#10b981;'></i> Export Completed Successfully!";
                uiProgress.style.width = '100%';
                uiProgress.style.background = '#10b981';

                const btn = document.getElementById('btnDownloadExport');
                btn.href = finalOutputUrl;
                btn.download = finalFileName;
                btn.style.display = 'block';
                btn.textContent = `Download MP4 Video`;

                if (fallbackBtn) fallbackBtn.style.display = 'none';

                AppState.exporting = false;
                requestAnimationFrame(renderCanvas);
                lucide.createIcons();

                document.getElementById('btnStartExport').style.display = 'block';
                document.getElementById('btnStartExport').textContent = 'Render Another Version';

            } catch (err) {
                log(`Final Export Error: ${err.message}`, 'err');
                uiStatus.innerHTML = `<i data-lucide='alert-triangle' style='color:#ef4444;'></i> Export Failed: ${err.message}`;
                uiProgress.style.background = '#ef4444';
                AppState.exporting = false;
                requestAnimationFrame(renderCanvas);
                lucide.createIcons();
                document.getElementById('btnStartExport').style.display = 'block';
                document.getElementById('btnStartExport').textContent = 'Retry Export';

                // Show WebM backup on fail
                const fallbackBtn = document.getElementById('btnFallbackDownload');
                if (fallbackBtn) fallbackBtn.style.display = 'block';
            }
        };

        // Reset and record automatically mapped
        DOM.nativeAudio.pause();
        DOM.nativeAudio.currentTime = 0;

        mediaRecorder.start(100); // 100ms chunks to protect memory mapping safely
        await DOM.nativeAudio.play();

        // Active visual progress update loop matching actual duration length
        function exportLoop() {
            if (!AppState.exporting) return;
            renderCanvas();
            const perc = (DOM.nativeAudio.currentTime / AppState.audio.duration) * 100;
            uiProgress.style.width = `${Math.min(100, Math.max(0, perc))}%`;
            requestAnimationFrame(exportLoop);
        }
        exportLoop();

        // Stop automatically ending recording event safely 
        DOM.nativeAudio.onended = () => {
            if (AppState.exporting) mediaRecorder.stop();
            DOM.nativeAudio.onended = null;
        };

    } catch (e) {
        log(`Export Engine aborted: ${e.message}`, 'err');
        document.getElementById('globalError').textContent = e.message;
        document.getElementById('globalError').style.display = 'block';
        setTimeout(() => { document.getElementById('globalError').style.display = 'none'; }, 4000);
        document.getElementById('btnStartExport').style.display = 'block';
        AppState.exporting = false;
        requestAnimationFrame(renderCanvas);
    }
});
