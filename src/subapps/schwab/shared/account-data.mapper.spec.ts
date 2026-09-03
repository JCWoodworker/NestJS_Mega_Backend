import { mapAccountBalances, mapAccountPositions } from './account-data.mapper';

describe('account-data.mapper', () => {
  describe('mapAccountBalances', () => {
    it('reads dayStartEquity from initialBalances.liquidationValue (margin account)', () => {
      const response = {
        securitiesAccount: {
          currentBalances: {
            equity: 150.25,
            cashAvailableForTrading: 100,
            optionBuyingPower: 300,
          },
          initialBalances: {
            liquidationValue: 129.43,
            accountValue: 999, // should be ignored - liquidationValue wins
          },
        },
      };

      expect(mapAccountBalances(response)).toEqual({
        equity: 150.25,
        settledCash: 100,
        optionsBuyingPower: 300,
        dayStartEquity: 129.43,
      });
    });

    it('falls back to initialBalances.accountValue when liquidationValue is absent', () => {
      const response = {
        securitiesAccount: {
          currentBalances: { equity: 50 },
          initialBalances: { accountValue: 42.5 },
        },
      };

      expect(mapAccountBalances(response).dayStartEquity).toBe(42.5);
    });

    it('defaults dayStartEquity to 0 when initialBalances is missing entirely', () => {
      const response = {
        securitiesAccount: { currentBalances: { equity: 50 } },
      };

      expect(mapAccountBalances(response).dayStartEquity).toBe(0);
    });

    it('defaults every field to 0 for an empty/malformed response', () => {
      expect(mapAccountBalances({})).toEqual({
        equity: 0,
        settledCash: 0,
        optionsBuyingPower: 0,
        dayStartEquity: 0,
      });
    });
  });

  describe('mapAccountPositions', () => {
    it('maps quantity as net long minus short and falls back across price field aliases', () => {
      const response = {
        securitiesAccount: {
          positions: [
            {
              instrument: {
                symbol: 'SPY   260903C00772000',
                assetType: 'OPTION',
              },
              longQuantity: 2,
              shortQuantity: 0,
              averageLongPrice: 1.25,
              marketValue: 250,
              currentDayProfitLoss: 15.5,
            },
          ],
        },
      };

      expect(mapAccountPositions(response)).toEqual([
        {
          symbol: 'SPY   260903C00772000',
          assetType: 'OPTION',
          quantity: 2,
          averagePrice: 1.25,
          marketValue: 250,
          dayProfitLoss: 15.5,
        },
      ]);
    });

    it('returns an empty array when there are no positions', () => {
      expect(mapAccountPositions({ securitiesAccount: {} })).toEqual([]);
    });
  });
});
