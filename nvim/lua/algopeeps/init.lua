-- init.lua - Algopeeps Neovim plugin entry point

local client = require('algopeeps.client')

local M = {}

-- Default configuration
local default_config = {
  host = '127.0.0.1',
  port = 9999,
  debounce_ms = 5000,
}

local config = {}
local autocmd_group = nil

--- Setup the plugin with user configuration
--- @param opts table|nil User configuration options
function M.setup(opts)
  config = vim.tbl_deep_extend('force', default_config, opts or {})
  client.init(config)
  
  -- Create autocmd group
  autocmd_group = vim.api.nvim_create_augroup('Algopeeps', { clear = true })
end

--- Setup autocmds for tracking buffer events
local function setup_autocmds()
  if not autocmd_group then
    autocmd_group = vim.api.nvim_create_augroup('Algopeeps', { clear = true })
  end
  
  -- Track buffer changes (debounced)
  vim.api.nvim_create_autocmd({ 'TextChanged', 'TextChangedI' }, {
    group = autocmd_group,
    callback = function()
      client.schedule_update('buffer_changed')
    end,
  })
  
  -- Track cursor movement (debounced)
  vim.api.nvim_create_autocmd('CursorMoved', {
    group = autocmd_group,
    callback = function()
      client.schedule_update('cursor_moved')
    end,
  })
  
  -- Track buffer writes (immediate)
  vim.api.nvim_create_autocmd('BufWritePost', {
    group = autocmd_group,
    callback = function()
      client.send_update('buffer_write')
    end,
  })
  
  -- Track buffer switches (immediate)
  vim.api.nvim_create_autocmd('BufEnter', {
    group = autocmd_group,
    callback = function()
      client.send_update('buffer_enter')
    end,
  })
  
  -- Track buffer leaves (immediate)
  vim.api.nvim_create_autocmd('BufLeave', {
    group = autocmd_group,
    callback = function()
      client.send_update('buffer_leave')
    end,
  })
end

--- Cleanup autocmds
local function cleanup_autocmds()
  if autocmd_group then
    vim.api.nvim_clear_autocmds({ group = autocmd_group })
  end
end

--- Connect to algopeeps server
function M.connect()
  if client.is_connected() then
    vim.notify('Already connected to algopeeps', vim.log.levels.INFO)
    return
  end
  
  client.connect(config.host, config.port)
  setup_autocmds()
end

--- Disconnect from algopeeps server
function M.disconnect()
  cleanup_autocmds()
  client.disconnect()
end

--- Create user commands
local function create_commands()
  vim.api.nvim_create_user_command('AlgopeepsConnect', function()
    M.connect()
  end, {
    desc = 'Connect to algopeeps server'
  })
  
  vim.api.nvim_create_user_command('AlgopeepsDisconnect', function()
    M.disconnect()
  end, {
    desc = 'Disconnect from algopeeps server'
  })
end

-- Initialize commands when plugin loads
create_commands()

return M
