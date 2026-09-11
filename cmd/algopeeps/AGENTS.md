# Agent Instructions - cmd/algopeeps

This is the main entry point for the algopeeps application.

## Development Commands

```bash
# Build main binary
cd /Users/abhirupdas/Codes/Personal/algopeeps && make build

# Run directly from source
go run ./cmd/algopeeps

# Run with specific flags
go run ./cmd/algopeeps --help
```

## Module Overview

This module initializes and coordinates:
1. **TCP Server** - Listens for Neovim connections on port 9999
2. **TUI Application** - Bubble Tea program displaying agent feedback
3. **SSE Subscription** - Real-time updates from OpenCode agents

## Key Components

- `main()` - Entry point, orchestrates all subsystems
- Server setup via `server.New(":9999")`
- TUI setup via `tui.NewModel()`
- Program linking via `tcpServer.SetProgram(p)`

## Code Patterns

### Error Handling
Fatal errors use `fmt.Fprintf(os.Stderr, ...)` followed by `os.Exit(1)`:

```go
if err := tcpServer.Start(); err != nil {
    fmt.Fprintf(os.Stderr, "Error starting TCP server: %v\n", err)
    os.Exit(1)
}
```

### Initialization Order
Critical: Start TCP server BEFORE running TUI program:

```go
tcpServer.Start()
model.StartSSESubscription(p)
p.Run()  // Blocking - must be last
```

## Integration Points

- **internal/server** - TCP server for Neovim connections
- **internal/tui** - Bubble Tea TUI application
- Uses `tea.Program` for message passing between components
