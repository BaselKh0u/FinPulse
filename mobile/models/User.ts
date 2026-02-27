export interface User {
  id: string;
  fullName: string;
  email: string;
  token?: string; // JWT or session token
}
