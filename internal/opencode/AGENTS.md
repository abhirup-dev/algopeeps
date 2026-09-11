# Agent Instructions - internal/opencode

OpenCode SDK client wrapper for AI agent communication.

## Development Commands

```bash
# Run tests for opencode package
go test ./internal/opencode/... -v

# Run with coverage
go test ./internal/opencode/... -cover
```

## Module Overview

Wraps the OpenCode SDK to provide:
- Session management with retry logic
- Prompt sending to specific agents
- Server-Sent Events (SSE) streaming
- Agent text and idle event handling

## Key Components

- `Client` - Main client struct wrapping OpenCode SDK
- `Config` - Configuration for OpenCode server endpoint
- Message types: `AgentTextMsg`, `AgentIdleMsg`

## Code Patterns

### Factory Pattern
Always use `NewClient(cfg Config)` with validation:

```go
client, err := opencode.NewClient(opencode.DefaultConfig())
if err != nil {
    // Handle error
}
```

### Session Management with Retry
`EnsureSession()` implements automatic retry with exponential backoff:

```go
const maxRetries = 3
const retryDelay = time.Second

for i := 0; i < maxRetries; i++ {
    session, err := c.sdk.Session.New(...)
    if err == nil {
        return nil
    }
    time.Sleep(retryDelay)
}
```

### Context Management
Client maintains internal context for cancellation:

```go
type Client struct {
    ctx    context.Context
    cancel context.CancelFunc
}
```

Call `c.Close()` to cancel all pending operations.

### Message Injection
Use `program.Send()` for Bubble Tea message passing:

```go
program.Send(AgentTextMsg{
    Agent: "code-reviewer",
    Text:  partEvent.Properties.Delta,
})
```

## Configuration

Default configuration points to local OpenCode server:

```go
func DefaultConfig() Config {
    return Config{
        BaseURL: "http://localhost:4096",
    }
}
```

## Agent IDs

The client expects these agent IDs to exist in OpenCode config:
- `code-reviewer`
- `bug-spotter`

## Error Handling

- Wrap SDK errors with context: `fmt.Errorf("failed to send prompt: %w", err)`
- Return errors immediately for blocking operations
- Log but continue for non-blocking streaming errors

## Integration Points

- **internal/tui** - Sends Bubble Tea messages to TUI
- **cmd/algopeeps** - Initialized in main.go with TUI program
- Depends on: `github.com/sst/opencode-sdk-go`
