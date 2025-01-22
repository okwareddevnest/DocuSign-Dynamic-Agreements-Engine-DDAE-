import axios from 'axios';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

export class DataSyncService {
  private redis: Redis;
  private alphaVantageKey: string;
  private losantApiKey: string;

  constructor(redis: Redis) {
    this.redis = redis;
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY || '';
    this.losantApiKey = process.env.LOSANT_API_KEY || '';
  }

  async syncMarketData(symbol: string): Promise<Record<string, any>> {
    const cacheKey = `market:${symbol}`;
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fetch from Alpha Vantage
      const response = await axios.get(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageKey}`
      );

      const data = response.data['Global Quote'];
      if (!data) {
        throw new Error('Invalid market data response');
      }

      // Cache for 5 minutes
      await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 300);

      return data;
    } catch (error) {
      logger.error('Error syncing market data:', error);
      throw error;
    }
  }

  async syncIoTData(deviceId: string): Promise<Record<string, any>> {
    const cacheKey = `iot:${deviceId}`;
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fetch from Losant
      const response = await axios.get(
        `https://api.losant.com/applications/${deviceId}/state`,
        {
          headers: {
            'Authorization': `Bearer ${this.losantApiKey}`,
          },
        }
      );

      const data = response.data;
      if (!data) {
        throw new Error('Invalid IoT data response');
      }

      // Cache for 1 minute
      await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 60);

      return data;
    } catch (error) {
      logger.error('Error syncing IoT data:', error);
      // Return last known state from cache if available
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      throw error;
    }
  }

  async syncWeatherData(location: string): Promise<Record<string, any>> {
    const cacheKey = `weather:${location}`;
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // TODO: Implement weather API integration
      const mockData = {
        temperature: 25,
        humidity: 60,
        conditions: 'sunny',
        timestamp: new Date().toISOString(),
      };

      // Cache for 30 minutes
      await this.redis.set(cacheKey, JSON.stringify(mockData), 'EX', 1800);

      return mockData;
    } catch (error) {
      logger.error('Error syncing weather data:', error);
      throw error;
    }
  }

  // Helper method to get data based on type
  async getData(type: 'price' | 'iot' | 'weather', source: string): Promise<any> {
    switch (type) {
      case 'price':
        return this.syncMarketData(source);
      case 'iot':
        return this.syncIoTData(source);
      case 'weather':
        return this.syncWeatherData(source);
      default:
        throw new Error(`Unsupported data type: ${type}`);
    }
  }
} 