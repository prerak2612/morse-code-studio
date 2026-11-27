(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).timing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PARIS_UNITS = 50;
  const MIN_WPM = 5;
  const MAX_WPM = 40;

  function dotDuration(wpm) {
    if (typeof wpm !== 'number' || !Number.isFinite(wpm) || wpm <= 0) {
      throw new RangeError(`WPM must be a positive finite number, received ${wpm}`);
    }
    return 1200 / wpm;
  }

  function schedule(program, { wpm }) {
    const dotMs = dotDuration(wpm);
    const events = [];
    let cursor = 0;

    program.instructions.forEach((instruction, index) => {
      const durationMs = instruction.units * dotMs;
      events.push(Object.freeze({
        index,
        instruction,
        startMs: cursor,
        durationMs,
        endMs: cursor + durationMs,
      }));
      cursor += durationMs;
    });

    return Object.freeze({
      wpm,
      dotMs,
      totalMs: cursor,
      events: Object.freeze(events),
      marks: Object.freeze(events.filter((e) => e.instruction.op === 'MARK')),
    });
  }

  return { PARIS_UNITS, MIN_WPM, MAX_WPM, dotDuration, schedule };
});
