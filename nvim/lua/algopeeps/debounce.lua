-- debounce.lua - Simple debounce utility

local M = {}

--- Creates a debounced version of a function
--- @param fn function Function to debounce
--- @param ms number Milliseconds to wait
--- @return function Debounced function
function M.debounce(fn, ms)
  local timer = nil
  
  return function(...)
    local args = {...}
    
    -- Cancel pending timer if exists
    if timer then
      -- vim.defer_fn returns a timer that can only be stopped, not closed
      pcall(vim.fn.timer_stop, timer)
    end
    
    timer = vim.defer_fn(function()
      fn(unpack(args))
      timer = nil
    end, ms)
  end
end

return M
