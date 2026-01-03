# Algopeeps Council

A real-time AI coding assistant that watches your Neovim buffer and provides live feedback from multiple specialized agents. Think of it as pair programming with a council of AI experts watching your code as you type.

## Overview

Algopeeps Council consists of three components working together:

1. **OpenCode Server** - Manages AI agent sessions and handles prompts
2. **TUI Dashboard** - Beautiful terminal UI showing agent feedback in real-time
3. **Neovim Plugin** - Captures buffer events and sends them to the dashboard

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│                 │  TCP    │                  │   SSE   │                 │
│  Neovim Plugin  │────────▶│   TUI Dashboard  │◀────────│  OpenCode       │
│  (Lua client)   │  :9999  │  (Bubble Tea)    │         │  Server         │
│                 │         │                  │         │  (AI Agents)    │
└─────────────────┘         └──────────────────┘         └─────────────────┘
      │                              │                            │
      │                              │                            │
   Watches                      Displays                     Analyzes
   buffer                       feedback                       code
```

**Data Flow:**
1. Neovim plugin detects buffer changes (debounced 5s)
2. Sends buffer content + metadata via TCP to TUI
3. TUI forwards to OpenCode server
4. OpenCode runs prompts through configured agents
5. Agent responses stream back via SSE
6. TUI displays feedback in agent cards

## Installation

### Prerequisites

- Go 1.24.4+
- Neovim 0.9+
- OpenCode CLI installed and configured
- Anthropic API key (for Claude models)

### Build

```bash
# Clone the repository
git clone https://github.com/abhirupda/algopeeps.git
cd algopeeps

# Build the binary
make build

# Or use go directly
go build -o algopeeps ./cmd/algopeeps
```

### Configure OpenCode Agents

Create `opencode.json` in the project root (or copy the provided example):

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "agents": {
    "code-reviewer": {
      "name": "code-reviewer",
      "description": "Reviews code quality, style, and best practices",
      "prompt": "You are a code review assistant..."
    },
    "bug-spotter": {
      "name": "bug-spotter",
      "description": "Identifies potential bugs and edge cases",
      "prompt": "You are a bug detection assistant..."
    }
  }
}
```

Start the OpenCode server with this config:

```bash
opencode serve --config opencode.json
```

### Install Neovim Plugin

Add to your Neovim config (lazy.nvim example):

```lua
{
  dir = "~/path/to/algopeeps/nvim",
  name = "algopeeps",
  config = function()
    require("algopeeps").setup({
      host = "127.0.0.1",
      port = 9999,
      debounce_ms = 5000,  -- Wait 5s after typing before sending update
    })
  end,
}
```

For other plugin managers, ensure the `nvim/` directory is in your runtimepath.

## Development Workflow

### Three-Terminal Setup (Recommended)

**Terminal 1 - OpenCode Server:**
```bash
opencode serve --config opencode.json
```

**Terminal 2 - Algopeeps TUI:**
```bash
./algopeeps
# Or: make run
```

**Terminal 3 - Neovim:**
```bash
nvim somefile.go

# Inside Neovim:
:AlgopeepsConnect
```

### What Happens

1. Open a file in Neovim and run `:AlgopeepsConnect`
2. Edit code, move cursor, or save files
3. After 5 seconds of inactivity, buffer content is sent to TUI
4. TUI forwards to OpenCode agents
5. Agents analyze code and stream responses
6. Feedback appears in the dashboard cards:
   - 🔍 **Code Reviewer** - Quality, style, readability
   - 🐛 **Bug Spotter** - Potential bugs, edge cases, errors

### Neovim Commands

- `:AlgopeepsConnect` - Connect to the TUI server
- `:AlgopeepsDisconnect` - Disconnect and stop sending updates

### TUI Controls

- `q` or `Ctrl+C` - Quit the dashboard

## Configuration

### OpenCode Config (`opencode.json`)

```json
{
  "provider": "anthropic",           // AI provider (anthropic, openai, etc.)
  "model": "claude-sonnet-4-...",    // Model to use
  "agents": {
    "agent-id": {
      "name": "agent-id",            // Agent identifier
      "description": "...",          // What the agent does
      "prompt": "..."                // System prompt for the agent
    }
  }
}
```

**Adding Custom Agents:**

1. Add a new entry to the `agents` object
2. Update `internal/tui/app.go` to handle the agent ID
3. Add a new card in the `View()` function
4. Restart OpenCode server and TUI

### Neovim Plugin Config

```lua
require("algopeeps").setup({
  host = "127.0.0.1",      -- TUI server host
  port = 9999,             -- TUI server port
  debounce_ms = 5000,      -- Debounce delay (milliseconds)
})
```

**Debounce Behavior:**
- `TextChanged`, `TextChangedI`, `CursorMoved` → Debounced (5s default)
- `BufWritePost`, `BufEnter`, `BufLeave` → Immediate

### TCP Protocol

Buffer events are sent as JSON over TCP:

```json
{
  "event": "buffer_changed",
  "buffer": {
    "name": "/path/to/file.go",
    "filetype": "go",
    "content": "package main\n...",
    "cursor": { "line": 42, "col": 10 },
    "line_count": 100
  }
}
```

## Troubleshooting

### "OpenCode ○" shows disconnected

**Check:**
- Is `opencode serve` running?
- Is the config file valid JSON?
- Check OpenCode logs for errors

**Fix:**
```bash
# Test OpenCode is working
opencode --version

# Check if server is running
ps aux | grep "opencode serve"

# Restart with verbose logging
opencode serve --config opencode.json --verbose
```

### "Neovim ○" shows disconnected

**Check:**
- Did you run `:AlgopeepsConnect`?
- Is the TUI running on port 9999?
- Check for port conflicts

**Fix:**
```bash
# Check if port is in use
lsof -i :9999

# In Neovim
:messages  " Check for Lua errors
:AlgopeepsDisconnect
:AlgopeepsConnect
```

### Agents not responding

**Check:**
- Are agent IDs in `opencode.json` matching the IDs in code?
- Check OpenCode server logs
- Verify API key is set

**Fix:**
```bash
# Check agent IDs match
cat opencode.json | jq '.agents | keys'

# Should include: "code-reviewer", "bug-spotter"

# Test API key
export ANTHROPIC_API_KEY="your-key"
opencode serve --config opencode.json
```

### Buffer content not updating

**Check:**
- Is debounce delay too long?
- Are you in insert mode? (Try exiting to normal mode)
- Check TUI shows "Neovim ●" (connected)

**Fix:**
```lua
-- Reduce debounce in Neovim config
require("algopeeps").setup({
  debounce_ms = 2000,  -- Reduce to 2 seconds
})
```

### High API costs

**Tips:**
- Increase debounce delay to reduce API calls
- Use smaller/cheaper models (Claude Haiku instead of Sonnet)
- Set buffer size limits in `internal/tui/app.go` (currently 100KB with 50-line context)

## Project Structure

```
algopeeps/
├── cmd/algopeeps/          # Main entry point
│   └── main.go             # Starts TUI and TCP server
├── internal/
│   ├── config/             # Configuration management
│   ├── opencode/           # OpenCode SDK client
│   ├── protocol/           # TCP protocol types
│   ├── server/             # TCP server for Neovim
│   └── tui/                # Bubble Tea TUI
│       ├── app.go          # Main TUI model
│       ├── components/     # UI components (cards, status bar)
│       ├── messages.go     # Bubble Tea messages
│       └── styles.go       # Lipgloss styles
├── nvim/                   # Neovim plugin
│   └── lua/algopeeps/
│       ├── init.lua        # Plugin entry point
│       ├── client.lua      # TCP client
│       └── debounce.lua    # Debounce logic
├── opencode.json           # OpenCode agent configuration
├── go.mod                  # Go dependencies
├── Makefile                # Build commands
└── README.md               # This file
```

## Future Work

### Planned Features

- [ ] Agent session persistence (survive restarts)
- [ ] Multiple file context (send related files, not just current buffer)
- [ ] Interactive agent commands (ask questions, request refactors)
- [ ] Custom agent triggers (e.g., only run on save, not on every change)
- [ ] Agent response history/timeline
- [ ] Configurable UI themes
- [ ] Agent performance metrics (response time, token usage)

### Ideas

- [ ] Code diff mode (show what changed, agents comment on diffs)
- [ ] Integration with LSP (send diagnostics to agents)
- [ ] Multi-cursor support
- [ ] Project-level context (send project structure, dependencies)
- [ ] Agent voting/consensus (agents agree/disagree on feedback)
- [ ] Voice output (TTS for agent feedback)
- [ ] Web dashboard (view feedback in browser)

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Bubble Tea](https://github.com/charmbracelet/bubbletea) TUI framework
- Powered by [OpenCode SDK](https://github.com/sst/opencode-sdk-go)
- Inspired by the need for real-time AI pair programming
