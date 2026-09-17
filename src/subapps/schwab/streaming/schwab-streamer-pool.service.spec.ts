import { SchwabStreamerPool } from './schwab-streamer-pool.service';
import { SchwabStreamerSession } from './schwab-streamer-session';

jest.mock('./schwab-streamer-session');

const SessionMock = SchwabStreamerSession as jest.MockedClass<
  typeof SchwabStreamerSession
>;

function build(maxStreamerSessions = 2) {
  const pool = new SchwabStreamerPool(
    {} as any,
    {} as any,
    {} as any,
    { maxStreamerSessions, tickEmitThrottleMs: 50 } as any,
  );
  return pool;
}

describe('SchwabStreamerPool', () => {
  beforeEach(() => {
    SessionMock.mockClear();
  });

  it('starts one session per user and reuses it', () => {
    const pool = build();

    const first = pool.acquire('user-a');
    const second = pool.acquire('user-a');

    expect(first).toBe(second);
    expect(SessionMock).toHaveBeenCalledTimes(1);
    expect(first.start).toHaveBeenCalledTimes(1);
  });

  it('keeps users on separate sessions', () => {
    const pool = build();

    pool.acquire('user-a');
    pool.acquire('user-b');

    expect(SessionMock).toHaveBeenCalledTimes(2);
    expect(SessionMock.mock.calls[0][0]).toBe('user-a');
    expect(SessionMock.mock.calls[1][0]).toBe('user-b');
    expect(pool.activeUserIds()).toEqual(['user-a', 'user-b']);
  });

  /**
   * N concurrent WebSockets on one dyno is the scaling limit of this design.
   * Refusing explicitly lets the frontend say so; the alternative is the dyno
   * running out of memory while other users hold open positions.
   */
  it('refuses to exceed the capacity ceiling', () => {
    const pool = build(2);

    pool.acquire('user-a');
    pool.acquire('user-b');

    expect(() => pool.acquire('user-c')).toThrow(/at capacity/i);
    expect(pool.activeUserIds()).toEqual(['user-a', 'user-b']);
  });

  it('frees capacity on release', () => {
    const pool = build(2);

    const sessionA = pool.acquire('user-a');
    pool.acquire('user-b');
    pool.release('user-a');

    expect(sessionA.stop).toHaveBeenCalledTimes(1);
    expect(() => pool.acquire('user-c')).not.toThrow();
  });

  it('peek never starts a session', () => {
    const pool = build();

    expect(pool.peek('user-a')).toBeNull();
    expect(SessionMock).not.toHaveBeenCalled();
  });

  it('stops every session on shutdown', () => {
    const pool = build();
    const a = pool.acquire('user-a');
    const b = pool.acquire('user-b');

    pool.onModuleDestroy();

    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(b.stop).toHaveBeenCalledTimes(1);
    expect(pool.activeUserIds()).toEqual([]);
  });

  it('release is a no-op for an unknown user', () => {
    const pool = build();
    expect(() => pool.release('nobody')).not.toThrow();
  });
});
