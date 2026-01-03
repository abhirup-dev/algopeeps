-- client.lua - TCP client for algopeeps

local debounce = require('algopeeps.debounce')

local M = {}

-- Internal state
local tcp = nil
local connected = false
local config = {}
local debounced_send = nil

--- Initialize the client with config
--- @param opts table Configuration options
function M.init(opts)
  config = opts or {}
  
  -- Create debounced send function
  if config.debounce_ms and config.debounce_ms > 0 then
    debounced_send = debounce.debounce(function(event_type)
      M.send_update(event_type)
    end, config.debounce_ms)
  end
end

--- Collect current buffer information
--- @return table Buffer info
local function collect_buffer_info()
  local buf = vim.api.nvim_get_current_buf()
  local cursor = vim.api.nvim_win_get_cursor(0)
  local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
  
  return {
    id = buf,
    name = vim.api.nvim_buf_get_name(buf),
    path = vim.fn.expand('%:p'),
    filetype = vim.bo[buf].filetype,
    cursor = {
      line = cursor[1],
      col = cursor[2]
    },
    line_count = vim.api.nvim_buf_line_count(buf),
    content = table.concat(lines, '\n')
  }
end

--- Connect to TCP server
--- @param host string Host address
--- @param port number Port number
function M.connect(host, port)
  if connected then
    vim.notify('Already connected to algopeeps', vim.log.levels.INFO)
    return
  end
  
  tcp = vim.uv.new_tcp()
  
  tcp:connect(host, port, function(err)
    if err then
      vim.schedule(function()
        vim.notify('Failed to connect to algopeeps: ' .. err, vim.log.levels.ERROR)
        tcp:close()
        tcp = nil
        connected = false
      end)
      return
    end
    
    vim.schedule(function()
      connected = true
      vim.notify('Connected to algopeeps at ' .. host .. ':' .. port, vim.log.levels.INFO)
      
      -- Send initial connection event
      M.send_update('connect')
    end)
  end)
end

--- Disconnect from server
function M.disconnect()
  if not tcp then
    vim.notify('Not connected to algopeeps', vim.log.levels.WARN)
    return
  end
  
  if connected then
    M.send_update('disconnect')
  end
  
  tcp:shutdown()
  tcp:close()
  tcp = nil
  connected = false
  
  vim.notify('Disconnected from algopeeps', vim.log.levels.INFO)
end

--- Send JSON data to server
--- @param data table Data to send
function M.send(data)
  if not connected or not tcp then
    return
  end
  
  local json = vim.json.encode(data)
  tcp:write(json .. '\n')
end

--- Send update immediately
--- @param event_type string Type of event
function M.send_update(event_type)
  if not connected then
    return
  end
  
  local buffer_info = collect_buffer_info()
  
  -- Format timestamp as ISO8601 to match Go's time.Time JSON serialization
  local timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
  
  M.send({
    type = "buffer_update",
    timestamp = timestamp,
    event = event_type,
    buffer = buffer_info
  })
end

--- Schedule debounced update
--- @param event_type string Type of event
function M.schedule_update(event_type)
  if debounced_send then
    debounced_send(event_type)
  else
    M.send_update(event_type)
  end
end

--- Check if connected
--- @return boolean
function M.is_connected()
  return connected
end

return M
