# Architecture

Pulsefield is intentionally a tiny static application. It separates presentation (`index.html` and `style.css`) from behavior (`script.js`).

## Data flow

1. Text is normalized to uppercase and each supported character is looked up in the `MORSE` map.
2. Encoded pieces are joined with a single space between characters and `/` between words.
3. Playback walks that sequence one symbol at a time, driving the relay CSS class and a short-lived Web Audio oscillator.
4. Decoder presses are measured on pointer release. The duration resolves to `.` or `-`, and inactivity timers commit a character or a word space.
5. Reverse lookup converts each completed sequence to human-readable text; invalid sequences are rendered as `?` and announced as a toast.

The application uses no external runtime libraries. Google Fonts are cosmetic only; the app remains functional without a network connection.
