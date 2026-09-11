# Agent Instructions - internal/server

TCP server for Neovim connections with Bubble Tea integration.

## Development Commands

```bash
# Run tests for server package
go test ./internal/server/... -v

# Run with coverage
go test ./internal/server/... -cover

# Test with race detector
go test ./internal/server/... -race
```

## Module Overview

TCP server that:
1. Listens for Neovim connections on configurable port
2. Accepts multiple concurrent connections
3. Parses JSON buffer events
4. Forwards events to TUI via Bubble Tea program
5. Manages connection lifecycle

## Key Components

- `Server` - Main server struct with listener, program, and client list
- `New(addr string)` - Factory function creating server
- `Start() / Stop()` - Lifecycle management
- `acceptLoop()` - Goroutine handling incoming connections
- `handleConnection()` - Per-connection message processing

## Code Patterns

### Factory Function
Use `New()` returning pointer:

```go
func New(addr string) *Server {
    return &Server{addr: addr}
}
```

### Program Injection
Set Bubble Tea program before starting:

```go
srv := server.New(":9999")
p := tea.NewProgram(model)
srv.SetProgram(p)  // Critical: inject before Start()
srv.Start()
```

### Goroutine Lifecycle
Accept loop runs in separate goroutine:

```go
func (s *Server) Start() error {
    s.listener, _ = net.Listen("tcp", s.addr)
    s.running = true
    go s.acceptLoop()  // Non-blocking
    return nil
}
```

### Connection Management
Use mutex for thread-safe client list:

```go
func (s *Server) handleConnection(conn net.Conn) {
    defer func() {
        conn.Close()
        s.removeClient(conn)  // Thread-safe
    }()
    // Process messages...
}
```

## Error Handling

- Wrap errors with context: `fmt.Errorf("failed to start server: %w", err)`
- Log errors but continue in goroutines (don't panic)
- Use `defer` for cleanup

## Message Parsing

Buffer events are newline-delimited JSON:

```go
reader := bufio.NewReader(conn)
for {
    line, err := reader.ReadBytes('\n')
    if err != nil {
        return  // Connection closed
    }
    
    var event protocol.BufferEvent
    json.Unmarshal(line, &event)
    
    s.program.Send(tui.BufferEventMsg{...})
}
```

## Connection Tracking

Server maintains list of active connections for:
- Connection count monitoring
- Future broadcast capability
- Graceful shutdown

## Graceful Shutdown

```go
func (s *Server) Stop() error {
    s.running = false
    if s.listener != nil {
        s.listener.Close()
    }
    return nil
}
```

## Integration Points

- **internal/protocol** - Parses `BufferEvent` messages
- **internal/tui** - Sends `BufferEventMsg` to TUI program
- **cmd/algopeeps** - Initialized in main.go with program injection
- **internal/integration** - Tested with real TCP connections

## Port Configuration

Default port is `:9999` for Neovim connections. Use `:0` for dynamic port assignment (testing only).
