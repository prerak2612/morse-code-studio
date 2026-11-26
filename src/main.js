(function (root) {
  'use strict';

  const AudioContextImpl = root.AudioContext || root.webkitAudioContext;

  root.Pulsefield.studio = root.Pulsefield.app.createApp({
    document: root.document,
    clock: {
      now: () => root.performance.now(),
      setTimeout: (fn, ms) => root.setTimeout(fn, ms),
      clearTimeout: (id) => root.clearTimeout(id),
      setInterval: (fn, ms) => root.setInterval(fn, ms),
      clearInterval: (id) => root.clearInterval(id),
    },
    createAudioContext: AudioContextImpl ? () => new AudioContextImpl() : null,
    clipboard: root.navigator.clipboard ?? null,
  });
})(window);
