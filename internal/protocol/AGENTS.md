# Agent Instructions - internal/protocol

TCP protocol types and validation for Neovim communication.

## Development Commands

```bash
# Run tests for protocol package
go test ./internal/protocol/... -v

# Run with coverage
go test ./internal/protocol/... -cover

# Run benchmarks
go test ./internal/protocol/... -bench=. -benchmem
```

## Module Overview

Defines the JSON protocol for communication between Neovim plugin and TCP server.

## Key Types

### EventType
Neovim buffer event types:
- `EventTextChanged` - Text or cursor changed (debounced)
- `EventBufferWrite` - File saved (immediate)
- `EventBufferEnter` - Buffer switched to (immediate)

### MessageType
Protocol message types:
- `MessageBufferUpdate` - Buffer content update
- `MessagePing` - Keep-alive (not yet used)
- `MessageDisconnect` - Client disconnect (not yet used)

### Buffer
Represents Neovim buffer state with JSON tags for serialization.

### BufferEvent
Top-level message container with type, timestamp, event type, and buffer data.

## Code Patterns

### Constants Grouping
Use `const (...)` blocks for related constants:

```go
const (
    EventTextChanged EventType = "text_changed"
    EventBufferWrite EventType = "buffer_write"
    EventBufferEnter EventType = "buffer_enter"
)
```

### Struct Tags
All serializable fields have `json:` tags:

```go
type Cursor struct {
    Line int `json:"line"`
    Col  int `json:"col"`
}
```

### Validation Pattern
Implement `Validate()` method on event types:

```go
func (e *BufferEvent) Validate() error {
    if e.Buffer.Name == "" {
        return errors.New("buffer name required")
    }
    return nil
}
```

## JSON Protocol Format

Neovim sends buffer updates as newline-delimited JSON:

```json
{
  "type": "buffer_update",
  "timestamp": "2025-01-04T12:00:00Z",
  "event": "text_changed",
  "buffer": {
    "id": 1,
    "name": "main.go",
    "path": "/path/to/main.go",
    "filetype": "go",
    "cursor": {"line": 42, "col": 10},
    "line_count": 100,
    "content": "package main\n..."
  }
}
```

## Content Truncation

Buffer content is truncated at 100KB with `[...truncated...]` suffix:

```go
func (b *Buffer) TruncateContent(maxSize int) string {
    if len(b.Content) <= maxSize {
        return b.Content
    }
    return b.Content[:maxSize] + "\n[...truncated...]"
}
```

## Timestamp Format

Use ISO 8601 format (UTC) for timestamps:
- Go: `time.Now()` (serializes as RFC3339)
- Lua: `os.date("!%Y-%m-%dT%H:%M:%SZ")`

## Integration Points

- **internal/server** - Deserializes incoming TCP messages
- **internal/tui** - Uses types for internal message passing
- **nvim/lua/algopeeps** - Serializes buffer events (Neovim plugin)
- **internal/integration/testdata** - Sample buffer event for testing
