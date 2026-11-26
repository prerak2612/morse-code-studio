# Lexical Analysis

The lexer (`src/compiler/lexer.js`) is the first stage of the Pulsefield Morse compiler. It turns raw text into a flat, position-aware token stream. It never drops input: every character lands in exactly one token, and joining all lexemes reproduces the original string byte-for-byte.

## API

```js
const { tokenize, TokenType, MORSE, formatToken } = require('./src/compiler/lexer.js');
// In the browser the same object is exposed as window.MorseLexer.

tokenize('Hi @ 2');   // → Token[] (always ends with one EOF token)
```

`tokenize` throws `TypeError` if the input is not a string.

## Token shape

| Field     | Type   | Meaning |
|-----------|--------|---------|
| `type`    | string | One of the token types below. |
| `lexeme`  | string | The exact source text the token covers. |
| `value`   | string | Normalized value used by later stages. |
| `offset`  | number | 0-based UTF-16 index of the first character (`input.slice(offset, offset + length) === lexeme`). |
| `line`    | number | 1-based line number. |
| `column`  | number | 1-based column, counted in Unicode code points. |
| `length`  | number | Lexeme length in UTF-16 units. |
| `morse`   | string | International Morse for the token (`/` for separators). Absent on `INVALID` and `EOF`. |
| `message` | string | Human-readable reason. Only present on `INVALID`. |

## Token types

| Type             | Matches                                                    | `value`                | Example lexeme → value |
|------------------|------------------------------------------------------------|------------------------|------------------------|
| `LETTER`         | ASCII `A–Z`, `a–z` (one character)                         | Uppercase letter       | `i` → `I` |
| `DIGIT`          | ASCII `0–9` (one character)                                | The digit              | `2` → `2` |
| `PUNCTUATION`    | `? ! , . ' / ( ) : ; = + - _ " $ @` (one character)        | The mark               | `@` → `@` |
| `WORD_SEPARATOR` | A maximal run of Unicode whitespace (space, tab, NBSP, line breaks, …) | `" "` (single space) | `"   "` → `" "` |
| `INVALID`        | Any other single code point, including lone surrogates     | The character itself   | `#`, `é`, `😀`, `\uD800` |
| `EOF`            | End of input (always exactly one, always last)             | `""`                   | — |

### Rules

1. **Longest match only for whitespace.** Letters, digits, punctuation and invalid characters are always single-code-point tokens; consecutive whitespace merges into one `WORD_SEPARATOR` whose lexeme keeps the raw run.
2. **No silent skipping.** Unsupported characters produce `INVALID` tokens with a `message` such as `Unsupported character "#" (U+0023) has no International Morse code`. Leading and trailing whitespace is also reported, not trimmed.
3. **No lossy folding.** Only ASCII letters are case-normalized. `é`, `ß`, and other non-ASCII letters are `INVALID` rather than silently mapped to `E` or `SS`.
4. **Unicode safety.** The lexer walks code points: an astral character like `😀` is one `INVALID` token with `length: 2`. An unpaired surrogate is reported as `Malformed Unicode: lone surrogate U+D800`. C0/C1 control characters are reported as unsupported control characters.
5. **Positions.** `\n`, `\r`, `\r\n` (counted once), U+2028 and U+2029 start a new line and reset the column to 1. The `EOF` token sits at the position just past the last character.

## Example — acceptance case `Hi @ 2`

```
LETTER          "H" -> "H"  @1:1 (offset 0)
LETTER          "i" -> "I"  @1:2 (offset 1)
WORD_SEPARATOR  " " -> " "  @1:3 (offset 2)
PUNCTUATION     "@" -> "@"  @1:4 (offset 3)
WORD_SEPARATOR  " " -> " "  @1:5 (offset 4)
DIGIT           "2" -> "2"  @1:6 (offset 5)
EOF             ""  -> ""   @1:7 (offset 6)
```

In the app, typing into **Your transmission** renders this stream live in the **Token stream** row of the Encode panel. Each chip shows the type, the lexeme (`␣` for spaces, `∅` for EOF) and `L<line>:C<column> · @<offset>`. `INVALID` chips are outlined in red; hover one to see its message.

## Tests

```bash
npm test   # node --test, no dependencies
```

`tests/lexer.test.js` covers empty input, lowercase normalization, multiple spaces, newlines, every punctuation mark, unsupported ASCII, non-ASCII letters, emoji, lone surrogates, control characters, and lossless round-tripping.
