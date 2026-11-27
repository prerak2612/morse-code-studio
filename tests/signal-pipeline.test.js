'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { compile } = require('../src/compiler/compiler.js');
const { schedule } = require('../src/codegen/timing.js');
const { createKeyDecoder, decodeSequence } = require('../src/decoder/decoder.js');

test('signal codegen and playback share the optimized Morse instructions', () => {
  const { output, ir, diagnostics, analysis } = compile('aE ☀ T');
  assert.equal(output.text, '.- . / -');
  assert.equal(analysis.ok, true);
  assert.equal(diagnostics[0].span.column, 4);

  const timeline = schedule(ir, { wpm: 12 });
  assert.deepEqual(timeline.events.map(({ durationMs }) => durationMs), [100, 100, 300, 300, 100, 700, 300]);
  assert.deepEqual(timeline.marks.map(({ instruction }) => instruction.source.column), [1, 1, 2, 6]);
});

test('keying commits letters and words without appending a trailing space', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1 });
  const key = createKeyDecoder({ clock: { now: Date.now, setTimeout, clearTimeout } });
  key.press();
  key.release();
  t.mock.timers.tick(1500);
  assert.equal(key.state.text, 'E');

  key.press();
  t.mock.timers.tick(230);
  key.release();
  key.flush();
  assert.equal(key.state.text, 'E T');

  key.press();
  key.cancel();
  assert.equal(key.state.current, '');
  assert.equal(decodeSequence('constructor'), null);
});
