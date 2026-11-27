# Semantic Analysis and IR

After the lexer (see `LEXICAL_ANALYSIS.md`) and the parser have built an AST, three modules take over:

1. **Symbol table** (`src/compiler/symbol-table.js`): what each symbol means.
2. **Semantic analyzer** (`src/compiler/semantic-analyzer.js`): checks every symbol in the AST against the table and reports problems as structured diagnostics.
3. **IR generator** (`src/compiler/ir-generator.js`): lowers a valid AST into timing instructions, then runs a small optimization pass.

```
text → lexer → tokens → parser → AST → semantic analyzer → diagnostics
                                   └──→ IR generator → optimize → IR
```

All three modules are plain JavaScript with no dependencies. They load with `require` in Node and as classic `<script>` files in the browser (`window.MorseSymbolTable`, `window.MorseSemantic`, `window.MorseIR`).

## Input: the AST

Both the analyzer and the IR generator read the `Message → Word → Character` tree the parser produces:

```js
{
  type: 'Message',
  words: [
    { type: 'Word', characters: [
      { type: 'Character', value: 'H', span: { offset: 0, length: 1, line: 1, column: 1 } },
      { type: 'Character', value: 'I', span: { offset: 1, length: 1, line: 1, column: 2 } },
    ] },
  ],
}
```

Only `value` and `span` on each character are used. `value` must be the normalized (uppercase) value the lexer produces.

## Symbol table

`symbol-table.js` is the single source of truth for which symbols exist and their International Morse code (ITU-R M.1677-1). Before this change the same table was copied in `lexer.js` and `script.js`; both now read it from here, so a fix in one place applies everywhere.

```js
const { MORSE, lookup } = require('./src/compiler/symbol-table.js');

lookup('S');   // '...'
lookup(';');   // '-.-.-.'
lookup('s');   // null  (lookup is exact; the lexer uppercases letters)
lookup('#');   // null  (not in the table)
```

| Group       | Symbols |
|-------------|---------|
| Letters     | `A`–`Z` |
| Digits      | `0`–`9` |
| Punctuation | `? ! , . ' / ( ) : ; = + - _ " $ @` |

`lookup` only returns the table's own entries, so a name like `toString` gives `null`, not a function.

**Semicolon.** The semicolon is `-.-.-.` (dah-di-dah-di-dah-dit). It is easy to mix up with the full stop `.-.-.-`, which is the same pattern starting on a dit. `tests/symbol-table.test.js` pins both values and checks that every code in the table is unique, so decoding can never be ambiguous.

## Semantic analyzer

```js
const { analyze, formatDiagnostic } = require('./src/compiler/semantic-analyzer.js');

analyze(ast);   // → { ok: boolean, diagnostics: Diagnostic[] }
```

The analyzer visits every character and looks up its `value` in the symbol table. Each symbol that is missing becomes one diagnostic. Diagnostics come back in source order. Bad user input never throws; only an argument that is not a `Message` node throws a `TypeError`, since that is a programming error.

### Diagnostic shape

| Field      | Meaning |
|------------|---------|
| `code`     | Stable identifier. `SEM001` = unknown symbol. |
| `severity` | `error`: the message cannot be turned into IR as written. |
| `symbol`   | The offending symbol. |
| `reason`   | Human-readable explanation, including the Unicode code point. |
| `location` | `{ line, column, offset, length }` copied from the character's span, using the same conventions as the lexer. |

Example for `Hi #2`:

```json
{
  "code": "SEM001",
  "severity": "error",
  "symbol": "#",
  "reason": "Symbol \"#\" (U+0023) is not in the Morse symbol table",
  "location": { "line": 1, "column": 4, "offset": 3, "length": 1 }
}
```

`formatDiagnostic(d)` renders it as one line: `1:4 error SEM001 Symbol "#" (U+0023) is not in the Morse symbol table`.

A character node with no `value` is reported with the reason `Character node has no symbol` instead of crashing.

## IR

```js
const { generateIR, optimize, Op, UNITS } = require('./src/compiler/ir-generator.js');

generateIR(ast);                       // optimized IR (default)
generateIR(ast, { optimize: false });  // raw lowering
```

The IR is a flat array of instructions. Each one has an `op` and its length in Morse `units`. Marks also keep the `symbol` they came from.

| `op`          | Units | Meaning |
|---------------|-------|---------|
| `DIT`         | 1     | Short signal (`.`) |
| `DAH`         | 3     | Long signal (`-`) |
| `ELEMENT_GAP` | 1     | Silence between the dits and dahs of one letter |
| `LETTER_GAP`  | 3     | Silence between letters |
| `WORD_GAP`    | 7     | Silence between words |

These are the standard Morse ratios. One unit is one dit long; a playback stage turns units into time (for example `1200 / WPM` milliseconds per unit).

### Lowering

`generateIR` walks words, then characters, then the dits and dahs of each character's code from the symbol table. It emits each mark followed by an `ELEMENT_GAP`, ends each character with a `LETTER_GAP`, and ends each word with a `WORD_GAP`. Each step only has to think about its own node, which keeps the code short.

The IR generator expects an AST that passed semantic analysis. If it still meets an unknown symbol it throws `No Morse code for "#"; run semantic analysis first`.

### Optimization pass

Raw lowering leaves redundant silence. The last element of a letter gets an `ELEMENT_GAP` directly followed by a `LETTER_GAP`, and the message ends with gaps that separate nothing. In real Morse the space between letters is 3 units in total, not 1 + 3, so these must go for the timing to be correct.

`optimize(ir)` makes one pass over the list:

1. A run of adjacent gaps becomes the single widest gap in the run (`WORD_GAP` > `LETTER_GAP` > `ELEMENT_GAP`).
2. Gaps at the start or end are dropped.

It returns a new array and does not change its input. Running it twice gives the same result. It also cleans up oddities such as an empty word in the AST, which would otherwise produce two `WORD_GAP`s in a row.

Example for `ET A`:

```
raw:       DIT E, ELEMENT_GAP, LETTER_GAP, DAH T, ELEMENT_GAP, LETTER_GAP, WORD_GAP,
           DIT A, ELEMENT_GAP, DAH A, ELEMENT_GAP, LETTER_GAP, WORD_GAP
optimized: DIT E, LETTER_GAP, DAH T, WORD_GAP, DIT A, ELEMENT_GAP, DAH A
```

`PARIS`, the standard timing word, comes out at 43 units: the textbook 50 minus the trailing 7-unit word gap, which the optimizer drops.

### Determinism

The IR depends only on the AST. There are no timestamps or random ids, so the same AST always produces the same IR, and `"Meet me"`, `"MEET ME"` and `"meet   me"` all give identical IR. `tests/ir.test.js` checks this.

## Tests

```bash
npm test
```

| File | Covers |
|------|--------|
| `tests/symbol-table.test.js` | Semicolon and full-stop codes, unique codes, exact lookup, lexer uses the shared table |
| `tests/semantic.test.js` | Valid and empty ASTs, diagnostic location and reason, multiple errors across lines and emoji, missing values, formatting, bad input |
| `tests/ir.test.js` | Raw and optimized IR, codes and units, PARIS = 43 units, gap merging and trimming, idempotence, empty words, determinism, unknown symbols |

`tests/helpers/ast.js` builds an AST from text using the real lexer, so test locations match what the app sees. It keeps invalid characters in the tree on purpose so the analyzer has something to reject.
