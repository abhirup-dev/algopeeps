# Agent Instructions - nvim/lua/algopeeps

Neovim plugin that captures buffer events and sends them to algopeeps TCP server.

## Development Commands

```bash
# Install plugin symlink (development)
make install-plugin

# Or manually
mkdir -p ~/.config/nvim/lua
ln -sf $(PWD)/nvim/lua/algopeeps ~/.config/nvim/lua/algopeeps

# Test Lua syntax
luac nvim/lua/algopeeps/init.lua
```

## Module Structure

```
nvim/lua/algopeeps/
├── init.lua      # Plugin entry point and commands
├── client.lua     # TCP client implementation
└── debounce.lua   # Debounce utility
```

## Key Components

### init.lua
- Plugin setup and configuration
- Autocommand registration for buffer events
- User commands (`:AlgopeepsConnect`, `:AlgopeepsDisconnect`)

### client.lua
- TCP connection management (using libuv)
- Buffer information collection
- JSON serialization and transmission

### debounce.lua
- Generic debounce utility for delayed function execution

## Code Patterns

### Module Pattern
Use local module table with public API:

```lua
local M = {}

function M.setup(opts)
  -- Setup code
end

function M.connect()
  -- Connect code
end

return M
```

### Configuration Merge
Use `vim.tbl_deep_extend('force', ...)` to merge configs:

```lua
local default_config = {
  host = '127.0.0.1',
  port = 9999,
  debounce_ms = 5000,
}

config = vim.tbl_deep_extend('force', default_config, opts or {})
```

### Autocommand Pattern
Create dedicated autocommand group for cleanup:

```lua
autocmd_group = vim.api.nvim_create_augroup('Algopeeps', { clear = true })

vim.api.nvim_create_autocmd({ 'TextChanged', 'TextChangedI' }, {
  group = autocmd_group,
  callback = function()
    client.schedule_update('buffer_changed')
  end,
})
```

### Lua TCP with libuv
Use `vim.uv.new_tcp()` for async networking:

```lua
tcp = vim.uv.new_tcp()
tcp:connect(host, port, function(err)
  if err then
    vim.schedule(function()
      vim.notify('Connection failed: ' .. err, vim.log.levels.ERROR)
    end)
    return
  end
  
  connected = true
end)
```

### JSON Serialization
Use `vim.json.encode()` for compact output:

```lua
local json = vim.json.encode(data)
tcp:write(json .. '\n')  -- Newline-delimited
```

### Debouncing
Debounce debounced events (text changes, cursor movement):

```lua
local debounced_send = debounce.debounce(function(event_type)
  M.send_update(event_type)
end, config.debounce_ms)

-- Trigger debounced
client.schedule_update('buffer_changed')

-- Immediate events (save, switch)
client.send_update('buffer_write')
```

### Buffer Info Collection
Use Neovim API for buffer state:

```lua
local function collect_buffer_info()
  local buf = vim.api.nvim_get_current_buf()
  local cursor = vim.api.nvim_win_get_cursor(0)
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  
  return {
    id = buf,
    name = vim.api.nvim_buf_get_name(buf),
    filetype = vim.bo[buf].filetype,
    cursor = { line = cursor[1], col = cursor[2] },
    line_count = vim.api.nvim_buf_line_count(buf),
    content = table.concat(lines, '\n')
  }
end
```

## Timestamp Format

Use UTC ISO 8601 to match Go's `time.Time` JSON serialization:

```lua
local timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
```

## User Commands

- `:AlgopeepsConnect` - Connect to algopeeps server
- `:AlgopeepsDisconnect` - Disconnect and stop sending events

## Error Handling

Use `vim.schedule()` for UI updates from async callbacks:

```lua
tcp:connect(host, port, function(err)
  vim.schedule(function()
    if err then
      vim.notify('Error: ' .. err, vim.log.levels.ERROR)
    else
      vim.notify('Connected!', vim.log.levels.INFO)
    end
  end)
end)
```

## Cleanup

Always cleanup resources on disconnect:

```lua
function M.disconnect()
  if connected then
    M.send_update('disconnect')
  end
  
  tcp:shutdown()
  tcp:close()
  tcp = nil
  connected = false
end
```

## Integration Points

- **internal/server** - Sends JSON events to TCP port 9999
- **internal/tui** - Receives events and displays in TUI
- Uses Neovim's built-in libuv for async networking

## Testing

To test locally:
1. Start algopeeps: `./bin/algopeeps`
2. Open Neovim: `nvim somefile.go`
3. Connect: `:AlgopeepsConnect`
4. Edit buffer and verify updates in TUI
5. Disconnect: `:AlgopeepsDisconnect`
