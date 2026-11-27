'use strict';

const { MORSE, encodeSignal, decodeSignal, compile, MAX_SOURCE } = PulseProgram;
const signalCompiler = globalThis.Pulsefield;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const examples = {
  first: 'LET PULSES = 6\nLET DELAY = 4 * 5\nLET TOTAL = PULSES * DELAY\n\nPRINT TOTAL\nPRINT TOTAL / 2',
  math: 'PRINT 2 + 3 * 4\nPRINT (2 + 3) * 4\nPRINT -2 + 10 / 4',
  symbol: 'LET PULSES = 6\nPRINT PULSES * DELAY',
  runtime: 'LET GAP = 3 - 3\nPRINT 12 / GAP',
};

const stageInfo = {
  signal: ['Signal translation', 'signal.morse'],
  lexer: ['Token stream', 'tokens.lex'],
  parser: ['Abstract syntax tree', 'syntax.ast'],
  semantic: ['Symbol table', 'symbols.tbl'],
  bytecode: ['Stack bytecode', 'program.pfbc'],
  runtime: ['Program output', 'pulsefield.vm'],
};

const source = $('#source');
let format = 'text';
let selectedStage = 'runtime';
let result;
let lastRun;
let dirty = false;
let copyText = '';

function notice(id, message = '', error = false) {
  const element = $(id);
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', error);
}

function syncScroll() {
  $('#highlight').scrollTop = source.scrollTop;
  $('#highlight').scrollLeft = source.scrollLeft;
  $('#lineNumbers').scrollTop = source.scrollTop;
}

function highlightSource() {
  const fragment = document.createDocumentFragment();
  const parts = source.value.split(/(\b[A-Z_][A-Z_0-9]*\b|\b\d+(?:\.\d+)?\b|[=+*/();-])/gi);
  for (const part of parts) {
    let type;
    if (format === 'morse') type = part === '/' ? 'operator' : '';
    else if (/^(LET|SET|PRINT)$/i.test(part)) type = 'keyword';
    else if (/^\d/.test(part)) type = 'number';
    else if (/^[=+*/();-]$/.test(part)) type = 'operator';
    if (type) {
      const span = document.createElement('span');
      span.className = type;
      span.textContent = part;
      fragment.append(span);
    } else {
      fragment.append(part);
    }
  }
  $('#highlight').replaceChildren(fragment, '\n');
  $('#lineNumbers').textContent = source.value.split('\n').map((_, index) => index + 1).join('\n') + '\n';
  syncScroll();
}

function setFormat(next) {
  format = next;
  $$('[data-format]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.format === format));
}

function changeFormat(next) {
  if (next === format) return;
  if (next === 'morse') {
    const { signal, unsupported } = encodeSignal(source.value, true);
    if (unsupported.length) {
      notice('#editorNotice', `Cannot convert unsupported characters: ${unsupported.join(' ')}.`, true);
      return;
    }
    if (signal.length > MAX_SOURCE) {
      notice('#editorNotice', 'The Morse program exceeds the editor limit.', true);
      return;
    }
    source.value = signal;
  } else {
    try {
      source.value = decodeSignal(source.value, true);
    } catch (error) {
      notice('#editorNotice', `Line ${error.line}, column ${error.column}. ${error.message}`, true);
      return;
    }
  }
  setFormat(next);
  updateSource();
}

function updateSource() {
  dirty = !lastRun || source.value !== lastRun.source || format !== lastRun.format ||
    $('#fold').checked !== lastRun.fold;
  highlightSource();
  notice('#editorNotice');
  showStage();
}

function loadExample(stage = 'runtime') {
  const example = examples[$('#examples').value];
  source.value = format === 'morse' ? encodeSignal(example, true).signal : example;
  highlightSource();
  run(stage);
}

function run(successStage = 'runtime') {
  notice('#editorNotice');
  lastRun = { source: source.value, format, fold: $('#fold').checked };
  result = compile(lastRun.source, lastRun);
  dirty = false;
  selectedStage = result.error?.stage ?? successStage;
  showStage();
}

function syntaxTree(ast) {
  const lines = ['Program'];
  for (const statement of ast.statements) {
    lines.push(`  ${statement.kind}${statement.name ? ' ' + statement.name.value : ''}`);
    const pending = [{ node: statement.value, depth: 2 }];
    while (pending.length) {
      const { node, depth } = pending.pop();
      const value = node.operator ?? node.value;
      lines.push(`${'  '.repeat(Math.min(depth, 24))}${depth > 24 ? '[' + depth + '] ' : ''}${node.kind} ${value}`);
      if (node.kind === 'Unary') pending.push({ node: node.operand, depth: depth + 1 });
      if (node.kind === 'Binary') {
        pending.push({ node: node.right, depth: depth + 1 }, { node: node.left, depth: depth + 1 });
      }
    }
  }
  return lines.join('\n');
}

function stageText() {
  const data = result.stages[selectedStage];
  switch (selectedStage) {
    case 'signal': return `TEXT SOURCE\n${data.source}\n\nMORSE SOURCE\n${data.morse}`;
    case 'lexer': return data.map(({ type, lexeme, line, column }) =>
      `${(line + ':' + column).padEnd(9)} ${type.padEnd(8)} ${JSON.stringify(lexeme)}`).join('\n');
    case 'parser': return syntaxTree(data);
    case 'semantic': return data.length ? data.map(({ name, slot, line }) =>
      `[${slot}] ${name} · number · declared on line ${line}`).join('\n') : 'No variables declared.';
    case 'bytecode': return data.code.map(({ op, arg }, index) =>
      `${String(index).padStart(3, '0')}  ${op.padEnd(5)} ${arg ?? ''}`.trimEnd()).join('\n');
    case 'runtime': return result.output.join('\n');
  }
}

function describeRun() {
  const { lexer, semantic, bytecode } = result.stages;
  if (!bytecode) return 'Compilation stopped';
  if (selectedStage === 'bytecode') {
    const removed = bytecode.original.length - bytecode.code.length;
    return `${bytecode.code.length} instructions · ${lastRun.fold ? removed + ' removed by constant folding' : 'Constant folding off'}`;
  }
  return `${lexer.length - 1} tokens  ·  ${semantic.length} symbols  ·  ${bytecode.code.length} instructions`;
}

function showStage() {
  const [title, file] = stageInfo[selectedStage];
  $('#consoleTitle').lastChild.textContent = ` ${title}`;
  $('#consoleFile').textContent = file;
  const status = $('#runStatus');
  const output = $('#stageOutput');
  const locate = $('#locateError');
  const error = result?.error;
  const hasStage = result && (selectedStage === 'runtime' ? !error || error.stage === 'runtime' : result.stages[selectedStage]);

  for (const button of $$('[data-stage]')) {
    const stage = button.dataset.stage;
    button.setAttribute('aria-pressed', stage === selectedStage);
    button.classList.toggle('failed', !dirty && error?.stage === stage);
  }

  copyText = '';
  locate.hidden = true;
  output.replaceChildren();
  status.className = '';
  if (dirty || !result) {
    status.textContent = 'Awaiting run';
    output.textContent = 'Compile and run your program to see the updated result.';
    $('#consoleSummary').textContent = 'Source changed';
  } else {
    status.className = error ? 'failed' : 'passed';
    status.textContent = error ? 'Error detected' : 'Run successful';
    $('#consoleSummary').textContent = describeRun();
    if (error?.stage === selectedStage) {
      const diagnostic = document.createElement('pre');
      const numbers = selectedStage === 'runtime' && result.output.length ? result.output.join('\n') + '\n\n' : '';
      copyText = `${numbers}Line ${error.line}, column ${error.column}\n${error.message}`;
      diagnostic.textContent = copyText;
      diagnostic.className = 'diagnostic';
      output.append(diagnostic);
      locate.hidden = false;
    } else if (!hasStage) {
      output.textContent = 'This stage was not reached.';
    } else if (selectedStage === 'runtime' && result.output.length) {
      copyText = stageText();
      for (const value of result.output) {
        const row = document.createElement('div');
        row.className = 'output-row';
        const marker = document.createElement('span');
        marker.textContent = '›';
        marker.setAttribute('aria-hidden', 'true');
        row.append(marker, String(value));
        output.append(row);
      }
    } else {
      const pre = document.createElement('pre');
      copyText = stageText();
      pre.textContent = copyText || 'Program ran without printing a value.';
      output.append(pre);
    }
  }
  output.parentElement.scrollTop = 0;
  $('#copyResult').disabled = !copyText;
  $('#copyResult').textContent = 'Copy';
}

async function copy(value, button) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const field = document.createElement('textarea');
    field.className = 'clipboard-helper';
    field.value = value;
    (button.closest('dialog') ?? document.body).append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    button.focus();
    if (!copied) {
      button.textContent = 'Copy failed';
      return;
    }
  }
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy'; }, 1200);
}

source.maxLength = MAX_SOURCE;
source.addEventListener('input', updateSource);
source.addEventListener('scroll', syncScroll);
$('#fold').addEventListener('change', updateSource);
$('#run').addEventListener('click', () => run());
$('#resetSource').addEventListener('click', () => loadExample());
$('#examples').addEventListener('change', () => loadExample());
$('#copyResult').addEventListener('click', (event) => copy(copyText, event.currentTarget));
$$('[data-format]').forEach((button) => button.addEventListener('click', () => changeFormat(button.dataset.format)));
$$('[data-stage]').forEach((button) => button.addEventListener('click', () => {
  selectedStage = button.dataset.stage;
  showStage();
}));

$('#locateError').addEventListener('click', () => {
  const { line, column, stage } = result.error;
  if (format === 'morse' && stage !== 'signal') {
    source.value = result.stages.signal.source;
    setFormat('text');
    lastRun = { ...lastRun, source: source.value, format };
    highlightSource();
  }
  const lines = source.value.split('\n');
  const offset = lines.slice(0, line - 1).reduce((length, text) => length + text.length + 1, 0) + column - 1;
  source.focus();
  source.setSelectionRange(offset, offset + 1);
  source.scrollTop = Math.max(0, (line - 3) * parseFloat(getComputedStyle(source).lineHeight));
  syncScroll();
});

$('#runShortcut').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ Enter' : 'Ctrl Enter';
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !$('#compiler').hidden && !$('#guide').open) {
    event.preventDefault();
    run();
  }
});

let labMode = 'encode';
const labDrafts = { encode: '', decode: '' };
let signalValue = '';
let signalResult;
let keyOwner;
let keyFrame;

const clock = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (id) => window.clearTimeout(id),
};
const Audio = window.AudioContext || window.webkitAudioContext;
const audio = Audio && signalCompiler.outputs.createAudioOutput(() => new Audio(), { leadMs: 0 });
const transmitter = signalCompiler.transmitter.createTransmitter({
  clock,
  outputs: [
    signalCompiler.outputs.createLightOutput($('#relay')),
    {
      start(timeline) {
        try {
          audio?.start(timeline);
        } catch {
          audio?.end();
        }
      },
      end() {
        audio?.end();
        $('#stop').disabled = true;
        $('#transmit').disabled = !canTransmit();
      },
    },
  ],
});

const key = $('#telegraphKey');
const keyDecoder = signalCompiler.decoder.createKeyDecoder({
  clock,
  onChange: renderSignal,
  onUnknown: (code) => notice('#signalNotice', `Unknown Morse group “${code}”.`, true),
});

function canTransmit() {
  return labMode === 'encode' && Boolean(signalResult?.ir.instructions.length) &&
    !signalCompiler.diagnostics.hasErrors(signalResult.diagnostics);
}

function renderSignalArtifact() {
  const panel = $('#signalPipeline');
  if (!panel.open || labMode !== 'encode' || !signalResult) return;

  const { tokens, ast, ir, diagnostics } = signalResult;
  const formatters = {
    tokens: () => tokens.map(globalThis.MorseLexer.formatToken).join('\n'),
    ast: () => ['Message', ...ast.words.flatMap((word) => [
      `  Word ${word.text}`,
      ...word.characters.map((character) => `    ${character.kind} ${character.value} ${character.morse}`),
    ])].join('\n'),
    ir: () => ir.instructions.map(signalCompiler.ir.formatInstruction).join('\n'),
    diagnostics: () => diagnostics.map(signalCompiler.diagnostics.formatDiagnostic).join('\n'),
  };
  $('#signalArtifact').textContent = formatters[$('#signalStage').value]() || 'No entries for this stage.';
}

function renderSignal() {
  const message = $('#message').value;
  const output = $('#signalOutput');
  const morse = labMode === 'encode';
  notice('#signalNotice');
  signalValue = '';
  if (labMode === 'key') {
    const { text, current } = keyDecoder.state;
    signalValue = text;
    $('#currentCode').textContent = current ? `Current letter  ${current}` : 'Ready for a letter';
  } else if (morse) {
    signalResult = signalCompiler.compiler.compile(message);
    signalValue = signalResult.output.text;
    const issue = signalResult.diagnostics.find(({ severity }) => severity !== 'info');
    if (issue) notice('#signalNotice', signalCompiler.diagnostics.formatDiagnostic(issue), true);
    renderSignalArtifact();
  } else {
    try {
      signalValue = decodeSignal(message);
    } catch (error) {
      notice('#signalNotice', `Line ${error.line}, column ${error.column}. ${error.message}`, true);
    }
  }
  output.value = signalValue || (morse ? 'Your Morse signal appears here.' : 'Decoded text appears here.');
  $('#transmit').disabled = !canTransmit() || transmitter.playing;
  $('#copySignal').disabled = !signalValue;
  $('#copySignal').textContent = 'Copy';
}

function stopPlayback() {
  transmitter.stop();
}

function playSignal() {
  if (!canTransmit() || transmitter.playing) return;
  const timeline = signalCompiler.timing.schedule(signalResult.ir, { wpm: Number($('#speed').value) });
  $('#transmit').disabled = true;
  $('#stop').disabled = false;
  transmitter.play(timeline);
}

function startKey(owner) {
  if (keyOwner !== undefined) return;
  keyOwner = owner;
  keyDecoder.press();
  key.classList.add('pressed');
  $('#relay').classList.add('lit');
  function draw() {
    $('#duration').value = keyDecoder.heldFor();
    keyFrame = requestAnimationFrame(draw);
  }
  keyFrame = requestAnimationFrame(draw);
}

function releaseKey(addMark) {
  if (keyOwner === undefined) return;
  keyOwner = undefined;
  cancelAnimationFrame(keyFrame);
  key.classList.remove('pressed');
  $('#relay').classList.remove('lit');
  $('#duration').value = 0;
  if (addMark) keyDecoder.release();
  else keyDecoder.cancel();
}

function flushKey() {
  releaseKey(false);
  keyDecoder.flush();
}

function setLab(mode) {
  if (mode === labMode) return;
  stopPlayback();
  flushKey();
  if (labMode !== 'key') labDrafts[labMode] = $('#message').value;
  labMode = mode;
  if (mode !== 'key') $('#message').value = labDrafts[mode];
  $('#translatePane').hidden = mode === 'key';
  $('#keyPane').hidden = mode !== 'key';
  $('#playback').hidden = mode === 'decode';
  $('#signalPipeline').hidden = mode !== 'encode';
  $('#transmit').hidden = mode === 'key';
  $('#stop').hidden = mode === 'key';
  $('.speed-label').hidden = mode === 'key';
  $('#messageLabel').textContent = mode === 'decode' ? 'Morse signal' : 'Message';
  $('#message').placeholder = mode === 'decode' ? '... --- ... / ... --- ...' : 'Type a message to transmit…';
  $('#signalLabel').textContent = mode === 'encode' ? 'Morse signal' : 'Decoded text';
  $$('[data-lab]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.lab === mode));
  renderSignal();
}

$$('[data-lab]').forEach((button) => button.addEventListener('click', () => setLab(button.dataset.lab)));
$('#message').addEventListener('input', () => { stopPlayback(); renderSignal(); });
$('#signalExample').addEventListener('click', () => {
  stopPlayback();
  $('#message').value = labMode === 'encode' ? 'MEET ME AT FIRST LIGHT' : '... --- ... / ... --- ...';
  renderSignal();
});
$('#speed').addEventListener('input', (event) => {
  stopPlayback();
  $('#speedValue').value = `${event.target.value} WPM`;
});
$('#transmit').addEventListener('click', playSignal);
$('#stop').addEventListener('click', stopPlayback);
$('#copySignal').addEventListener('click', (event) => copy(signalValue, event.currentTarget));

key.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || keyOwner !== undefined) return;
  key.setPointerCapture(event.pointerId);
  startKey(event.pointerId);
});
key.addEventListener('pointerup', (event) => {
  if (keyOwner === event.pointerId) releaseKey(true);
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  key.addEventListener(type, (event) => {
    if (keyOwner === event.pointerId) releaseKey(false);
  });
}
key.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' && event.key !== 'Enter') return;
  event.preventDefault();
  if (!event.repeat) startKey(event.code);
});
key.addEventListener('keyup', (event) => {
  if (keyOwner !== event.code) return;
  event.preventDefault();
  releaseKey(true);
});
key.addEventListener('blur', () => releaseKey(false));
window.addEventListener('blur', () => releaseKey(false));
$('#undoKey').addEventListener('click', () => {
  releaseKey(false);
  keyDecoder.backspace();
});
$('#clearKey').addEventListener('click', () => {
  releaseKey(false);
  keyDecoder.clear();
});
$('#signalPipeline').addEventListener('toggle', renderSignalArtifact);
$('#signalStage').addEventListener('change', renderSignalArtifact);

const pages = ['compiler', 'signal', 'codebook'];
function navigate() {
  const name = location.hash.slice(1);
  const active = pages.includes(name) ? name : 'compiler';
  for (const page of pages) {
    $('#' + page).hidden = page !== active;
    const link = $(`nav [href="#${page}"]`);
    if (page === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (active !== 'signal') {
    stopPlayback();
    flushKey();
  }
}

$('#openGuide').addEventListener('click', () => $('#guide').showModal());
window.addEventListener('hashchange', navigate);
for (const [letter, code] of Object.entries(MORSE).sort(([a], [b]) => {
  const group = (character) => /^[A-Z]$/.test(character) ? 0 : /^\d$/.test(character) ? 1 : 2;
  return group(a) - group(b) || a.localeCompare(b);
})) {
  const item = document.createElement('div');
  const heading = document.createElement('strong');
  const marks = document.createElement('code');
  heading.textContent = letter;
  marks.textContent = code;
  item.append(heading, marks);
  $('#codeGrid').append(item);
}

for (const { kind, op, units } of signalCompiler.compiler.compile('SOS').ir.instructions) {
  const bar = document.createElement('span');
  bar.style.flexGrow = units;
  if (op === 'MARK') bar.className = kind;
  $('#heroWave').append(bar);
}

$('#message').placeholder = 'Type a message to transmit…';
loadExample();
renderSignal();
navigate();
