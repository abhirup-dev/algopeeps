# Agent Instructions - internal/tui

Bubble Tea terminal UI application displaying AI agent feedback.

## Development Commands

```bash
# Run tests for tui package
go test ./internal/tui/... -v

# Run with coverage
go test ./internal/tui/... -cover

# Run TUI directly
go run ./cmd/algopeeps
```

## Module Overview

Bubble Tea TUI that:
1. Displays agent feedback in real-time
2. Shows connection status (Neovim, OpenCode)
3. Manages buffer event display
4. Handles agent thinking states
5. Coordinates with TCP server and OpenCode client

## Key Components

### Core
- `app.go` - Main TUI model (`Model` struct)
- `messages.go` - Bubble Tea message types
- `styles.go` - Lipgloss styling definitions

### Components
- `components/agent_card.go` - Agent feedback display
- `components/summary_bar.go` - Buffer info footer

## Code Patterns

### Model Initialization
Use factory function returning value (not pointer):

```go
func NewModel() Model {
    client, _ := opencode.NewClient(opencode.DefaultConfig())
    return Model{
        agents:        make(map[string]string),
        agentThinking: make(map[string]bool),
        ocClient:      client,
    }
}
```

### Bubble Tea Interface
Implement `Init()`, `Update()`, `View()` methods:

```go
func (m Model) Init() tea.Cmd {
    // Return command to execute on startup
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    // Handle message, return updated model and optional command
}

func (m Model) View() string {
    // Return rendered string
}
```

### Message Pattern Matching
Use type assertion on `tea.Msg`:

```go
switch msg := msg.(type) {
case tea.KeyMsg:
    // Handle key press
case ConnectionStatusMsg:
    // Handle connection update
case BufferEventMsg:
    // Handle buffer event from TCP server
}
```

### Program Send for Async Events
Use `p.Send()` to inject messages from goroutines:

```go
func (m *Model) handleBufferEvent(msg BufferEventMsg) {
    go func() {
        // Async work (e.g., send to AI agents)
        m.ocClient.SendPrompt("code-reviewer", prompt)
    }()
}
```

## Agent State Management

Track agent output and thinking state:

```go
type Model struct {
    agents        map[string]string  // agent ID -> output text
    agentThinking map[string]bool   // agent ID -> isThinking
}
```

Update agent state as events stream in:

```go
case opencode.AgentTextMsg:
    m.agents[msg.Agent] += msg.Text
    m.agentThinking[msg.Agent] = false
```

## Styling

All styles defined in `styles.go` using Lipgloss:

```go
var titleStyle = lipgloss.NewStyle().
    Foreground(lipgloss.Color("#FFFFFF")).
    Bold(true).
    MarginBottom(1)
```

Use compositional rendering:

```go
return lipgloss.JoinVertical(
    lipgloss.Left,
    header,
    agentsRow,
    statusBar,
)
```

## Buffer Content Truncation

Truncate large buffers (>100KB) to context around cursor:

```go
const maxSize = 100 * 1024
if len(content) > maxSize {
    content = m.truncateAroundCursor(content, cursorLine, 50)
}
```

## Keyboard Controls

- `q` or `Ctrl+C` - Quit application

## Integration Points

- **internal/server** - Receives `BufferEventMsg` via program.Send()
- **internal/opencode** - Uses Client for agent communication
- **internal/tui/components** - Modular UI components
- **cmd/algopeeps** - Model created and program started in main()

## Testing TUI

To test TUI without running full app:
1. Create test `tea.Program` with `tea.WithInput(io.Reader)`
2. Send messages via `p.Send()`
3. Assert on model state after `p.Run()`

## Performance Considerations

- Use `strings.Builder` for repeated string concatenation
- Truncate large buffer content before sending to agents
- Use goroutines for non-blocking agent prompts
- Reuse style instances (Lipgloss styles are immutable)
