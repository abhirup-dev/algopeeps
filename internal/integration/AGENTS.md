# Agent Instructions - internal/integration

Integration tests for algopeeps TCP server and protocol handling.

## Development Commands

```bash
# Run integration tests (requires opencode serve running)
INTEGRATION_TESTS=1 go test ./internal/integration/... -v

# Run single test
INTEGRATION_TESTS=1 go test ./internal/integration/... -run TestTCPServer_AcceptsConnection -v

# Run benchmarks
INTEGRATION_TESTS=1 go test ./internal/integration/... -bench=. -benchmem

# Run with race detector
INTEGRATION_TESTS=1 go test ./internal/integration/... -race
```

## Prerequisites

Integration tests require `opencode serve` to be running on port 4096:

```bash
# Terminal 1
opencode serve --config opencode.json

# Terminal 2
INTEGRATION_TESTS=1 go test ./internal/integration/... -v
```

## Test Organization

### Test Files
- `suite_test.go` - Shared helpers and test utilities
- `tcp_test.go` - TCP server and protocol tests

### Testdata
- `testdata/sample_buffer.json` - Example Neovim buffer event payload

## Test Patterns

### Integration Test Gating
Always use `skipIfNotIntegration(t)` at test start:

```go
func TestSomeFeature(t *testing.T) {
    skipIfNotIntegration(t)
    // Test code...
}
```

### Server Setup Pattern
Use `setupTestServer(t)` for automatic cleanup:

```go
func TestConnection(t *testing.T) {
    skipIfNotIntegration(t)
    
    srv, addr := setupTestServer(t)
    // srv is started, addr has actual port
    // t.Cleanup handles automatic shutdown
    
    conn, _ := dialTCP(addr)
    // Test with real TCP connection
}
```

### File-Driven Test Data
Load complex payloads from testdata instead of inline structs:

```go
samplePath := filepath.Join("testdata", "sample_buffer.json")
sampleData, _ := os.ReadFile(samplePath)
conn.Write(sampleData)
```

## Test Helpers

### `skipIfNotIntegration(t)`
Gates test execution to `INTEGRATION_TESTS=1` environment variable.

### `setupTestServer(t)`
Creates a TCP server on dynamic port (`127.0.0.1:0`), starts it, and registers cleanup.

**Returns:** `(*server.Server, string)` - server instance and actual address

### `dialTCP(addr)`
Helper to establish TCP connection with 2s timeout.

### `waitForServer(addr, timeout)`
Poll-based server readiness check for concurrent test scenarios.

## Testing Scenarios

- Connection acceptance and cleanup
- Buffer event JSON parsing
- Multiple concurrent connections
- Invalid JSON handling
- Connection cleanup after errors
- Performance benchmarks for protocol parsing

## Integration Points

- **internal/server** - Tests real TCP server behavior
- **internal/protocol** - Validates JSON protocol structure
- **testdata/** - External test payloads for complex scenarios
