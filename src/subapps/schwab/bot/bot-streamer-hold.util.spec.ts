import { diffStreamerHolds } from './bot-streamer-hold.util';

describe('diffStreamerHolds', () => {
  it('acquires for a newly armed user', () => {
    expect(diffStreamerHolds(['user-a'], new Set())).toEqual({
      toAcquire: ['user-a'],
      toRelease: [],
    });
  });

  it('releases for a user no longer armed', () => {
    expect(diffStreamerHolds([], new Set(['user-a']))).toEqual({
      toAcquire: [],
      toRelease: ['user-a'],
    });
  });

  it('leaves an already-held, still-armed user alone', () => {
    expect(diffStreamerHolds(['user-a'], new Set(['user-a']))).toEqual({
      toAcquire: [],
      toRelease: [],
    });
  });

  it('handles simultaneous arms and disarms across users', () => {
    expect(
      diffStreamerHolds(['user-b', 'user-c'], new Set(['user-a', 'user-b'])),
    ).toEqual({
      toAcquire: ['user-c'],
      toRelease: ['user-a'],
    });
  });

  it('is a no-op when nothing changed', () => {
    expect(diffStreamerHolds([], new Set())).toEqual({
      toAcquire: [],
      toRelease: [],
    });
  });
});
