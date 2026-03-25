// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  backendUrl: 'http://localhost:5000/command',
  openRouterUrl: 'https://openrouter.ai/api/v1/chat/completions',
  openRouterKey: (typeof PRIVATE_CONFIG !== 'undefined') ? PRIVATE_CONFIG.openRouterKey : '',
  openRouterModel: 'openai/gpt-3.5-turbo',
  get useAI() { return this.openRouterKey.length > 10; }, // auto-enables when key is set
  barCount: 28,
  fftSize: 256,
  get maxBarHeight() { return Math.round(window.innerHeight * 0.22); },
};
// the API key is being placed above to ake a new one, simply repce the bove with your own API key to make sure this works
// ─── Identity ─────────────────────────────────────────────────────────────────
const IDENTITY = {
  name: 'WazBot',
  creator: 'Wazingwa Mugala',
  systemPrompt: `You are WazBot, an intelligent AI voice assistant created by Wazingwa Mugala.
You assist with smart home control, Arduino commands, and general conversation.
Keep responses concise and conversational — you will be spoken aloud via text-to-speech.
If anyone asks who created you, who built you, or who made you, always say: "I was created by Wazingwa Mugala."
Your name is WazBot. Never say you were made by OpenAI, Anthropic, or any other company.`,
};

// ─── State ────────────────────────────────────────────────────────────────────
let recognition  = null;
let isListening  = false;
let isSpeaking   = false;
let audioCtx     = null;
let analyser     = null;
let animFrame    = null;
let mediaStream  = null;
let chatHistory  = [{ role: 'system', content: IDENTITY.systemPrompt }];
let currentUtterance = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const micBtn     = document.getElementById('micBtn');
const micLabel   = document.getElementById('micLabel');
const transcript = document.getElementById('transcript');
const log        = document.getElementById('log');
const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const barsEl     = document.getElementById('bars');

// ─── Init bars ────────────────────────────────────────────────────────────────
function initBars() {
  barsEl.innerHTML = '';
  for (let i = 0; i < CONFIG.barCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.id = `bar-${i}`;
    barsEl.appendChild(bar);
  }
}

// ─── Init wave (speaking indicator) ──────────────────────────────────────────
const WAVE_COUNT = 28;
function initWave() {
  const waveEl = document.getElementById('wave');
  waveEl.innerHTML = '';
  for (let i = 0; i < WAVE_COUNT; i++) {
    const b = document.createElement('div');
    b.className = 'wave-bar';
    b.id = `wb-${i}`;
    waveEl.appendChild(b);
  }
}

let waveAnimFrame = null;

function startWave() {
  document.getElementById('waveWrapper').classList.add('active');
  const bars = Array.from(document.querySelectorAll('.wave-bar'));
  let t = 0;
  function tick() {
    waveAnimFrame = requestAnimationFrame(tick);
    t += 0.08;
    bars.forEach((b, i) => {
      // sine wave with offset per bar + random jitter for natural feel
      const phase  = (i / WAVE_COUNT) * Math.PI * 2;
      const height = 4 + Math.abs(Math.sin(t + phase) * 24 + Math.sin(t * 1.7 + phase * 0.5) * 8);
      const hue    = 270 + (i / WAVE_COUNT) * 50;
      b.style.height     = height + 'px';
      b.style.background = `hsl(${hue}, 100%, ${45 + (height / 32) * 20}%)`;
      b.style.boxShadow  = `0 0 ${4 + height / 6}px hsl(${hue}, 100%, 60%)`;
    });
  }
  tick();
}

function stopWave() {
  if (waveAnimFrame) cancelAnimationFrame(waveAnimFrame);
  waveAnimFrame = null;
  document.getElementById('waveWrapper').classList.remove('active');
  document.querySelectorAll('.wave-bar').forEach(b => {
    b.style.height = '4px';
    b.style.boxShadow = 'none';
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = 'status-dot ' + (state || '');
  statusText.textContent = text;
}

// ─── Audio visualizer ─────────────────────────────────────────────────────────
async function startVisualizer() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = CONFIG.fftSize;
    analyser.smoothingTimeConstant = 0.8;
    const source = audioCtx.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    animateVisualizer();
  } catch (e) {
    console.warn('Mic unavailable:', e);
  }
}

function animateVisualizer() {
  const binCount   = analyser.frequencyBinCount;
  const data       = new Uint8Array(binCount);
  const usefulBins = Math.floor(binCount * 0.75);

  function draw() {
    animFrame = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    for (let i = 0; i < CONFIG.barCount; i++) {
      const bar = document.getElementById(`bar-${i}`);
      if (!bar) continue;
      const t        = i / (CONFIG.barCount - 1);
      const binIndex = Math.round(Math.pow(t, 1.4) * (usefulBins - 1));
      const val      = data[binIndex] || 0;
      const h        = Math.max(4, (val / 255) * CONFIG.maxBarHeight);
      const hue      = 270 + t * 60;
      bar.style.height     = h + 'px';
      bar.style.background = isListening
        ? `hsl(${hue}, 100%, ${40 + (val / 255) * 30}%)`
        : 'var(--purple-dim)';
      bar.style.boxShadow  = isListening && val > 30
        ? `0 0 ${6 + (val / 255) * 14}px hsl(${hue}, 100%, 60%)`
        : 'none';
    }
  }
  draw();
}

function stopVisualizer() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioCtx) audioCtx.close();
  audioCtx = null; analyser = null; mediaStream = null;
  for (let i = 0; i < CONFIG.barCount; i++) {
    const bar = document.getElementById(`bar-${i}`);
    if (bar) { bar.style.height = '4px'; bar.style.boxShadow = 'none'; bar.style.background = 'var(--purple-dim)'; }
  }
}

// ─── Text-to-Speech ───────────────────────────────────────────────────────────
function speak(text, bubbleEl) {
  window.speechSynthesis.cancel();

  // Small delay so cancel() fully clears before new utterance
  setTimeout(() => {
    const utter = new SpeechSynthesisUtterance(text);
    currentUtterance = utter;

    const voices = window.speechSynthesis.getVoices();

    // Priority order: natural-sounding deep English voices
    const preferred = voices.find(v => v.name === 'Google UK English Male')
      || voices.find(v => v.name === 'Daniel')           // macOS deep male
      || voices.find(v => v.name === 'Arthur')           // macOS UK male
      || voices.find(v => v.name === 'Alex')             // macOS US male
      || voices.find(v => v.name.includes('Male') && v.lang.startsWith('en'))
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang === 'en-US')
      || voices[0];

    if (preferred) utter.voice = preferred;

    // Natural-sounding settings
    utter.rate   = 0.88;   // slightly slower = more deliberate
    utter.pitch  = 0.80;   // lower pitch = deeper voice
    utter.volume = 1.0;

    isSpeaking = true;
    setStatus('active', 'SPEAKING');
    if (bubbleEl) bubbleEl.classList.add('speaking');

    utter.onstart = () => {
      document.body.classList.add('speaking');
      startWave();
    };

    utter.onend = () => {
      isSpeaking = false;
      document.body.classList.remove('speaking');
      stopWave();
      if (bubbleEl) bubbleEl.classList.remove('speaking');
      if (isListening) setStatus('active', 'LISTENING');
      else setStatus('', 'STANDBY');
    };

    utter.onerror = (e) => {
      if (e.error === 'interrupted') return;
      isSpeaking = false;
      document.body.classList.remove('speaking');
      stopWave();
      if (bubbleEl) bubbleEl.classList.remove('speaking');
      console.warn('TTS error:', e.error);
    };

    window.speechSynthesis.speak(utter);
  }, 80);
}

// ─── Speech Recognition ───────────────────────────────────────────────────────
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus('error', 'NOT SUPPORTED');
    addBubble('wazbot', 'Speech recognition is not supported in this browser. Please use Chrome or Edge.');
    return null;
  }

  const rec = new SR();
  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = 'en-US';

  rec.onresult = (e) => {
    // Pause recognition while WazBot is speaking to avoid feedback loop
    if (isSpeaking) return;

    let interim = '';
    let final   = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    transcript.textContent = final || interim || '...';
    transcript.className = 'transcript active';
    if (final.trim()) handleCommand(final.trim());
  };

  rec.onerror = (e) => {
    if (e.error !== 'no-speech') {
      setStatus('error', 'ERROR');
      console.error('Speech error:', e.error);
    }
  };

  rec.onend = () => { if (isListening && !isSpeaking) rec.start(); };

  return rec;
}

// ─── Toggle listening ─────────────────────────────────────────────────────────
async function toggleListening() {
  if (!isListening) {
    recognition = initSpeechRecognition();
    if (!recognition) return;

    isListening = true;
    document.body.classList.add('listening');
    micBtn.classList.add('active');
    micLabel.textContent = 'LISTENING';
    setStatus('active', 'LISTENING');
    transcript.textContent = 'Speak now...';
    transcript.className = 'transcript active';

    await startVisualizer();
    recognition.start();
  } else {
    stopListening();
  }
}

function stopListening() {
  isListening = false;
  window.speechSynthesis.cancel();
  if (recognition) { recognition.stop(); recognition = null; }
  stopVisualizer();
  document.body.classList.remove('listening');
  micBtn.classList.remove('active');
  micLabel.textContent = 'ACTIVATE';
  setStatus('', 'STANDBY');
  transcript.className = 'transcript';
}

// ─── Command handler ──────────────────────────────────────────────────────────
async function handleCommand(cmd) {
  addBubble('user', cmd);
  setStatus('active', 'PROCESSING');

  // Pause mic while thinking + speaking
  if (recognition) recognition.stop();

  sendToBackend(cmd);

  let reply;
  if (CONFIG.useAI && CONFIG.openRouterKey) {
    reply = await queryAI(cmd);
  } else {
    reply = localResponse(cmd);
  }

  const bubbleEl = addBubble('wazbot', reply);
  speak(reply, bubbleEl);

  // Resume mic after speech ends (onend handles status)
  const resumeAfterSpeech = setInterval(() => {
    if (!isSpeaking && isListening && recognition === null) {
      clearInterval(resumeAfterSpeech);
      recognition = initSpeechRecognition();
      if (recognition) recognition.start();
    } else if (!isSpeaking) {
      clearInterval(resumeAfterSpeech);
    }
  }, 300);
}

// ─── Backend ──────────────────────────────────────────────────────────────────
async function sendToBackend(cmd) {
  try {
    const res = await fetch(CONFIG.backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, timestamp: Date.now() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn('Backend unreachable:', e.message);
  }
}

// ─── OpenRouter AI ────────────────────────────────────────────────────────────
async function queryAI(userMsg) {
  chatHistory.push({ role: 'user', content: userMsg });
  try {
    const res = await fetch(CONFIG.openRouterUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.href,
        'X-Title': 'WazBot Voice Assistant',
      },
      body: JSON.stringify({ model: CONFIG.openRouterModel, messages: chatHistory }),
    });
    const data = await res.json();

    // Handle auth / quota errors gracefully
    if (data.error) {
      console.warn('OpenRouter error:', data.error.message);
      chatHistory.pop(); // remove the user msg we just pushed
      return localResponse(userMsg);
    }

    const reply = data.choices?.[0]?.message?.content || localResponse(userMsg);
    chatHistory.push({ role: 'assistant', content: reply });
    return reply;
  } catch (e) {
    console.error('API fetch error:', e.message);
    chatHistory.pop();
    return localResponse(userMsg);
  }
}

// ─── Local responses (no API key needed) ─────────────────────────────────────
function localResponse(cmd) {
  const c = cmd.toLowerCase();

  // Identity
  if (c.match(/who (made|created|built|designed) you/) || c.includes('your creator') || c.includes('who are you'))
    return `I am ${IDENTITY.name}, created by ${IDENTITY.creator}. How can I assist you?`;
  if (c.includes('your name') || c.match(/what are you/))
    return `I am ${IDENTITY.name}, your AI assistant, built by ${IDENTITY.creator}.`;

  // Greetings
  if (c.match(/^(hello|hi|hey|good morning|good evening|good afternoon)/))
    return 'Hello. All systems online. How can I help you today?';

  // Time / Date
  if (c.includes('time'))
    return `The current time is ${new Date().toLocaleTimeString()}.`;
  if (c.includes('date') || c.includes('today'))
    return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

  // Smart home
  if (c.includes('light') && c.includes('on'))  return 'Turning the lights on now.';
  if (c.includes('light') && c.includes('off')) return 'Lights off. Done.';
  if (c.includes('fan')   && c.includes('on'))  return 'Fan activated.';
  if (c.includes('fan')   && c.includes('off')) return 'Fan deactivated.';
  if (c.includes('temperature') || c.includes('temp')) return 'Querying temperature sensors. Please wait.';
  if (c.includes('status'))  return 'All systems are nominal. Everything looks good.';

  // Shutdown
  if (c.match(/(shutdown|stop listening|go to sleep|deactivate)/)) {
    setTimeout(stopListening, 1200);
    return 'Going to standby mode. Call me when you need me.';
  }

  // Fallback
  return `I heard you say: "${cmd}". I'm processing that now. If you have an API key set, I can give you a smarter response.`;
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────
function addBubble(role, text) {
  const wrap = document.createElement('div');
  wrap.className = `bubble ${role === 'wazbot' ? 'wazbot' : 'user'}`;

  const label = document.createElement('div');
  label.className = 'bubble-label';
  label.textContent = role === 'user' ? 'YOU' : 'WazBot';

  const bubble = document.createElement('div');
  bubble.className = 'bubble-text';
  bubble.textContent = text;

  wrap.appendChild(label);
  wrap.appendChild(bubble);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;

  return wrap; // return so we can add .speaking class
}

function clearLog() {
  log.innerHTML = '';
  chatHistory = [{ role: 'system', content: IDENTITY.systemPrompt }];
  transcript.textContent = 'Awaiting voice command...';
  transcript.className = 'transcript';
}

// ─── Text input handler ───────────────────────────────────────────────────────
async function sendText() {
  const input = document.getElementById('textInput');
  const cmd = input.value.trim();
  if (!cmd) return;
  input.value = '';
  // Route through same handler — voice reply only, no WazBot text bubble
  addBubble('user', cmd);
  setStatus('active', 'PROCESSING');
  sendToBackend(cmd);

  let reply;
  if (CONFIG.useAI && CONFIG.openRouterKey) {
    reply = await queryAI(cmd);
  } else {
    reply = localResponse(cmd);
  }

  // Speak only — no bubble for WazBot response
  speak(reply, null);
  setStatus('active', 'SPEAKING');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Voices load async in some browsers
window.speechSynthesis.onvoiceschanged = () => {};

initBars();
initWave();

// Greet on load
setTimeout(() => {
  const greeting = `${IDENTITY.name} online. All systems ready. How can I help you?`;
  const bubbleEl = addBubble('wazbot', greeting);
  speak(greeting, bubbleEl);
}, 600);
