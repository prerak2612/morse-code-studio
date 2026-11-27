(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).outputs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({ frequency: 680, level: 0.08, rampMs: 4, leadMs: 30 });

  function createAudioOutput(createContext, options = {}) {
    const { frequency, level, rampMs, leadMs } = { ...DEFAULTS, ...options };
    let context = null;

    function release() {
      if (!context) return;
      const closing = context;
      context = null;
      Promise.resolve(closing.close?.()).catch(() => {});
    }

    return {
      start(timeline) {
        release();
        if (!timeline.marks.length) return;
        context = createContext();
        if (context.state === 'suspended') Promise.resolve(context.resume()).catch(() => {});

        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        const origin = context.currentTime + leadMs / 1000;
        const gain = envelope.gain;
        gain.setValueAtTime(0, context.currentTime);

        for (const mark of timeline.marks) {
          const on = origin + mark.startMs / 1000;
          const off = origin + mark.endMs / 1000;
          const ramp = Math.min(rampMs, mark.durationMs / 4) / 1000;
          gain.setValueAtTime(0, on);
          gain.linearRampToValueAtTime(level, on + ramp);
          gain.setValueAtTime(level, off - ramp);
          gain.linearRampToValueAtTime(0, off);
        }

        oscillator.connect(envelope).connect(context.destination);
        oscillator.start(origin);
        oscillator.stop(origin + timeline.totalMs / 1000 + 0.05);
      },
      end: release,
    };
  }

  function createLightOutput(element, className = 'lit') {
    return {
      markStart: () => element.classList.add(className),
      markEnd: () => element.classList.remove(className),
      end: () => element.classList.remove(className),
    };
  }

  return { DEFAULTS, createAudioOutput, createLightOutput };
});
