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

  /**
   * 2026-09-21 prod incident: the bot only ever `peek()`ed at a session a
   * browser tab had acquired, so closing the tab tore the feed down mid-
   * position and force-flattened it under SOCKET_LOSS. Holders fix that:
   * the session survives as long as anyone — a tab or the bot — needs it.
   */
  describe('holder refcounting', () => {
    it('keeps the session alive for the bot after the last browser tab closes', () => {
      const pool = build();

      const session = pool.acquire('user-a', 'socket');
      pool.acquireForBackgroundWork('user-a');
      pool.release('user-a', 'socket');

      expect(session.stop).not.toHaveBeenCalled();
      expect(pool.peek('user-a')).toBe(session);
    });

    it('keeps the session alive for a browser tab after the bot disarms', () => {
      const pool = build();

      const session = pool.acquireForBackgroundWork('user-a');
      pool.acquire('user-a', 'socket');
      pool.releaseBackgroundWork('user-a');

      expect(session.stop).not.toHaveBeenCalled();
      expect(pool.peek('user-a')).toBe(session);
    });

    it('stops the session once every holder has released', () => {
      const pool = build();

      const session = pool.acquire('user-a', 'socket');
      pool.acquireForBackgroundWork('user-a');
      pool.release('user-a', 'socket');
      pool.releaseBackgroundWork('user-a');

      expect(session.stop).toHaveBeenCalledTimes(1);
      expect(pool.peek('user-a')).toBeNull();
    });

    it('does not double-count the same holder acquiring twice', () => {
      const pool = build();

      const session = pool.acquireForBackgroundWork('user-a');
      pool.acquireForBackgroundWork('user-a');
      pool.releaseBackgroundWork('user-a');

      expect(session.stop).toHaveBeenCalledTimes(1);
    });

    it('reuses an existing session for a second holder even at capacity', () => {
      const pool = build(1);

      const session = pool.acquire('user-a', 'socket');
      expect(() => pool.acquireForBackgroundWork('user-a')).not.toThrow();
      expect(pool.acquireForBackgroundWork('user-a')).toBe(session);
    });
  });
});
