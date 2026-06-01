import type { Role } from '../db/entities/user.entity';

export type JwtPayload = {
  sub: number;
  unitId: number;
  role: Role;
  username: string;
};
