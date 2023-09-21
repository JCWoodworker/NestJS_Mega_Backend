import { SetMetadata } from '@nestjs/common';

export const SKIP_AUTH_KEY =
  'DO NOT USE THIS VALUE. INSTEAD, CREATE A COMPLEX SECRET AND KEEP IT SAFE OUTSIDE OF THE SOURCE CODE.';
export const SkipAuth = () => SetMetadata(SKIP_AUTH_KEY, true);
