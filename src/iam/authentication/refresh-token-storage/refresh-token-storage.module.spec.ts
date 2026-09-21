import { RefreshTokensModule } from './refresh-token-storage.module';

describe('RefreshTokensModule', () => {
  it('exposes no HTTP surface', () => {
    const controllers = Reflect.getMetadata(
      'controllers',
      RefreshTokensModule,
    ) as unknown[] | undefined;

    // Refresh tokens are issued and rotated only through AuthenticationService,
    // which verifies the presented token first. A controller here previously
    // accepted a caller-supplied userId with no authentication at all.
    expect(controllers ?? []).toHaveLength(0);
  });
});
