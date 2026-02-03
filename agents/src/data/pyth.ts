/**
 * Pyth Oracle Integration
 * Fetches real-time price data for Mo (momentum) agent
 */

import { PYTH_FEED_IDS } from '../core/config.js';

export interface PythPrice {
  feedId: string;
  price: number;
  confidence: number;
  publishTime: number;
  emaPrice: number;
}

export interface PriceUpdate {
  token: string;
  price: number;
  priceChange1h: number;
  priceChange24h: number;
  confidence: number;
  timestamp: number;
}

export class PythClient {
  private endpoint: string;
  private priceCache: Map<string, PythPrice[]> = new Map();

  constructor(endpoint: string = 'https://hermes.pyth.network') {
    this.endpoint = endpoint;
  }

  /**
   * Fetch latest price for a feed
   */
  async getPrice(feedId: string): Promise<PythPrice | null> {
    try {
      const url = `${this.endpoint}/v2/updates/price/latest?ids[]=${feedId}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Pyth API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as { parsed?: any[] };
      
      if (!data.parsed || data.parsed.length === 0) {
        return null;
      }

      const priceData = data.parsed[0];
      const price = this.parsePrice(priceData.price);
      const emaPrice = this.parsePrice(priceData.ema_price);

      const result: PythPrice = {
        feedId,
        price,
        confidence: this.parsePrice(priceData.price, 'conf'),
        publishTime: priceData.price.publish_time,
        emaPrice,
      };

      // Cache for historical comparison
      this.cachePrice(feedId, result);

      return result;
    } catch (error) {
      console.error('Error fetching Pyth price:', error);
      return null;
    }
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(feedIds: string[]): Promise<Map<string, PythPrice>> {
    const results = new Map<string, PythPrice>();
    
    // Batch request
    const idsParam = feedIds.map(id => `ids[]=${id}`).join('&');
    const url = `${this.endpoint}/v2/updates/price/latest?${idsParam}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return results;

      const data = await response.json() as { parsed?: any[] };
      
      for (const priceData of data.parsed || []) {
        const feedId = '0x' + priceData.id;
        const price = this.parsePrice(priceData.price);
        
        results.set(feedId, {
          feedId,
          price,
          confidence: this.parsePrice(priceData.price, 'conf'),
          publishTime: priceData.price.publish_time,
          emaPrice: this.parsePrice(priceData.ema_price),
        });

        this.cachePrice(feedId, results.get(feedId)!);
      }
    } catch (error) {
      console.error('Error fetching Pyth prices:', error);
    }

    return results;
  }

  /**
   * Calculate price change from cached history
   */
  getPriceChange(feedId: string, periodMs: number): number | null {
    const history = this.priceCache.get(feedId);
    if (!history || history.length < 2) return null;

    const now = Date.now() / 1000;
    const cutoff = now - (periodMs / 1000);
    
    const oldPrice = history.find(p => p.publishTime <= cutoff);
    const currentPrice = history[history.length - 1];

    if (!oldPrice) return null;

    return ((currentPrice.price - oldPrice.price) / oldPrice.price) * 100;
  }

  /**
   * Get price update with momentum signals
   */
  async getPriceUpdate(symbol: string): Promise<PriceUpdate | null> {
    const feedId = PYTH_FEED_IDS[symbol as keyof typeof PYTH_FEED_IDS];
    if (!feedId) return null;

    const price = await this.getPrice(feedId);
    if (!price) return null;

    return {
      token: symbol,
      price: price.price,
      priceChange1h: this.getPriceChange(feedId, 60 * 60 * 1000) || 0,
      priceChange24h: this.getPriceChange(feedId, 24 * 60 * 60 * 1000) || 0,
      confidence: price.confidence,
      timestamp: price.publishTime * 1000,
    };
  }

  private parsePrice(priceObj: any, field: string = 'price'): number {
    const value = BigInt(priceObj[field]);
    const expo = priceObj.expo;
    return Number(value) * Math.pow(10, expo);
  }

  private cachePrice(feedId: string, price: PythPrice): void {
    if (!this.priceCache.has(feedId)) {
      this.priceCache.set(feedId, []);
    }
    
    const history = this.priceCache.get(feedId)!;
    history.push(price);
    
    // Keep last 24h of data (assuming ~1 price per 5 seconds = 17280 entries)
    // Trim to last 1000 for memory
    if (history.length > 1000) {
      history.shift();
    }
  }
}

// Singleton instance
let pythClient: PythClient | null = null;

export function getPythClient(endpoint?: string): PythClient {
  if (!pythClient) {
    pythClient = new PythClient(endpoint);
  }
  return pythClient;
}
