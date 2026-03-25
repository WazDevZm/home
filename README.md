# WazBot — AI Voice Assistant

Built by **Wazingwa Mugala** — Copperbelt University, Zambia  
*"Africa has the potential to build its own AI systems 😊"*

---

## What it is

WazBot is a JARVIS-style AI voice assistant that runs entirely in the browser. Speak or type a command, and WazBot responds with voice. It connects to an AI backend via OpenRouter and can forward commands to a Python/Arduino backend.

---

## Features

- 🎤 Voice input via Web Speech API
- 🔊 Voice output via Text-to-Speech (speaks back naturally)
- 📊 Real-time audio frequency visualizer (reacts to your mic)
- 💬 Chat-style conversation log
- ⌨️ Text input field for typed commands
- 🤖 AI responses via OpenRouter (GPT-3.5)
- 🔌 Arduino/Python backend ready
- 🌑 Dark purple/black JARVIS-style UI

---

## Setup

### 1. Get an API key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys) and create a key
2. Copy the config template:
   ```bash
   cp config.example.js config.js
   ```
3. Open `config.js` and paste your key:
   ```js
   const PRIVATE_CONFIG = {
     openRouterKey: 'sk-or-v1-your-key-here',
   };
   ```

> `config.js` is in `.gitignore` — your key will never be pushed to GitHub.

### 2. Open in browser

Just open `index.html` in **Chrome or Edge** (required for Web Speech API).

> Firefox does not support the Web Speech API.

### 3. Connect Python backend (optional)

Your Python server needs one endpoint:

```python
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/command', methods=['POST'])
def command():
    data = request.json  # { "command": "turn on lights", "timestamp": ... }
    # forward to Arduino here
    return jsonify({ "message": "OK" })

app.run(port=5000)
```

---

## Voice commands (built-in, no API key needed)

| Say | Response |
|-----|----------|
| "hello" / "hi" | Greeting |
| "what time is it" | Current time |
| "what's today's date" | Current date |
| "turn on the lights" | Light on command |
| "turn off the lights" | Light off command |
| "turn on the fan" | Fan on command |
| "status" | System status |
| "who created you" | "I was created by Wazingwa Mugala" |
| "shutdown" / "stop listening" | Deactivates mic |

---

## Project structure

```
├── index.html   — UI layout
├── style.css    — Dark purple/black theme
├── app.js       — All logic (voice, AI, visualizer)
└── README.md    — This file
```

---

## API key status

> ⚠️ The previous API key expired. Get a fresh one at [openrouter.ai/keys](https://openrouter.ai/keys) and paste it into `app.js`.
