# Agent Instructions - internal/config

Configuration management module for algopeeps.

## Current State

This module is a placeholder for future configuration functionality.

## Development Commands

```bash
# Run tests for config package
go test ./internal/config/... -v

# Run with coverage
go test ./internal/config/... -cover
```

## Planned Functionality

This module will handle:
- Application configuration loading (file-based, env vars)
- Validation of configuration values
- Default configuration values
- Runtime configuration updates

## Integration Points

- **cmd/algopeeps** - Will load config on startup
- **internal/server** - Server address/port configuration
- **internal/opencode** - OpenCode API endpoint configuration
- **internal/tui** - UI/behavior configuration (colors, themes)

## Implementation Guidelines

When implementing this module:

1. Use struct-based configuration with JSON tags
2. Provide `DefaultConfig()` function returning valid defaults
3. Support environment variable overrides
4. Implement `Validate()` method returning error
5. Keep configuration simple - avoid over-engineering

## Example Pattern

```go
type Config struct {
    ServerAddr string `json:"server_addr"`
    OpenCodeURL string `json:"opencode_url"`
}

func DefaultConfig() Config {
    return Config{
        ServerAddr: ":9999",
        OpenCodeURL: "http://localhost:4096",
    }
}

func (c *Config) Validate() error {
    if c.ServerAddr == "" {
        return errors.New("server_addr is required")
    }
    return nil
}
```
