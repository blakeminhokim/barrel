/**
 * X/Social Sentiment Integration
 * Uses xAI API with x_search tool for Vox (sentiment) agent
 */

export interface SentimentSignal {
  token: string;
  query: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number; // -100 to 100
  mentions: number;
  topTweets: string[];
  timestamp: number;
}

export interface XSearchResult {
  text: string;
  author: string;
  likes: number;
  retweets: number;
  timestamp: string;
}

export class SentimentClient {
  private apiKey: string;
  private baseUrl = 'https://api.x.ai/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search X for token mentions and analyze sentiment
   */
  async analyzeSentiment(token: string, additionalContext?: string): Promise<SentimentSignal | null> {
    if (!this.apiKey) {
      console.warn('No XAI_API_KEY configured, skipping sentiment analysis');
      return null;
    }

    try {
      const query = `$${token} OR #${token} crypto trading`;
      
      // Use xAI responses API with x_search tool
      const response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-3',
          tools: [{ type: 'x_search' }],
          messages: [
            {
              role: 'user',
              content: `Search X/Twitter for recent posts about "${query}". ${additionalContext || ''}
              
Analyze the sentiment and provide:
1. Overall sentiment (bullish/bearish/neutral)
2. Sentiment score (-100 to 100)
3. Approximate number of recent mentions
4. Key themes or concerns

Format your response as JSON:
{
  "sentiment": "bullish|bearish|neutral",
  "score": <number>,
  "mentions": <number>,
  "themes": ["theme1", "theme2"],
  "summary": "<brief summary>"
}`
            }
          ],
        }),
      });

      if (!response.ok) {
        console.error(`xAI API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content || '';

      // Parse the JSON response
      const parsed = this.parseResponse(content);
      
      return {
        token,
        query,
        sentiment: parsed.sentiment || 'neutral',
        score: parsed.score || 0,
        mentions: parsed.mentions || 0,
        topTweets: parsed.themes || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return null;
    }
  }

  /**
   * Quick sentiment check for a list of tokens
   */
  async batchAnalyze(tokens: string[]): Promise<Map<string, SentimentSignal>> {
    const results = new Map<string, SentimentSignal>();
    
    // Rate limit: process sequentially with delay
    for (const token of tokens) {
      const signal = await this.analyzeSentiment(token);
      if (signal) {
        results.set(token, signal);
      }
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Check if a token is trending
   */
  async isTrending(token: string): Promise<boolean> {
    const signal = await this.analyzeSentiment(token, 'Focus on whether this is trending or getting unusual attention.');
    if (!signal) return false;
    
    return signal.score > 30 || signal.mentions > 100;
  }

  private parseResponse(content: string): any {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall back to basic parsing
    }

    // Basic sentiment detection from text
    const lower = content.toLowerCase();
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let score = 0;

    if (lower.includes('bullish') || lower.includes('moon') || lower.includes('pump')) {
      sentiment = 'bullish';
      score = 50;
    } else if (lower.includes('bearish') || lower.includes('dump') || lower.includes('sell')) {
      sentiment = 'bearish';
      score = -50;
    }

    return { sentiment, score, mentions: 0, themes: [] };
  }
}

// Singleton
let sentimentClient: SentimentClient | null = null;

export function getSentimentClient(apiKey?: string): SentimentClient {
  if (!sentimentClient && apiKey) {
    sentimentClient = new SentimentClient(apiKey);
  }
  return sentimentClient!;
}
