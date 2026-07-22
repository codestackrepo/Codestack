import type { Role } from './common';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}
