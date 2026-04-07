**Product Spec: Polished Cross-Platform Shell UI**

**Goal**
Build a fast, minimal terminal app for macOS and Windows with a fully custom polished shell UI, advanced history/search, and rich command cards. The terminal surface is hidden by default. Raw terminal mode appears only for full-screen TUI apps.

**Platforms**

* macOS
* Windows

**Core Stack**

* Electron
* `node-pty`
* `ghostty-web`
* Local SQLite database for history and metadata

**Primary UX Model**

* Default experience is a custom IDE-like shell editor, not a visible terminal
* Users can type anywhere in the editor
* Shell syntax highlighting
* Rich prompt/header UI with Starship-style contextual info
* Commands execute into styled cards instead of plain terminal scrollback
* Automatic switch to terminal mode for full-screen interactive apps like `vim`, `lazygit`, `codex`, etc.
* Exit terminal mode back to the normal shell UI with `Ctrl+C`

**MVP Features**

* Custom shell editor with free cursor placement
* Shell syntax highlighting
* Inline/autocomplete suggestions based on shell history
* Up arrow shows history for the current working directory
* `Ctrl/Cmd+R` opens global history search
* History search shows:

  * command
  * cwd
  * timestamp
  * duration
  * exit code
* Command result cards with actions:

  * copy command
  * copy output
  * copy both
* Starship-like shell header showing git branch and other context
* PTY-backed execution for real shell correctness
* Terminal mode for full-screen TUIs
* Theme support

**History System**

* Store command history in local SQLite
* Persist:

  * command text
  * cwd
  * shell/session
  * timestamp
  * duration
  * exit code
  * captured output metadata
* Use this DB for autocomplete, filtered history, rich search, and future AI features

**Architecture**

* **Electron main process**

  * owns PTY sessions
  * launches shells
  * detects fullscreen/TUI mode
  * writes execution/history records to SQLite
* **Preload**

  * secure IPC bridge
* **Renderer**

  * custom editor UI
  * card-based command/output UI
  * history search UI
  * terminal mode view using `ghostty-web`

**Execution Model**

* Normal commands run through the shell and render into structured UI cards
* Full-screen interactive commands switch the active view to terminal mode
* Terminal mode is a compatibility layer, not the default experience

**Command Cards**
Each executed command becomes a card containing:

* command text
* status
* exit code
* duration
* cwd/context
* output preview/full output
* copy actions

**Autocomplete and Search**

* History-based autocomplete in the editor
* CWD-aware history ranking
* Global searchable history with metadata
* Foundation for semantic/AI-assisted command retrieval later

**V2**

* `Cmd+I` AI assistant
* Reads current editor content plus local history DB
* Helps explain errors, suggest fixes, and recommend commands
* Uses local shell context and execution history as grounding

**Non-Goals for MVP**

* Showing a traditional terminal continuously
* Plugin ecosystem
* Remote agent platform
* Full IDE/project management scope

**Success Criteria**

* Feels faster and more polished than a normal terminal for command-driven workflows
* Full shell correctness via PTY-backed execution
* Smooth fallback to terminal mode for TUIs
* Rich history/search UX is materially better than shell-native history
* Architecture cleanly supports future AI features

