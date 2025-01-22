import Redis from 'ioredis';
import { logger } from '../utils/logger';

export async function setupRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on('connect', () => {
    logger.info('Redis connection established successfully');
  });

  redis.on('error', (error) => {
    logger.error('Redis connection error:', error);
  });

  // Test connection
  try {
    await redis.ping();
    return redis;
  } catch (error) {
    logger.error('Unable to connect to Redis:', error);
    throw error;
  }
}

export { Redis }; 