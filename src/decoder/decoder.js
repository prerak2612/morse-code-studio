(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../compiler/lexer.js'));
  else (root.Pulsefield = root.Pulsefield || {}).decoder = factory(root.MorseLexer);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lexer) {
  'use strict';

  const REVERSE = Object.freeze(Object.fromEntries(Object.entries(lexer.MORSE).map(([c, code]) => [code, c])));
  const UNKNOWN = '?';

  const KEYING_DEFAULTS = Object.freeze({ dashThresholdMs: 220, letterGapMs: 700, wordGapMs: 1500 });

  const decodeSequence = (sequence) => Object.hasOwn(REVERSE, sequence) ? REVERSE[sequence] : null;

  function decodeMorse(input) {
    const unknown = [];
    const words = input.trim().split(/\s*\/\s*/).filter(Boolean).map((word) =>
      word.split(/\s+/).map((sequence) => {
        const character = decodeSequence(sequence);
        if (character === null) unknown.push(sequence);
        return character ?? UNKNOWN;
      }).join(''),
    );
    return { text: words.join(' '), unknown };
  }

  function createKeyDecoder({ clock, onChange = () => {}, onUnknown = () => {}, ...overrides }) {
    if (!clock) throw new TypeError('createKeyDecoder requires a clock');
    const { dashThresholdMs, letterGapMs, wordGapMs } = { ...KEYING_DEFAULTS, ...overrides };

    let pressedAt = null;
    let current = '';
    let text = '';
    let wordPending = false;
    let letterTimer = null;
    let wordTimer = null;

    const snapshot = () => ({ current, text, pressed: pressedAt !== null });
    const changed = () => onChange(snapshot());

    function cancelTimers() {
      clock.clearTimeout(letterTimer);
      clock.clearTimeout(wordTimer);
      letterTimer = wordTimer = null;
    }

    function commitLetter() {
      if (!current) return;
      const character = decodeSequence(current);
      const sequence = current;
      text += (wordPending && text ? ' ' : '') + (character ?? UNKNOWN);
      current = '';
      wordPending = false;
      changed();
      if (character === null) onUnknown(sequence);
    }

    function scheduleCommit() {
      cancelTimers();
      if (!current) return;
      letterTimer = clock.setTimeout(commitLetter, letterGapMs);
      wordTimer = clock.setTimeout(() => { wordPending = Boolean(text); }, wordGapMs);
    }

    return {
      press() {
        if (pressedAt !== null) return;
        cancelTimers();
        pressedAt = clock.now();
        changed();
      },
      release() {
        if (pressedAt === null) return null;
        const held = clock.now() - pressedAt;
        const symbol = held < dashThresholdMs ? '.' : '-';
        pressedAt = null;
        current += symbol;
        scheduleCommit();
        changed();
        return symbol;
      },
      heldFor: () => (pressedAt === null ? 0 : clock.now() - pressedAt),
      cancel() {
        if (pressedAt === null) return;
        pressedAt = null;
        scheduleCommit();
        changed();
      },
      flush() {
        cancelTimers();
        commitLetter();
      },
      backspace() {
        if (current) current = current.slice(0, -1);
        else text = text.trimEnd().slice(0, -1).trimEnd();
        wordPending = false;
        scheduleCommit();
        changed();
      },
      clear() {
        cancelTimers();
        pressedAt = null;
        current = '';
        text = '';
        wordPending = false;
        changed();
      },
      get state() { return snapshot(); },
      timing: Object.freeze({ dashThresholdMs, letterGapMs, wordGapMs }),
    };
  }

  return { REVERSE, UNKNOWN, KEYING_DEFAULTS, decodeSequence, decodeMorse, createKeyDecoder };
});
