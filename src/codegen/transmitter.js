(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).transmitter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const Outcome = Object.freeze({ COMPLETED: 'completed', STOPPED: 'stopped' });

  function createTransmitter({ clock, outputs = [] }) {
    if (!clock) throw new TypeError('createTransmitter requires a clock');
    let session = null;

    const notify = (hook, ...args) => {
      for (const output of outputs) output[hook]?.(...args);
    };

    function finish(outcome) {
      const current = session;
      if (!current) return;
      session = null;
      current.timers.forEach((id) => clock.clearTimeout(id));
      notify('end', outcome, current.timeline);
      current.resolve({ outcome, timeline: current.timeline });
    }

    function play(timeline) {
      finish(Outcome.STOPPED);

      let resolve;
      const done = new Promise((r) => { resolve = r; });
      const timers = [];
      session = { timeline, timers, resolve };

      notify('start', timeline);
      for (const event of timeline.marks) {
        timers.push(clock.setTimeout(() => notify('markStart', event), event.startMs));
        timers.push(clock.setTimeout(() => notify('markEnd', event), event.endMs));
      }
      timers.push(clock.setTimeout(() => finish(Outcome.COMPLETED), timeline.totalMs));

      return done;
    }

    return {
      play,
      stop: () => finish(Outcome.STOPPED),
      get playing() { return session !== null; },
    };
  }

  return { Outcome, createTransmitter };
});
