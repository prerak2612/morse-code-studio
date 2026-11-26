(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../compiler/lexer.js'),
      require('../compiler/compiler.js'),
      require('../compiler/diagnostics.js'),
      require('../codegen/timing.js'),
      require('../codegen/transmitter.js'),
      require('../codegen/outputs.js'),
      require('../decoder/decoder.js'),
    );
  } else {
    const ns = (root.Pulsefield = root.Pulsefield || {});
    ns.app = factory(root.MorseLexer, ns.compiler, ns.diagnostics, ns.timing, ns.transmitter, ns.outputs, ns.decoder);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lexer, compiler, diagnostics, timing, transmitter, outputs, decoder) {
  'use strict';

  const GLYPH = Object.freeze({ '.': '·', '-': '—' });
  const EXAMPLE = 'MEET ME AT FIRST LIGHT';
  const MAX_LENGTH = 240;
  const TOAST_MS = 2800;
  const METER_INTERVAL_MS = 20;
  const PHASE_PANELS = Object.freeze({
    tokens: '#phaseTokens',
    ast: '#phaseAst',
    ir: '#phaseIr',
    diagnostics: '#phaseDiagnostics',
  });

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;
  const position = (span) => `L${span.line}:C${span.column}`;
  const glyphs = (code) => [...code].map((s) => GLYPH[s] ?? s).join('');
  const formatMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

  function createApp({ document, clock, createAudioContext = null, clipboard = null }) {
    const window = document.defaultView;
    const listeners = new window.AbortController();
    const { signal } = listeners;
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];

    const h = (tag, props = {}, ...children) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'className') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') Object.assign(node.style, value);
        else node.setAttribute(key, value);
      }
      node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
      return node;
    };

    const el = {
      message: $('#message'),
      count: $('#count'),
      morseOutput: $('#morseOutput'),
      speed: $('#speed'),
      speedValue: $('#speedValue'),
      dotValue: $('#dotValue'),
      bulb: $('#bulb'),
      waveform: $('#waveform'),
      statusText: $('#statusText'),
      status: $('#status'),
      toast: $('#toast'),
      tokenStream: $('#tokenStream'),
      tokenSummary: $('#tokenSummary'),
      tokenCount: $('#tokenCount'),
      astTree: $('#astTree'),
      astSummary: $('#astSummary'),
      astCount: $('#astCount'),
      irTimeline: $('#irTimeline'),
      irList: $('#irList'),
      irSummary: $('#irSummary'),
      irCount: $('#irCount'),
      diagnosticList: $('#diagnosticList'),
      diagnosticSummary: $('#diagnosticSummary'),
      diagnosticCount: $('#diagnosticCount'),
      key: $('#telegraphKey'),
      durationFill: $('#durationFill'),
      currentCode: $('#currentCode'),
      decodedText: $('#decodedText'),
    };

    let compilation = null;
    let mode = 'encode';
    let toastTimer = null;
    let meterTimer = null;
    let highlighted = [];
    const instructionNodes = new Map();

    function toast(text, error = false) {
      el.toast.textContent = text;
      el.toast.className = `toast show${error ? ' error' : ''}`;
      clock.clearTimeout(toastTimer);
      toastTimer = clock.setTimeout(() => { el.toast.className = 'toast'; }, TOAST_MS);
    }

    const wpm = () => Number(el.speed.value);

    function setStatus(text, live) {
      el.statusText.textContent = text;
      el.status.classList.toggle('live', live);
      el.waveform.classList.toggle('live', live);
    }

    function clearHighlight() {
      highlighted.forEach((node) => node.classList.remove('active'));
      highlighted = [];
    }

    function highlight(index) {
      clearHighlight();
      highlighted = instructionNodes.get(index) ?? [];
      highlighted.forEach((node) => node.classList.add('active'));
      const cell = highlighted.find((node) => node.parentElement === el.irTimeline);
      if (cell) el.irTimeline.scrollLeft = cell.offsetLeft - el.irTimeline.clientWidth / 2;
    }

    const visualOutput = {
      start: () => setStatus('TRANSMITTING', true),
      markStart: (event) => highlight(event.index),
      markEnd: clearHighlight,
      end: () => {
        clearHighlight();
        setStatus('SIGNAL READY', false);
      },
    };

    const transmission = transmitter.createTransmitter({
      clock,
      outputs: [
        createAudioContext && outputs.createAudioOutput(createAudioContext),
        outputs.createLightOutput(el.bulb),
        visualOutput,
      ].filter(Boolean),
    });

    function track(index, node) {
      if (!instructionNodes.has(index)) instructionNodes.set(index, []);
      instructionNodes.get(index).push(node);
    }

    function renderOutput({ output }) {
      el.morseOutput.replaceChildren();
      el.morseOutput.classList.toggle('empty', !output.segments.length);
      if (!output.segments.length) {
        el.morseOutput.textContent = '— — —';
        return;
      }
      for (const segment of output.segments) {
        const isMark = segment.kind === 'dit' || segment.kind === 'dah';
        const node = h('span', { className: isMark ? `symbol ${segment.kind}` : `gap ${segment.kind}` },
          isMark ? GLYPH[segment.text] : segment.kind === 'word' ? ' / ' : ' ');
        if (isMark) track(segment.index, node);
        el.morseOutput.append(node);
      }
    }

    function renderTokens({ tokens }) {
      const invalid = tokens.filter((t) => t.type === lexer.TokenType.INVALID).length;
      el.tokenCount.textContent = tokens.length;
      el.tokenSummary.textContent = `${plural(tokens.length, 'TOKEN')}${invalid ? ` · ${invalid} INVALID` : ''}`;
      el.tokenStream.replaceChildren(...tokens.map((t) => {
        const lexeme = t.type === 'EOF' ? '∅' : t.type === 'WORD_SEPARATOR' ? '␣'.repeat(t.lexeme.length) : t.lexeme;
        const normalized = t.type === 'LETTER' && t.value !== t.lexeme ? ` → ${t.value}` : '';
        return h('li', { className: t.type === 'INVALID' ? 'invalid' : t.type === 'EOF' ? 'eof' : null, title: t.message },
          h('b', {}, t.type),
          h('code', {}, lexeme + normalized),
          h('small', {}, `${position(t)} · @${t.offset}`));
      }));
    }

    function renderAst({ ast }) {
      const characters = ast.words.reduce((n, w) => n + w.characters.length, 0);
      el.astCount.textContent = ast.words.length;
      el.astSummary.textContent = `${plural(ast.words.length, 'WORD')} · ${plural(characters, 'CHARACTER')}`;
      const words = ast.words.map((word) => h('li', { className: 'ast-node ast-word' },
        h('div', { className: 'ast-label' },
          h('b', {}, word.type),
          h('code', {}, JSON.stringify(word.text)),
          h('small', {}, `${position(word.span)} · @${word.span.offset}+${word.span.length}`)),
        h('ul', { className: 'ast-characters' }, ...word.characters.map((c) => h('li', { className: `ast-node ast-character ${c.kind}`, title: `${c.kind} ${position(c.span)}` },
          h('b', {}, c.value),
          h('span', {}, glyphs(c.morse)),
          h('small', {}, c.kind))))));
      el.astTree.replaceChildren(h('li', { className: 'ast-node ast-message' },
        h('div', { className: 'ast-label' },
          h('b', {}, ast.type),
          h('small', {}, `@0+${ast.span.length}`)),
        words.length ? h('ul', {}, ...words) : h('p', { className: 'phase-empty' }, 'Empty message: no words to parse.')));
    }

    function renderIr({ ir }) {
      const schedule = timing.schedule(ir, { wpm: wpm() });
      el.irCount.textContent = ir.instructions.length;
      el.irSummary.textContent = `${plural(ir.instructions.length, 'INSTRUCTION')} · ${plural(ir.units, 'UNIT')} · ${formatMs(schedule.totalMs)} AT ${schedule.wpm} WPM`;

      el.irTimeline.replaceChildren(...schedule.events.map((event) => {
        const { instruction } = event;
        const cell = h('i', {
          className: instruction.op === 'MARK' ? `mark ${instruction.kind}` : `gap ${instruction.kind}`,
          style: { flexGrow: String(instruction.units), flexBasis: `${instruction.units * 5}px` },
          title: `${instruction.op} ${instruction.kind} · ${instruction.units}u`,
        });
        if (instruction.op === 'MARK') track(event.index, cell);
        return cell;
      }));

      el.irList.replaceChildren(...schedule.events.map((event) => {
        const { instruction } = event;
        const isMark = instruction.op === 'MARK';
        const row = h('li', { className: isMark ? 'mark' : 'gap', dataset: { index: event.index } },
          h('span', { className: 'ir-index' }, String(event.index).padStart(4, '0')),
          h('b', {}, instruction.op),
          h('span', {}, instruction.kind),
          h('span', {}, `${instruction.units}u`),
          h('span', { className: 'ir-time' }, `t+${Math.round(event.startMs)}ms`),
          h('code', {}, isMark ? instruction.character : ''));
        if (isMark) track(event.index, row);
        return row;
      }));
    }

    function renderDiagnostics({ diagnostics: list }) {
      const counts = diagnostics.summarize(list);
      const worst = counts.error ? 'error' : counts.warning ? 'warning' : counts.info ? 'info' : 'clean';
      el.diagnosticCount.textContent = list.length;
      el.diagnosticCount.dataset.severity = worst;
      el.diagnosticSummary.textContent = list.length
        ? `${plural(counts.error, 'ERROR')} · ${plural(counts.warning, 'WARNING')} · ${counts.info} INFO`
        : 'NO DIAGNOSTICS · SOURCE COMPILES CLEANLY';
      el.diagnosticList.replaceChildren(...list.map((d) => h('li', { className: `diagnostic ${d.severity}` },
        h('button', { type: 'button', dataset: { offset: d.span.offset, length: d.span.length } },
          h('b', {}, d.severity.toUpperCase()),
          h('code', {}, d.code),
          h('span', {}, d.message),
          h('small', {}, position(d.span))))));
    }

    function compileSource() {
      transmission.stop();
      instructionNodes.clear();
      highlighted = [];
      compilation = compiler.compile(el.message.value);
      el.count.textContent = `${el.message.value.length} / ${MAX_LENGTH}`;
      renderOutput(compilation);
      renderTokens(compilation);
      renderAst(compilation);
      renderIr(compilation);
      renderDiagnostics(compilation);
      return compilation;
    }

    function renderSpeed() {
      el.speedValue.textContent = `${wpm()} WPM`;
      el.dotValue.textContent = `DOT ${Math.round(timing.dotDuration(wpm()))} MS`;
    }

    function transmit() {
      const result = compileSource();
      const counts = diagnostics.summarize(result.diagnostics);
      if (counts.error) {
        selectPhase('diagnostics');
        toast(`Resolve ${plural(counts.error, 'error').toLowerCase()} before transmitting`, true);
        return null;
      }
      if (!result.ir.instructions.length) {
        toast('Nothing to transmit yet', true);
        return null;
      }
      if (counts.warning) toast(`Transmitting without ${plural(counts.warning, 'unsupported character').toLowerCase()}`, true);
      return transmission.play(timing.schedule(result.ir, { wpm: wpm() }));
    }

    async function copy() {
      const text = (compilation ?? compileSource()).output.text;
      if (!text) return;
      try {
        await clipboard.writeText(text);
        toast('Morse signal copied');
      } catch {
        toast('Clipboard is unavailable in this browser', true);
      }
    }

    function selectPhase(phase) {
      $$('.phase').forEach((button) => {
        const active = button.dataset.phase === phase;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
      for (const [name, selector] of Object.entries(PHASE_PANELS)) $(selector).classList.toggle('hidden', name !== phase);
    }

    function selectMode(next) {
      mode = next;
      $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === next));
      $('#encodePanel').classList.toggle('hidden', next !== 'encode');
      $('#decodePanel').classList.toggle('hidden', next !== 'decode');
      transmission.stop();
    }

    function renderDecode({ current, text }) {
      el.currentCode.textContent = current ? glyphs(current) : '·';
      el.decodedText.textContent = text || 'Waiting for signal';
    }

    const keyer = decoder.createKeyDecoder({
      clock,
      onChange: renderDecode,
      onUnknown: (sequence) => toast(`Unrecognized Morse sequence: ${sequence}`, true),
    });
    const meterScale = keyer.timing.dashThresholdMs * 3;

    function keyDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      if (keyer.state.pressed) return;
      keyer.press();
      el.key.classList.add('pressed');
      clock.clearInterval(meterTimer);
      meterTimer = clock.setInterval(() => {
        el.durationFill.style.width = `${Math.min((keyer.heldFor() / meterScale) * 100, 100)}%`;
      }, METER_INTERVAL_MS);
    }

    function keyUp(event) {
      if (!keyer.state.pressed) return;
      event?.preventDefault();
      clock.clearInterval(meterTimer);
      el.durationFill.style.width = '0';
      el.key.classList.remove('pressed');
      keyer.release();
    }

    const on = (target, type, handler) => target.addEventListener(type, handler, { signal });
    const isTyping = (target) => target === el.message;

    on(el.message, 'input', compileSource);
    on($('#transmit'), 'click', transmit);
    on($('#stop'), 'click', () => transmission.stop());
    on(el.speed, 'input', () => {
      renderSpeed();
      instructionNodes.clear();
      renderOutput(compilation);
      renderIr(compilation);
    });
    on($('#copyMorse'), 'click', copy);
    on($('#example'), 'click', () => {
      el.message.value = EXAMPLE;
      compileSource();
      el.message.focus();
    });
    $$('.tab').forEach((tab) => on(tab, 'click', () => selectMode(tab.dataset.mode)));
    $$('.phase').forEach((button) => on(button, 'click', () => selectPhase(button.dataset.phase)));
    on(el.diagnosticList, 'click', (event) => {
      const button = event.target.closest('button[data-offset]');
      if (!button) return;
      const start = Number(button.dataset.offset);
      el.message.focus();
      el.message.setSelectionRange(start, start + Number(button.dataset.length));
    });
    on($('#referenceToggle'), 'click', (event) => {
      const hidden = $('#reference').classList.toggle('hidden');
      event.currentTarget.setAttribute('aria-expanded', String(!hidden));
    });

    on(el.key, 'pointerdown', keyDown);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => on(el.key, type, keyUp));
    on($('#clearDecode'), 'click', () => keyer.clear());
    on(window, 'keydown', (event) => {
      if (event.key === 'Escape') transmission.stop();
      if (mode !== 'decode' || isTyping(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) keyDown(event);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        keyer.backspace();
      }
    });
    on(window, 'keyup', (event) => {
      if (event.code === 'Space' && mode === 'decode') keyUp(event);
    });

    el.waveform.replaceChildren(...Array.from({ length: 65 }, (_, i) => h('i', { style: { animationDelay: `${i * -0.08}s` } })));
    $('#codeGrid').replaceChildren(...Object.entries(lexer.MORSE).map(([character, code]) => h('div', {}, h('b', {}, character), h('span', {}, code))));
    renderSpeed();
    renderDecode(keyer.state);
    compileSource();

    return {
      transmit,
      stop: () => transmission.stop(),
      selectMode,
      selectPhase,
      get compilation() { return compilation; },
      get transmitting() { return transmission.playing; },
      keyer,
      destroy() {
        transmission.stop();
        keyer.clear();
        clock.clearInterval(meterTimer);
        clock.clearTimeout(toastTimer);
        listeners.abort();
      },
    };
  }

  return { createApp, EXAMPLE };
});
