const { Client, DataComparisonManager } = require('../main');

// Example of using the DataComparisonManager to compare and fallback between different data sources
async function main() {
  // Create TradingView client
  const client = new Client();

  // Create DataComparisonManager instance
  const dataManager = new DataComparisonManager(client);

  // Add a mock third-party API as primary data source
  dataManager.addDataSource({
    name: 'third-party-api',
    fetcher: async (symbol) => {
      // Simulate third-party API call
      // In real usage, replace this with actual API call
      return new Promise((resolve, reject) => {
        // Simulate random failure
        if (Math.random() > 0.5) {
          reject(new Error('Third-party API failed'));
        } else {
          resolve({
            price: 100.50,
            volume: 1000000,
            timestamp: Date.now(),
          });
        }
      });
    },
    priority: 1, // Higher priority (lower number)
    timeout: 3000, // 3 second timeout
  });

  // Example 1: Fallback behavior
  try {
    console.log('Example 1: Fallback behavior');
    const result = await dataManager.getData('BTCUSD');
    console.log('Data retrieved from:', result.source);
    console.log('Data:', result.data);
  } catch (error) {
    console.error('Failed to get data:', error);
  }

  // Example 2: Compare data from all sources
  try {
    console.log('\nExample 2: Compare all sources');
    const compareFunction = (dataArray) => {
      // Custom comparison logic
      const prices = dataArray.map(d => d.price || d.lp);
      return {
        average: prices.reduce((a, b) => a + b, 0) / prices.length,
        difference: Math.abs(prices[0] - prices[1]),
        percentDifference: (Math.abs(prices[0] - prices[1]) / prices[0]) * 100,
      };
    };

    const result = await dataManager.getData('BTCUSD', {
      compareAll: true,
      compareFunction,
    });

    console.log('Data from all sources:', result.data);
    console.log('Comparison results:', result.comparison);
    if (result.errors) {
      console.log('Errors:', result.errors);
    }
  } catch (error) {
    console.error('Failed to compare data:', error);
  }

  // Cleanup
  await client.end();
}

main().catch(console.error);