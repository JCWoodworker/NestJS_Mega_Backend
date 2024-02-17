import { UUID } from 'crypto';
import { Role } from '../../users/enums/role.enum';

export interface ActiveUserData {
  sub: UUID;
  email: string;
  exp: number;
  role: Role;
  refreshTokenId?: string;
}
