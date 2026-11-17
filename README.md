# Pulsefield — Morse Studio

An original, browser-native Morse code workstation for encoding text and decoding signals with a telegraph key. It has no dependencies and runs directly from static files.

## Highlights

- Encode standard International Morse code with live signal output.
- Watch an optical relay blink in sync and hear synthesized dits and dahs.
- Adjustable playback rate, stop control, clipboard copy, and input validation.
- Decode by mouse, touch, or spacebar: short presses make dots and long presses make dashes.
- Automatically commits letters and word spaces after natural pauses.
- A responsive, accessible interface with an expandable reference codebook.

## Run locally

Open `index.html` in a modern browser, or use a lightweight local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Project files

- `index.html` — application structure
- `style.css` — responsive visual system and micro-interactions
- `script.js` — Morse engine, audio synthesizer, telegraph key and UI controls

## Interaction notes

The decoder’s split point is 220 ms. After 700 ms of silence it commits the current character; after 1.5 seconds it starts a new word. Browser audio begins only once the visitor chooses to transmit, following autoplay policies.

Built with HTML, CSS, JavaScript, Web Audio API, and the DOM API.
