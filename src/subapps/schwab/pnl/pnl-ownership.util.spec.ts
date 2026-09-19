import { decideOwnedAccountHash } from './pnl-ownership.util';

describe('decideOwnedAccountHash', () => {
  it('returns none when the caller has no Schwab token row', () => {
    expect(decideOwnedAccountHash(null, 'SOMEONE_ELSES_HASH')).toEqual({
      status: 'none',
    });
    expect(decideOwnedAccountHash(null)).toEqual({ status: 'none' });
  });

  it('uses the persisted hash when no override is sent', () => {
    expect(
      decideOwnedAccountHash({ accountHash: 'MINE' }),
    ).toEqual({ status: 'use', hash: 'MINE' });
  });

  it('accepts an override that matches the persisted hash', () => {
    expect(
      decideOwnedAccountHash({ accountHash: 'MINE' }, 'MINE'),
    ).toEqual({ status: 'use', hash: 'MINE' });
  });

  it('requires a live check when override does not match the persisted hash', () => {
    expect(
      decideOwnedAccountHash({ accountHash: 'MINE' }, 'THEIRS'),
    ).toEqual({ status: 'live-check', hash: 'THEIRS' });
  });

  it('resolves live when connected but the hash has not been persisted yet', () => {
    expect(decideOwnedAccountHash({ accountHash: null })).toEqual({
      status: 'resolve-live',
    });
  });
});
