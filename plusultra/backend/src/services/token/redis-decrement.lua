-- Redis Lua script for atomic token consumption with high concurrency
-- KEYS[1]: token pool key (e.g., "token_pool:user:123:2024-01")
-- ARGV[1]: tokens to consume
-- ARGV[2]: owner_id
-- ARGV[3]: owner_type
-- ARGV[4]: current timestamp

local key = KEYS[1]
local requested_tokens = tonumber(ARGV[1])
local owner_id = ARGV[2]
local owner_type = ARGV[3]
local timestamp = ARGV[4]

-- Get current token pool state
local total_tokens = tonumber(redis.call('HGET', key, 'total_tokens') or '0')
local used_tokens = tonumber(redis.call('HGET', key, 'used_tokens') or '0')
local period_start = redis.call('HGET', key, 'period_start')
local subscription_id = redis.call('HGET', key, 'subscription_id')

-- Check if we have sufficient tokens
if (used_tokens + requested_tokens) > total_tokens then
  -- Insufficient tokens - return failure
  return {
    0, -- success flag
    used_tokens,
    total_tokens,
    'insufficient_tokens'
  }
end

-- Atomically increment used tokens
local new_used = used_tokens + requested_tokens
redis.call('HSET', key, 'used_tokens', new_used)

-- Add to usage audit (as a sorted set for time-based queries)
local usage_key = 'token_usage:' .. owner_id .. ':' .. owner_type
redis.call('ZADD', usage_key, timestamp, requested_tokens .. ':' .. timestamp)

-- Return success with updated values
return {
  1, -- success flag
  new_used,
  total_tokens,
  period_start,
  subscription_id
}
