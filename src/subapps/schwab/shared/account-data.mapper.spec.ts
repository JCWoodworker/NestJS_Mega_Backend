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

    it('prefers current liquidationValue over a cash-only equity field', () => {
      const response = {
        securitiesAccount: {
          currentBalances: {
            equity: 1.11,
            liquidationValue: 4.11,
            cashAvailableForTrading: 1.11,
          },
          initialBalances: { liquidationValue: 4.43 },
        },
      };

      const balances = mapAccountBalances(response);
      expect(balances.equity).toBe(4.11);
      expect(balances.dayStartEquity).toBe(4.43);
      expect(balances.equity - balances.dayStartEquity).toBeCloseTo(-0.32, 5);
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
              marketValue: 280,
              // Deliberately different from marketValue - costBasis (280 - 250 = 30) to
              // prove dayProfitLoss is computed, not passed through from Schwab's field.
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
          marketValue: 280,
          dayProfitLoss: 30,
        },
      ]);
    });

    it('computes unrealized P&L on options at ×100 notional', () => {
      const response = {
        securitiesAccount: {
          positions: [
            {
              instrument: {
                symbol: 'SPY   260909C00766000',
                assetType: 'OPTION',
              },
              longQuantity: 6,
              shortQuantity: 0,
              averagePrice: 0.07,
              marketValue: 45,
            },
          ],
        },
      };

      // cost basis = 0.07 * 6 * 100 = 42; unrealized = 45 - 42 = 3
      expect(mapAccountPositions(response)[0]?.dayProfitLoss).toBeCloseTo(3, 5);
    });

    it('computes unrealized P&L on equities at ×1 notional', () => {
      const response = {
        securitiesAccount: {
          positions: [
            {
              instrument: { symbol: 'AAPL', assetType: 'EQUITY' },
              longQuantity: 10,
              shortQuantity: 0,
              averagePrice: 200,
              marketValue: 2050,
            },
          ],
        },
      };

      // cost basis = 200 * 10 * 1 = 2000; unrealized = 2050 - 2000 = 50
      expect(mapAccountPositions(response)[0]?.dayProfitLoss).toBe(50);
    });

    it('rebuilds a sub-penny average from longOpenProfitLoss and ignores the penny average', () => {
      const response = {
        securitiesAccount: {
          positions: [
            {
              instrument: {
                symbol: 'SPY   260929C00780000',
                assetType: 'OPTION',
              },
              longQuantity: 2,
              shortQuantity: 0,
              averagePrice: 0.01,
              taxLotAverageLongPrice: 0.02,
              marketValue: 3,
              longOpenProfitLoss: -0.32,
              currentDayProfitLoss: 99,
            },
          ],
        },
      };

      const position = mapAccountPositions(response)[0];
      expect(position?.dayProfitLoss).toBeCloseTo(-0.32, 5);
      expect(position?.averagePrice).toBeCloseTo(0.0166, 5);
    });

    it('uses the tax-lot average when the open-gain field is absent', () => {
      const response = {
        securitiesAccount: {
          positions: [
            {
              instrument: {
                symbol: 'SPY   260929C00780000',
                assetType: 'OPTION',
              },
              longQuantity: 2,
              shortQuantity: 0,
              averagePrice: 0.01,
              taxLotAverageLongPrice: 0.0166,
              marketValue: 3,
            },
          ],
        },
      };

      const position = mapAccountPositions(response)[0];
      expect(position?.averagePrice).toBeCloseTo(0.0166, 5);
      expect(position?.dayProfitLoss).toBeCloseTo(-0.32, 5);
    });

    it('uses the short-lot open gain for a short option', () => {
      const response = {
        securitiesAccount: {
          positions: [
            {
              instrument: {
                symbol: 'SPY   260929P00760000',
                assetType: 'OPTION',
              },
              longQuantity: 0,
              shortQuantity: 1,
              averagePrice: 0.01,
              marketValue: -15,
              shortOpenProfitLoss: 5,
            },
          ],
        },
      };

      const position = mapAccountPositions(response)[0];
      expect(position?.quantity).toBe(-1);
      expect(position?.dayProfitLoss).toBe(5);
      expect(position?.averagePrice).toBeCloseTo(0.2, 5);
    });

    it('returns an empty array when there are no positions', () => {
      expect(mapAccountPositions({ securitiesAccount: {} })).toEqual([]);
    });
  });
});
