# Algopeeps Council — v0 Architecture Plan

## Overview

A Go-based TUI that integrates with a Neovim Lua plugin to enable live coding in Neovim while streaming buffer context into the TUI, where OpenCode-backed agents listen and react.

```
┌─────────────┐      TCP (JSON-newline)      ┌─────────────────┐      HTTP/SSE      ┌─────────────────┐
│   Neovim    │ ─────────────────────────────▶│   Algopeeps     │ ──────────────────▶│   OpenCode      │
│   Plugin    │                               │   TUI (Go)      │ ◀──────────────────│   Server        │
│   (Lua)     │                               │   Bubble Tea    │                    │   (localhost)   │
└─────────────┘                               └─────────────────┘                    └─────────────────┘
```

---

## 1. Milestone Plan (14 Steps)

### Phase 1: Foundation (Steps 1-4)

| Step | Description | Deliverable |
|------|-------------|-------------|
| **1** | Set up Go module, project structure, and dependencies | `go.mod` with bubbletea, lipgloss, opencode-sdk-go |
| **2** | Create minimal Bubble Tea app with 2-pane layout (agents + summary) | TUI runs with placeholder panes |
| **3** | Implement TCP server goroutine with `Program.Send()` injection | Server accepts connections, logs messages to TUI |
| **4** | Define JSON message protocol structs in Go | Shared types for buffer events |

### Phase 2: Neovim Plugin (Steps 5-7)

| Step | Description | Deliverable |
|------|-------------|-------------|
| **5** | Create Lua plugin skeleton with `:AlgopeepsConnect` command | Plugin loads, connects to TCP server |
| **6** | Implement debounced buffer streaming (TextChanged/BufWritePost) | Events fire every 5s or on save |
| **7** | Send JSON buffer snapshots with metadata to TCP server | Full round-trip: Neovim → TUI logs buffer info |

### Phase 3: OpenCode Integration (Steps 8-10)

| Step | Description | Deliverable |
|------|-------------|-------------|
| **8** | Integrate opencode-sdk-go: create/reuse session on TUI start | Session ID displayed in TUI |
| **9** | On buffer event, send message to OpenCode with context prompt | Agent receives buffer + "what changed" |
| **10** | Subscribe to `/event` SSE stream, render agent responses live | Streaming text appears in TUI |

### Phase 4: Testing & Polish (Steps 11-14)

| Step | Description | Deliverable |
|------|-------------|-------------|
| **11** | Write integration test suite for agent connections | Tests verify OpenCode connectivity |
| **12** | Style TUI with Lipgloss: borders, colors, spinner for loading | Clean 2-pane UI |
| **13** | Add connection status, error handling, reconnection logic | Robust UX for disconnects |
| **14** | Write README with demo workflow and video/gif | Shippable v0 |

---

## 2. Architecture & Data Flow

### TUI Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ALGOPEEPS COUNCIL                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         REACTOR AGENTS                                │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────┐  ┌─────────────────────────────────┐ │  │
│  │  │  🔍 Code Reviewer           │  │  🐛 Bug Spotter                 │ │  │
│  │  │                             │  │                                 │ │  │
│  │  │  The function `calculate`   │  │  Potential nil pointer on      │ │  │
│  │  │  could benefit from input   │  │  line 47: `user.Name` may be   │ │  │
│  │  │  validation. Consider       │  │  nil if user lookup fails.     │ │  │
│  │  │  checking for empty slice.  │  │                                 │ │  │
│  │  │                             │  │  ⣾ Analyzing...                 │ │  │
│  │  └─────────────────────────────┘  └─────────────────────────────────┘ │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  SUMMARY                                                              │  │
│  │  📄 main.go (go) | Line 47, Col 12 | 156 lines | Last: text_changed  │  │
│  │  ────────────────────────────────────────────────────────────────────│  │
│  │  Recent: +3 lines added to `handleUser()` | TODO added on line 52    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  [Connected ● | Session: abc123 | Model: claude-sonnet]                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components

- **Top Pane (80% height)**: Two reactor agents side-by-side
  - **Code Reviewer**: General code quality observations
  - **Bug Spotter**: Potential bugs and edge cases
- **Bottom Pane (20% height)**: Summary panel
  - Current file metadata
  - Brief summary of recent changes
- **Status Bar**: Connection status, session ID, model

### Data Flow

1. **Neovim → TUI (TCP)**
   - Plugin detects `TextChanged`, `TextChangedI`, `BufWritePost`
   - Debounces (5s timer, reset on each event; immediate on save)
   - Sends JSON-newline message over persistent TCP connection

2. **TUI → OpenCode (HTTP)**
   - On receiving buffer event, TUI sends to both reactor agents
   - Uses `github.com/sst/opencode-sdk-go`:
     ```go
     client := opencode.NewClient(option.WithBaseURL("http://localhost:4096"))
     session, _ := client.Session.New(ctx, opencode.SessionNewParams{})
     response, _ := client.Session.Prompt(ctx, session.ID, opencode.SessionPromptParams{
         Agent: opencode.F("code-reviewer"), // or "bug-spotter"
         Parts: []opencode.SessionPromptParamsPart{{
             Type: opencode.F(opencode.TextPartInputTypeText),
             Text: opencode.F(prompt),
         }},
     })
     ```

3. **OpenCode → TUI (SSE)**
   - Subscribe to `GET /event` for real-time updates
   - Parse `message.part.updated` events for streaming text
   - Render incrementally in appropriate agent pane via `Program.Send()`

---

## 3. Message Protocol

### Buffer Event (Neovim → TUI)

```json
{
  "type": "buffer_update",
  "timestamp": "2025-01-04T12:34:56Z",
  "event": "text_changed",
  "buffer": {
    "id": 1,
    "name": "main.go",
    "path": "/Users/dev/project/main.go",
    "filetype": "go",
    "cursor": {
      "line": 42,
      "col": 15
    },
    "line_count": 156,
    "content": "package main\n\nimport \"fmt\"\n\nfunc main() {\n\t// TODO: implement\n}\n"
  }
}
```

### Event Types

| Event | Trigger | Debounce |
|-------|---------|----------|
| `text_changed` | `TextChanged` / `TextChangedI` | 5 seconds |
| `buffer_write` | `BufWritePost` | Immediate |
| `buffer_enter` | `BufEnter` | Immediate (first sync) |

### Rate Limiting / Debouncing Strategy

- **Debounce Timer**: 5 seconds after last keystroke
- **Immediate on Save**: `BufWritePost` bypasses debounce
- **Max Content Size**: 100KB (truncate with `[...truncated...]` marker)
- **Cursor Window Fallback**: If >100KB, send 50 lines around cursor

---

## 4. OpenCode Integration Details

### Configuration (`opencode.json`)

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "agents": {
    "code-reviewer": {
      "name": "code-reviewer",
      "description": "Reviews code quality, style, and best practices",
      "mode": "subagent",
      "prompt": "You are a code review assistant. Watch the live buffer and provide brief observations about code quality, readability, and best practices. Max 2-3 sentences. Be constructive, not pedantic.",
      "permission": {
        "bash": {},
        "edit": "deny"
      }
    },
    "bug-spotter": {
      "name": "bug-spotter",
      "description": "Identifies potential bugs and edge cases",
      "mode": "subagent",
      "prompt": "You are a bug detection assistant. Watch the live buffer and identify potential bugs, null pointer risks, edge cases, and error handling gaps. Max 2-3 sentences. Focus on actionable issues.",
      "permission": {
        "bash": {},
        "edit": "deny"
      }
    }
  }
}
```

### Session Management

1. **On TUI Start**: Check for existing session via `GET /session` or create new
2. **Session Reuse**: Store session ID in memory; recreate on OpenCode restart
3. **Session Title**: `"Algopeeps Council - {date}"`

### Streaming Responses

```go
// Subscribe to SSE events
stream := client.Event.ListStreaming(ctx, opencode.EventListParams{})
for stream.Next() {
    event := stream.Current()
    switch event.Type {
    case "message.part.updated":
        // Extract text delta, send to TUI with agent identifier
        program.Send(AgentTextMsg{
            Agent: extractAgentName(event),
            Text:  event.Properties.Part.Text,
        })
    case "session.idle":
        program.Send(AgentIdleMsg{})
    }
}
```

---

## 5. Integration Test Suite

### Test Structure

```
internal/
└── integration/
    ├── suite_test.go        # Test setup/teardown
    ├── opencode_test.go     # OpenCode connection tests
    ├── tcp_test.go          # TCP server tests
    └── testdata/
        └── sample_buffer.json
```

### Test Cases

```go
// internal/integration/opencode_test.go

func TestOpenCodeConnection(t *testing.T) {
    // Requires: opencode serve running on localhost:4096
    if os.Getenv("INTEGRATION_TESTS") != "1" {
        t.Skip("Skipping integration tests")
    }

    client := opencode.NewClient(
        option.WithBaseURL("http://localhost:4096"),
    )

    // Test 1: Health check
    t.Run("HealthCheck", func(t *testing.T) {
        // GET /global/health
        // Assert: healthy = true
    })

    // Test 2: Session creation
    t.Run("CreateSession", func(t *testing.T) {
        session, err := client.Session.New(ctx, opencode.SessionNewParams{
            Title: opencode.F("Integration Test"),
        })
        require.NoError(t, err)
        require.NotEmpty(t, session.ID)

        // Cleanup
        defer client.Session.Delete(ctx, session.ID, opencode.SessionDeleteParams{})
    })

    // Test 3: Agent availability
    t.Run("AgentsAvailable", func(t *testing.T) {
        agents, err := client.Agent.List(ctx, opencode.AgentListParams{})
        require.NoError(t, err)

        agentNames := extractNames(agents)
        assert.Contains(t, agentNames, "code-reviewer")
        assert.Contains(t, agentNames, "bug-spotter")
    })

    // Test 4: Send message and receive response
    t.Run("AgentResponds", func(t *testing.T) {
        session, _ := client.Session.New(ctx, opencode.SessionNewParams{})
        defer client.Session.Delete(ctx, session.ID, opencode.SessionDeleteParams{})

        resp, err := client.Session.Prompt(ctx, session.ID, opencode.SessionPromptParams{
            Agent: opencode.F("code-reviewer"),
            Parts: []opencode.SessionPromptParamsPart{{
                Type: opencode.F(opencode.TextPartInputTypeText),
                Text: opencode.F("Review: func add(a, b int) int { return a + b }"),
            }},
        })
        require.NoError(t, err)
        require.NotEmpty(t, resp.Parts)
    })
}

func TestTCPServer(t *testing.T) {
    // Test 5: TCP connection acceptance
    t.Run("AcceptsConnection", func(t *testing.T) {
        server := server.New(":0") // Random port
        go server.Start()
        defer server.Stop()

        conn, err := net.Dial("tcp", server.Addr())
        require.NoError(t, err)
        conn.Close()
    })

    // Test 6: Message parsing
    t.Run("ParsesBufferEvent", func(t *testing.T) {
        // Send sample JSON, verify it's parsed correctly
    })
}
```

### Running Tests

```bash
# Start OpenCode server first
opencode serve --port 4096 &

# Run integration tests
INTEGRATION_TESTS=1 go test ./internal/integration/... -v

# Or via Makefile
make test-integration
```

---

## 6. Repository Structure

```
algopeeps/
├── cmd/
│   └── algopeeps/
│       └── main.go              # Entry point, starts TUI + TCP server
├── internal/
│   ├── tui/
│   │   ├── app.go               # Bubble Tea Model, Update, View
│   │   ├── styles.go            # Lipgloss styles
│   │   ├── components/
│   │   │   ├── agent_card.go    # Single agent output card
│   │   │   └── summary_bar.go   # Bottom summary panel
│   │   └── messages.go          # Bubble Tea Msg types
│   ├── server/
│   │   └── tcp.go               # TCP server for Neovim connections
│   ├── protocol/
│   │   └── types.go             # Shared JSON message structs
│   ├── opencode/
│   │   └── client.go            # OpenCode SDK wrapper
│   ├── integration/
│   │   ├── suite_test.go        # Integration test setup
│   │   ├── opencode_test.go     # OpenCode connection tests
│   │   └── tcp_test.go          # TCP server tests
│   └── config/
│       └── config.go            # Configuration loading
├── nvim/
│   └── lua/
│       └── algopeeps/
│           ├── init.lua         # Plugin entry point
│           ├── client.lua       # TCP client logic
│           └── debounce.lua     # Debounce utility
├── opencode.json                # OpenCode agent configuration
├── go.mod
├── go.sum
├── Makefile                     # build, run, test, install-plugin
└── README.md
```

### Makefile Targets

```makefile
.PHONY: build run dev test test-integration install-plugin

build:
	go build -o bin/algopeeps ./cmd/algopeeps

run: build
	./bin/algopeeps

dev:
	go run ./cmd/algopeeps --debug

test:
	go test ./... -v

test-integration:
	@echo "Ensure 'opencode serve' is running on port 4096"
	INTEGRATION_TESTS=1 go test ./internal/integration/... -v

install-plugin:
	mkdir -p ~/.config/nvim/lua
	ln -sf $(PWD)/nvim/lua/algopeeps ~/.config/nvim/lua/algopeeps
```

---

## 7. TUI Design Details

### Color Scheme (Lipgloss)

```go
var (
    // Agent card accents
    reviewerColor   = lipgloss.Color("#3B82F6")  // Blue
    bugSpotterColor = lipgloss.Color("#EF4444")  // Red

    // Borders
    borderColor = lipgloss.Color("#3F3F46")  // Zinc-700

    // Status indicators
    connectedColor = lipgloss.Color("#22C55E")  // Green
    errorColor     = lipgloss.Color("#EF4444")  // Red

    // Text
    dimText    = lipgloss.Color("#71717A")  // Zinc-500
    brightText = lipgloss.Color("#FAFAFA")  // Zinc-50
)
```

### Layout

```go
// Top: 80% for agents (split 50/50 horizontally)
// Bottom: 20% for summary
agentsHeight := height * 80 / 100
summaryHeight := height - agentsHeight

// Agent cards split horizontally
agentWidth := width / 2
```

### Components

- **Spinner**: `spinner.Dot` style during agent thinking
- **Viewport**: Scrollable content in each agent card
- **Summary Bar**: Single-line file info + recent changes description

---

## 8. Non-Goals for v0

| Non-Goal | Reason | Future Work |
|----------|--------|-------------|
| **Diff-based updates** | Adds complexity; full buffer is simpler | v1: Send only changed regions |
| **File editing by agents** | Safety first; read-only reactions | v1: Tool permissions + confirmation |
| **More than 2 agents** | Focus on proving the loop works | v1: Agent switcher, parallel agents |
| **Neovim inline reactions** | Requires bidirectional protocol | v2: Virtual text, line annotations |
| **Perfect reconnection** | Good enough UX for local dev | v1: Session persistence |
| **Multi-file context** | Single buffer focus for v0 | v1: Include related files |
| **Token usage optimization** | Accept higher costs for v0 | v1: Summarize history, sliding window |

---

## 9. Follow-ups After v0

### v0.1: Diff-Based Updates

- Send only changed lines with line numbers
- Reduce token usage by 80%+ for large files

### v0.2: Multiple Agents

- Add agent switcher UI (tab between more agents)
- Configure additional agents in `opencode.json`
- Parallel agent execution with priority

### v0.3: Neovim Inline Reactions

- **Virtual text annotations**: Agent observations appear inline next to relevant code
- **Line-specific reactions**: Bug warnings on specific lines (e.g., `Warning: Potential nil` on line 47)
- **Logical block annotations**: Highlight entire functions/blocks with suggestions
- **Accept/reject UI**: Keybindings to dismiss or act on inline suggestions
- **Back-channel protocol**: Extend TCP protocol for TUI -> Neovim messages

```
┌─────────────────────────────────────────────────────────────────┐
│  47 │  user := getUser(id)                                     │
│     │  ⚠️ Bug Spotter: user may be nil, add nil check          │ <-- Virtual text
│  48 │  return user.Name                                        │
│  49 │                                                          │
│  50 │  // TODO: implement validation                           │
│     │  💡 Reviewer: Consider extracting to separate function   │ <-- Line annotation
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Edge Cases

### Large Buffers (>100KB)

```go
const maxContentSize = 100 * 1024

func truncateContent(content string, cursorLine int) string {
    if len(content) <= maxContentSize {
        return content
    }
    // Extract 50 lines around cursor
    lines := strings.Split(content, "\n")
    start := max(0, cursorLine-25)
    end := min(len(lines), cursorLine+25)
    return fmt.Sprintf("[...truncated, showing lines %d-%d...]\n%s",
        start, end, strings.Join(lines[start:end], "\n"))
}
```

### Session Reset / Reconnection

```go
func (c *OpenCodeClient) ensureSession(ctx context.Context) error {
    if c.sessionID != "" {
        // Verify session still exists
        _, err := c.client.Session.Get(ctx, c.sessionID, opencode.SessionGetParams{})
        if err == nil {
            return nil
        }
    }
    // Create new session
    session, err := c.client.Session.New(ctx, opencode.SessionNewParams{
        Title: opencode.F("Algopeeps Council - " + time.Now().Format("2006-01-02")),
    })
    if err != nil {
        return err
    }
    c.sessionID = session.ID
    return nil
}
```

---

## 11. Extensibility Considerations

### Multi-IDE Support (Future)

The TCP protocol is IDE-agnostic. Future clients:

- **VS Code Extension**: TypeScript, same JSON protocol
- **Zed Extension**: Rust, same protocol
- **Helix/Kakoune**: Same Lua-style plugins

### Multi-Agent Architecture (Future)

```go
type AgentManager struct {
    agents map[string]*Agent  // code-reviewer, bug-spotter, ...
}

func (m *AgentManager) RouteEvent(event BufferEvent) {
    for _, agent := range m.agents {
        go agent.Process(event)
    }
}
```

---

## 12. Implementation Notes

### Neovim Plugin Key Code

```lua
-- nvim/lua/algopeeps/init.lua
local M = {}
local client = require('algopeeps.client')

M.setup = function(opts)
    opts = opts or {}
    M.config = {
        host = opts.host or '127.0.0.1',
        port = opts.port or 9999,
        debounce_ms = opts.debounce_ms or 5000,
    }
end

M.connect = function()
    client.connect(M.config.host, M.config.port)

    local group = vim.api.nvim_create_augroup('Algopeeps', { clear = true })

    vim.api.nvim_create_autocmd({'TextChanged', 'TextChangedI'}, {
        group = group,
        callback = function() client.schedule_update('text_changed') end,
    })

    vim.api.nvim_create_autocmd('BufWritePost', {
        group = group,
        callback = function() client.send_update('buffer_write') end,
    })
end

vim.api.nvim_create_user_command('AlgopeepsConnect', M.connect, {})
vim.api.nvim_create_user_command('AlgopeepsDisconnect', client.disconnect, {})

return M
```

### Go TCP Server Key Code

```go
// internal/server/tcp.go
func (s *Server) handleConnection(conn net.Conn, program *tea.Program) {
    defer conn.Close()
    reader := bufio.NewReader(conn)

    for {
        line, err := reader.ReadBytes('\n')
        if err != nil {
            return
        }

        var event protocol.BufferEvent
        if err := json.Unmarshal(line, &event); err != nil {
            continue
        }

        program.Send(BufferEventMsg{Event: event})
    }
}
```

### Bubble Tea Integration

```go
// internal/tui/app.go
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case BufferEventMsg:
        m.summary = buildSummary(msg.Event)
        // Send to both agents
        return m, tea.Batch(
            m.sendToAgent("code-reviewer", msg.Event),
            m.sendToAgent("bug-spotter", msg.Event),
        )

    case AgentTextMsg:
        m.agents[msg.Agent].output += msg.Text
        return m, nil

    case AgentIdleMsg:
        m.agents[msg.Agent].thinking = false
        return m, nil
    }
    return m, nil
}
```

---

## Summary

This plan delivers a working demo in ~14 focused steps:

1. **Simple**: 2-pane layout with 2 reactor agents + summary bar
2. **Tested**: Integration test suite verifies agent connections
3. **Observable**: See both agents react in real-time
4. **Hackable**: Clean Go code, Lua plugin, standard patterns
5. **Extensible**: Future support for inline Neovim reactions and more agents
