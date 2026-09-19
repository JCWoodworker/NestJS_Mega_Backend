import { Role } from '@users/enums/role.enum';

export interface ActiveUserData {
  sub: string;
  email: string;
  exp: number;
  role: Role;
  emailVerified?: boolean;
  refreshTokenId?: string;
}
