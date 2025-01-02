import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataComparisonManager from '../src/classes/DataComparisonManager';

describe('DataComparisonManager', () => {
  let manager;
  const mockClient = {
    sessions: {},
    send: vi.fn(),
  };

  beforeEach(() => {
    manager = new DataComparisonManager(mockClient);
  });

  it('should add and remove data sources', () => {
    const mockFetcher = async () => ({ price: 100 });
    
    manager.addDataSource({
      name: 'test-source',
      fetcher: mockFetcher,
      priority: 1,
    });

    expect(() => manager.removeDataSource('test-source')).not.toThrow();
  });

  it('should throw error when adding invalid data source', () => {
    expect(() => manager.addDataSource({ name: 'test' })).toThrow();
    expect(() => manager.addDataSource({ fetcher: () => {} })).toThrow();
  });

  it('should fetch data with fallback support', async () => {
    const mockData = { price: 100 };
    const mockFetcher = vi.fn().mockResolvedValue(mockData);
    const mockFailingFetcher = vi.fn().mockRejectedValue(new Error('Failed'));

    manager.addDataSource({
      name: 'primary',
      fetcher: mockFailingFetcher,
      priority: 1,
    });

    manager.addDataSource({
      name: 'backup',
      fetcher: mockFetcher,
      priority: 2,
    });

    const result = await manager.getData('BTCUSD');
    expect(result.source).toBe('backup');
    expect(result.data).toEqual(mockData);
  });

  it('should compare data from multiple sources', async () => {
    const source1Data = { price: 100 };
    const source2Data = { price: 101 };
    
    manager.addDataSource({
      name: 'source1',
      fetcher: vi.fn().mockResolvedValue(source1Data),
    });

    manager.addDataSource({
      name: 'source2',
      fetcher: vi.fn().mockResolvedValue(source2Data),
    });

    const compareFunction = (data) => {
      const prices = data.map(d => d.price);
      return {
        average: prices.reduce((a, b) => a + b, 0) / prices.length,
        difference: Math.abs(prices[0] - prices[1]),
      };
    };

    const result = await manager.getData('BTCUSD', {
      compareAll: true,
      compareFunction,
    });

    expect(result.data).toHaveLength(2);
    expect(result.comparison).toEqual({
      average: 100.5,
      difference: 1,
    });
  });

  it('should handle timeouts', async () => {
    const slowFetcher = () => new Promise(resolve => setTimeout(resolve, 1000));
    
    manager.addDataSource({
      name: 'slow-source',
      fetcher: slowFetcher,
      timeout: 100,
    });

    await expect(manager.getData('BTCUSD')).rejects.toThrow('All data sources failed');
  });
});