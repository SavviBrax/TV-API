const QuoteSession = require('../quote/session');

/**
 * @typedef {Object} DataSourceConfig
 * @property {string} name - Name of the data source
 * @property {Function} fetcher - Function to fetch data from the source
 * @property {number} [priority=1] - Priority of the source (lower number = higher priority)
 * @property {number} [timeout=5000] - Timeout in milliseconds
 */

class DataComparisonManager {
  #dataSources = new Map();
  #client;

  /**
   * @param {import('../client')} client - TradingView client instance
   */
  constructor(client) {
    this.#client = client;
  }

  /**
   * Add a data source to the manager
   * @param {DataSourceConfig} config - Configuration for the data source
   */
  addDataSource(config) {
    if (!config.name || !config.fetcher) {
      throw new Error('Data source must have a name and fetcher function');
    }

    this.#dataSources.set(config.name, {
      ...config,
      priority: config.priority || 1,
      timeout: config.timeout || 5000,
    });
  }

  /**
   * Remove a data source from the manager
   * @param {string} name - Name of the data source to remove
   */
  removeDataSource(name) {
    this.#dataSources.delete(name);
  }

  /**
   * Get data with fallback support
   * @param {string} symbol - Symbol to fetch data for
   * @param {Object} options - Options for data fetching
   * @param {string[]} [options.preferredSources] - Ordered list of preferred sources
   * @param {boolean} [options.compareAll=false] - Whether to compare all sources
   * @param {Function} [options.compareFunction] - Custom comparison function
   * @returns {Promise<Object>} - Fetched data and metadata
   */
  async getData(symbol, options = {}) {
    const sources = Array.from(this.#dataSources.values())
      .sort((a, b) => a.priority - b.priority);

    if (options.preferredSources) {
      sources.sort((a, b) => {
        const aIndex = options.preferredSources.indexOf(a.name);
        const bIndex = options.preferredSources.indexOf(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    }

    const results = new Map();
    const errors = new Map();

    // Add TradingView as a data source if not already present
    if (!this.#dataSources.has('tradingview')) {
      this.addDataSource({
        name: 'tradingview',
        fetcher: async (symbol) => {
          const session = new this.#client.Session.Quote();
          const market = new session.Market(symbol);
          return new Promise((resolve) => {
            market.onUpdate((data) => {
              resolve(data);
              session.delete();
            });
          });
        },
        priority: 1,
      });
    }

    // Fetch from all sources in parallel if compareAll is true
    if (options.compareAll) {
      await Promise.all(sources.map(async (source) => {
        try {
          const result = await Promise.race([
            source.fetcher(symbol),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), source.timeout)
            ),
          ]);
          results.set(source.name, result);
        } catch (error) {
          errors.set(source.name, error);
        }
      }));

      if (results.size === 0) {
        throw new Error('All data sources failed', { cause: Object.fromEntries(errors) });
      }

      // Compare results if a comparison function is provided
      if (options.compareFunction && results.size > 1) {
        return {
          data: Array.from(results.entries()),
          comparison: options.compareFunction(Array.from(results.values())),
          errors: Object.fromEntries(errors),
        };
      }

      return {
        data: Array.from(results.entries()),
        errors: Object.fromEntries(errors),
      };
    }

    // Try sources sequentially for fallback behavior
    for (const source of sources) {
      try {
        const result = await Promise.race([
          source.fetcher(symbol),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), source.timeout)
          ),
        ]);
        return {
          source: source.name,
          data: result,
        };
      } catch (error) {
        errors.set(source.name, error);
        continue;
      }
    }

    throw new Error('All data sources failed', { cause: Object.fromEntries(errors) });
  }
}

module.exports = DataComparisonManager;
