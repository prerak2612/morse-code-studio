# Architecture

Pulsefield is a static application structured as a compiler. Each phase is a pure module that can be tested in Node and runs unchanged in the browser. Only the UI layer touches the DOM.

## Data flow

1. **Lexing** (`src/compiler/lexer.js`) turns the source into a lossless token stream. Unsupported characters become `INVALID` tokens rather than disappearing.
2. **Parsing** (`src/compiler/parser.js`) groups tokens into a `Message → Word → Character` AST. `INVALID` tokens become diagnostics (`src/compiler/diagnostics.js`) and parsing continues, so a single bad character never discards the rest of the message.
3. **Lowering** (`src/compiler/ir.js`) flattens the AST into an IR of `MARK` and `GAP` instructions measured in Morse units. Gaps are emitted only *between* elements, letters and words, never at the edges, so the unit count of a program is exact.
4. **Text codegen** (`src/codegen/text.js`) emits the textual Morse form from the IR and keeps a segment-to-instruction index map for highlighting.
5. **Scheduling** (`src/codegen/timing.js`) converts units to milliseconds with `dot = 1200 / WPM`, producing absolute start and end times for every instruction.
6. **Execution** (`src/codegen/transmitter.js`) walks the timeline and notifies outputs through `start`, `markStart`, `markEnd` and `end`. Every event is scheduled from the start time rather than chained, so timer jitter does not accumulate. `stop()` cancels all pending events and always calls `end`, so every output is guaranteed to reset.
7. **Outputs** (`src/codegen/outputs.js`): the audio output schedules the whole envelope on the `AudioContext` clock in one pass, with 4 ms ramps to avoid clicks, and closes the context on `end`. The light output toggles a CSS class.
8. **Decoding** (`src/decoder/decoder.js`) is a clock-driven state machine. A press shorter than 220 ms is a dot. After 700 ms of silence the letter is committed, and after 1500 ms a word space is added. Unknown sequences become `?` and are reported.

## Design decisions

- **Dependency injection at the edge.** `createApp({ document, clock, createAudioContext, clipboard })` receives every side effect. The browser bootstrap (`src/main.js`) passes real implementations, so the UI can also run under a simulated clock and `AudioContext`, for example in Node.
- **One IR, many targets.** Text, audio, light and the inspection panels all read the same IR and timeline, so they cannot disagree about what is transmitted or when.
- **Warnings skip, errors block.** Unsupported characters are reported and skipped. Malformed Unicode is an error and stops transmission. An empty message is informational.
- **No build step.** Modules use a small UMD wrapper: `require` in Node and the `window.Pulsefield.*` namespace in the browser (the lexer keeps `window.MorseLexer`). Scripts load in dependency order from `index.html`, so the app also works from `file://`.
- **Immutable compiler output.** AST nodes and IR instructions are frozen, so renderers cannot accidentally mutate shared state.

Google Fonts are cosmetic only; the app stays fully functional offline.
