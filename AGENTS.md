# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Development Commands

### Build & Run
```bash
make build              # Build binary to bin/algopeeps
make run                # Build and run
make dev                # Run with go run (dev mode)
make fmt                # Format code with go fmt
make lint               # Run golangci-lint
make tidy               # Tidy go.mod dependencies
make clean              # Clean build artifacts
```

### Testing
```bash
make test               # Run all unit tests (go test ./... -v)
go test ./... -v        # Same as make test
go test ./internal/...  # Test specific package

# Integration tests (requires opencode serve running)
make test-integration    # Run integration tests
INTEGRATION_TESTS=1 go test ./internal/integration/... -v

# Run single test
go test -v ./internal/integration -run TestTCPServer_AcceptsConnection

# Run benchmarks
go test ./... -bench=. -benchmem
```

### Installing Neovim Plugin
```bash
make install-plugin      # Symlink nvim/ to ~/.config/nvim/lua/algopeeps
```

## Code Style Guidelines

### Import Organization
- Standard library imports first (blank line separator)
- Third-party imports second (blank line separator)
- Use descriptive aliases for readability (e.g., `tea` for `bubbletea`)

```go
import (
    "fmt"
    "os"

    "github.com/abhirupda/algopeeps/internal/server"
    tea "github.com/charmbracelet/bubbletea"
)
```

### Error Handling
- Always check errors immediately with `if err != nil`
- Wrap errors with context using `fmt.Errorf("context: %w", err)`
- Never ignore errors (use `_` only if intentionally ignoring, with comment)

```go
if err != nil {
    return fmt.Errorf("failed to start server: %w", err)
}
```

### Naming Conventions
- **Packages**: Short, singular, lowercase (`server`, `protocol`, `tui`)
- **Structs/Types**: Exported = `PascalCase`, unexported = `camelCase`
- **Receivers**: Short, 1-letter abbreviations (`m` for `Model`, `s` for `Server`)
- **Variables**: `camelCase` for local, `PascalCase` for exported constants
- **Factory functions**: `NewTypeName()` returning `*TypeName`

```go
func NewServer(addr string) *Server { ... }
func (s *Server) Start() error { ... }
```

### Formatting
- Use `gofmt` (tabs for indentation, no trailing whitespace)
- Group related constants/types in `const (...)` or `type (...)` blocks
- 80-100 char line length preference (not strict)
- One struct tag per line if multiple tags

```go
type BufferEvent struct {
    Type      MessageType `json:"type"`
    Timestamp time.Time   `json:"timestamp"`
    Event     EventType   `json:"event"`
    Buffer    Buffer      `json:"buffer"`
}
```

### Comments
- Exported symbols MUST have doc comments starting with symbol name
- Package comments at top of file explain purpose
- Inline comments for non-obvious logic only
- Use `// TODO:` for future work, `// FIXME:` for known issues

```go
// Server handles TCP connections from Neovim
type Server struct { ... }

// New creates a new TCP server
func New(addr string) *Server { ... }
```

### Struct & Interface Patterns
- Prefer factory functions `NewType()` returning `*Type`
- Use struct tags for JSON/marshaling
- Minimal interface usage (mainly external `tea.Model`)
- Composition over inheritance

```go
type Config struct {
    BaseURL string
}

func DefaultConfig() Config {
    return Config{BaseURL: "http://localhost:4096"}
}
```

### Logging
- Use `fmt.Fprintf(os.Stderr, ...)` for fatal errors in main()
- Minimal logging elsewhere (pending future implementation)
- Use `t.Logf()` in tests for debugging

```go
if err := tcpServer.Start(); err != nil {
    fmt.Fprintf(os.Stderr, "Error starting TCP server: %v\n", err)
    os.Exit(1)
}
```

## Testing Guidelines

### Test Organization
- Unit tests: `*_test.go` alongside source files
- Integration tests: `internal/integration/` directory
- Test data: `testdata/` directory alongside tests

### Integration Tests
- Gate with `INTEGRATION_TESTS=1` environment variable
- Use `skipIfNotIntegration(t)` helper for conditional skipping
- Requires external dependencies running (e.g., `opencode serve`)

```go
func skipIfNotIntegration(t *testing.T) {
    t.Helper()
    if os.Getenv("INTEGRATION_TESTS") != "1" {
        t.Skip("Skipping integration test. Set INTEGRATION_TESTS=1 to run")
    }
}
```

### Test Helpers
- Use `t.Helper()` in helper functions for proper line reporting
- Register cleanup with `t.Cleanup(func() { ... })`
- Use descriptive names for test helpers

```go
func setupTestServer(t *testing.T) (*server.Server, string) {
    t.Helper()
    srv := server.New("127.0.0.1:0")
    err := srv.Start()
    if err != nil {
        t.Fatalf("Failed to start test server: %v", err)
    }
    t.Cleanup(func() { srv.Stop() })
    return srv, srv.Addr()
}
```

### Test Naming
- Use `Test<FunctionName>_<Scenario>` format
- Descriptive, self-documenting test names
- Separate concerns with underscore

```go
func TestTCPServer_AcceptsConnection(t *testing.T) { ... }
func TestBufferEventValidation(t *testing.T) { ... }
```

## Project Structure

```
algopeeps/
├── cmd/algopeeps/      # Main entry point
├── internal/
│   ├── config/          # Configuration management
│   ├── integration/     # Integration tests (INTEGRATION_TESTS=1)
│   ├── opencode/       # OpenCode SDK client
│   ├── protocol/       # TCP protocol types and validation
│   ├── server/         # TCP server implementation
│   └── tui/           # Bubble Tea TUI (app.go, components/, styles.go)
└── nvim/lua/algopeeps/ # Neovim plugin (init.lua, client.lua, debounce.lua)
```

## Session Completion Checklist

**When ending work session**, run:

```bash
# 1. Check changes
git status

# 2. Stage and commit code
git add <files>
git commit -m "message"

# 3. Sync beads changes
bd sync

# 4. Push to remote
git push

# 5. Verify clean state
git status  # MUST show "up to date with origin"
```

**CRITICAL:** Work is NOT complete until `git push` succeeds.

<!-- end-bv-agent-instructions -->
