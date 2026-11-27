'use strict';

const PulseProgram = (({ MORSE: TEXT_MORSE }) => {
  // International Morse has no asterisk. This extension is only used in Morse source code.
  const SOURCE_MORSE = Object.freeze({ ...TEXT_MORSE, '*': '...-.-' });
  const reverse = (map) => Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key]));
  const TEXT_REVERSE = reverse(TEXT_MORSE);
  const SOURCE_REVERSE = reverse(SOURCE_MORSE);
  const MAX_SOURCE = 12000;

  class Diagnostic extends Error {
    constructor(stage, { line, column }, message) {
      super(message);
      Object.assign(this, { stage, line, column });
    }
  }

  function encodeSignal(text, program = false) {
    const map = program ? SOURCE_MORSE : TEXT_MORSE;
    const unsupported = new Set();
    const signal = text.replace(/\r\n?/g, '\n').split('\n').map((line) => {
      const words = line.trim().split(/[^\S\n]+/);
      return words.map((word) => Array.from(word, (character) => {
        const key = /[a-z]/.test(character) ? character.toUpperCase() : character;
        if (Object.hasOwn(map, key)) return map[key];
        unsupported.add(character);
        return '';
      }).filter(Boolean).join(' ')).filter(Boolean).join(' / ');
    }).join(program ? '\n' : ' / ');
    return { signal: program ? signal : signal.split(' / ').filter(Boolean).join(' / '), unsupported: [...unsupported] };
  }

  function decodeSignal(signal, program = false) {
    const map = program ? SOURCE_REVERSE : TEXT_REVERSE;
    const lines = signal.replace(/\r\n?/g, '\n').split('\n').map((line, index) => {
      let text = '';
      let separator;
      for (const match of line.matchAll(/[^\s/]+|\//g)) {
        const [group] = match;
        const location = { line: index + 1, column: match.index + 1 };
        if (group === '/') {
          if (!text || separator) throw new Diagnostic('signal', location, 'Unexpected word separator.');
          separator = location;
          continue;
        }
        const normalized = group.replace(/[·•]/g, '.').replace(/[–—−]/g, '-');
        const letter = map[normalized];
        if (!Object.hasOwn(map, normalized)) throw new Diagnostic('signal', location, `Unknown Morse group “${group}”.`);
        text += (separator ? ' ' : '') + letter;
        separator = null;
      }
      if (separator) throw new Diagnostic('signal', separator, 'Expected a Morse group after the separator.');
      return text;
    });
    return program ? lines.join('\n') : lines.filter(Boolean).join(' ');
  }

  function tokenize(source) {
    const tokens = [];
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    const pattern = /[ \t]+|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|[^]/g;
    const keywords = ['LET', 'SET', 'PRINT'];
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(pattern)) {
        const [lexeme] = match;
        if (/^[ \t]/.test(lexeme)) continue;
        const token = { lexeme, line: index + 1, column: match.index + 1 };
        if (/^[a-z_]/i.test(lexeme)) {
          token.value = lexeme.toUpperCase();
          token.type = keywords.includes(token.value) ? token.value : 'IDENT';
        } else if (/^\d/.test(lexeme)) {
          token.type = 'NUMBER';
          token.value = Number(lexeme);
          if (!Number.isFinite(token.value)) throw new Diagnostic('lexer', token, 'Number is out of range.');
        } else if ('+-*/=();'.includes(lexeme)) {
          token.type = lexeme === ';' ? 'END' : lexeme;
        } else {
          throw new Diagnostic('lexer', token, `Unexpected character “${lexeme}”.`);
        }
        tokens.push(token);
      }
      if (index < lines.length - 1) {
        tokens.push({ type: 'END', lexeme: '\n', line: index + 1, column: line.length + 1 });
      }
    }
    tokens.push({ type: 'EOF', lexeme: '', line: lines.length, column: lines.at(-1).length + 1 });
    return tokens;
  }

  const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const OPERATORS = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV' };

  function parse(tokens) {
    let cursor = 0;
    const peek = () => tokens[cursor];
    const take = () => tokens[cursor++];
    function expect(type, message) {
      if (peek().type !== type) throw new Diagnostic('parser', peek(), message);
      return take();
    }

    function expression(minimum = 0, depth = 0) {
      const token = peek();
      if (depth > 64) throw new Diagnostic('parser', token, 'Expression nesting exceeds 64 levels.');
      let left;
      if (token.type === 'NUMBER' || token.type === 'IDENT') {
        take();
        left = { kind: token.type === 'NUMBER' ? 'Number' : 'Variable', value: token.value, token };
      } else if (token.type === '-' || token.type === '+') {
        take();
        left = { kind: 'Unary', operator: token.type, operand: expression(3, depth + 1), token };
      } else if (token.type === '(') {
        take();
        left = expression(0, depth + 1);
        expect(')', 'Expected a closing parenthesis.');
      } else {
        throw new Diagnostic('parser', token, 'Expected a number, variable, or parenthesized expression.');
      }
      while (PRECEDENCE[peek().type] >= minimum) {
        const operator = take();
        const right = expression(PRECEDENCE[operator.type] + 1, depth + 1);
        left = { kind: 'Binary', operator: operator.type, left, right, token: operator };
      }
      return left;
    }

    const statements = [];
    while (peek().type !== 'EOF') {
      if (peek().type === 'END') {
        take();
        continue;
      }
      const keyword = peek();
      if (!['LET', 'SET', 'PRINT'].includes(keyword.type)) {
        throw new Diagnostic('parser', keyword, 'Expected LET, SET, or PRINT.');
      }
      take();
      let name;
      if (keyword.type !== 'PRINT') {
        name = expect('IDENT', 'Expected a variable name.');
        expect('=', 'Expected “=” after the variable name.');
      }
      const value = expression();
      if (peek().type !== 'EOF') expect('END', 'Expected a newline or “;” after the statement.');
      statements.push({ kind: keyword.type, name, value });
    }
    if (!statements.length) throw new Diagnostic('parser', peek(), 'Enter at least one statement.');
    return { kind: 'Program', statements };
  }

  function visitExpression(root, visit) {
    const pending = [{ node: root, visited: false }];
    while (pending.length) {
      const { node, visited } = pending.pop();
      if (visited || node.kind === 'Variable' || node.kind === 'Number') {
        visit(node);
      } else {
        pending.push({ node, visited: true });
        if (node.kind === 'Unary') pending.push({ node: node.operand, visited: false });
        else pending.push({ node: node.right, visited: false }, { node: node.left, visited: false });
      }
    }
  }

  function analyze(ast) {
    const symbols = new Map();
    for (const { kind, name, value } of ast.statements) {
      const known = name && symbols.get(name.value);
      if (kind === 'LET' && known) throw new Diagnostic('semantic', name, `“${name.value}” is already declared.`);
      if (kind === 'SET' && !known) throw new Diagnostic('semantic', name, `Declare “${name.value}” with LET before assigning it.`);
      visitExpression(value, (node) => {
        if (node.kind === 'Variable' && !symbols.has(node.value)) {
          throw new Diagnostic('semantic', node.token, `“${node.value}” is undefined. Declare it with LET first.`);
        }
      });
      if (kind === 'LET') symbols.set(name.value, { name: name.value, slot: symbols.size, line: name.line });
    }
    return symbols;
  }

  function generate(ast, symbols) {
    const code = [];
    for (const statement of ast.statements) {
      visitExpression(statement.value, ({ kind, value, operator, token }) => {
        if (kind === 'Number') code.push({ op: 'PUSH', arg: value, token });
        if (kind === 'Variable') code.push({ op: 'LOAD', arg: symbols.get(value).slot, token });
        if (kind === 'Binary') code.push({ op: OPERATORS[operator], token });
        if (kind === 'Unary' && operator === '-') code.push({ op: 'NEG', token });
      });
      if (statement.name) {
        code.push({ op: 'STORE', arg: symbols.get(statement.name.value).slot });
      } else {
        code.push({ op: 'PRINT' });
      }
    }
    return code;
  }

  function calculate(op, left, right) {
    switch (op) {
      case 'ADD': return left + right;
      case 'SUB': return left - right;
      case 'MUL': return left * right;
      case 'DIV': return left / right;
      case 'NEG': return -right;
      default: throw new Error(`Unknown bytecode instruction ${op}`);
    }
  }

  function optimize(code) {
    const optimized = [];
    for (const instruction of code) {
      const { op, token } = instruction;
      const right = optimized.at(-1);
      const left = optimized.at(-2);
      const operands = op === 'NEG' ? 1 : 2;
      if (['ADD', 'SUB', 'MUL', 'DIV', 'NEG'].includes(op) &&
          right?.op === 'PUSH' && (operands === 1 || left?.op === 'PUSH')) {
        const value = calculate(op, left?.arg, right.arg);
        if (Number.isFinite(value)) {
          optimized.splice(-operands, operands, { op: 'PUSH', arg: value, token });
          continue;
        }
      }
      optimized.push(instruction);
    }
    return optimized;
  }

  function execute(code, output) {
    const stack = [];
    const memory = [];
    for (const { op, arg, token } of code) {
      switch (op) {
        case 'PUSH': stack.push(arg); break;
        case 'LOAD': stack.push(memory[arg]); break;
        case 'STORE': memory[arg] = stack.pop(); break;
        case 'PRINT': output.push(stack.pop()); break;
        default: {
          const right = stack.pop();
          if (op === 'DIV' && right === 0) throw new Diagnostic('runtime', token, 'Division by zero.');
          const value = calculate(op, op === 'NEG' ? undefined : stack.pop(), right);
          if (!Number.isFinite(value)) throw new Diagnostic('runtime', token, 'Arithmetic result is out of range.');
          stack.push(value);
        }
      }
    }
  }

  function compile(input, { format = 'text', fold = true } = {}) {
    const result = { stages: {}, output: [] };
    try {
      if (input.length > MAX_SOURCE) {
        throw new Diagnostic('signal', { line: 1, column: 1 }, `Source exceeds ${MAX_SOURCE.toLocaleString('en-US')} characters.`);
      }
      const source = format === 'morse' ? decodeSignal(input, true) : input;
      result.stages.signal = { source, morse: encodeSignal(source, true).signal };
      const tokens = tokenize(source);
      result.stages.lexer = tokens;
      const ast = parse(tokens);
      result.stages.parser = ast;
      const symbols = analyze(ast);
      result.stages.semantic = [...symbols.values()];
      const original = generate(ast, symbols);
      const code = fold ? optimize(original) : original;
      result.stages.bytecode = { original, code };
      execute(code, result.output);
    } catch (error) {
      if (!(error instanceof Diagnostic)) throw error;
      result.error = error;
    }
    return result;
  }

  return { MORSE: TEXT_MORSE, encodeSignal, decodeSignal, compile, MAX_SOURCE };
})(typeof module !== 'undefined' && module.exports
  ? require('./src/compiler/symbol-table.js')
  : globalThis.MorseSymbolTable);

if (typeof module !== 'undefined' && module.exports) module.exports = PulseProgram;
