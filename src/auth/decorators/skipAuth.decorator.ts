import { SetMetadata } from '@nestjs/common';

export const SKIP_AUTH_KEY = 'skipAuthentication';
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
