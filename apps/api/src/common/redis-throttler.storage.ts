import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

/**
 * Shared rate-limit counters in Redis, so limits hold across several API instances.
 * One atomic Lua script per hit: increments the window counter and applies a block once the
 * limit is exceeded.
 */
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if blocked < 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return { hits, ttl, blocked }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis, private readonly prefix = 'rl:') {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const base = `${this.prefix}${throttlerName}:${key}`;
    const [hits, ttlMs, blockedMs] = (await this.redis.eval(SCRIPT, 2, base, `${base}:blocked`, ttl, limit, blockDuration || ttl)) as [number, number, number];
    const isBlocked = blockedMs > 0;
    return {
      totalHits: hits,
      timeToExpire: Math.ceil(Math.max(ttlMs, 0) / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockedMs / 1000) : 0,
    };
  }
}
