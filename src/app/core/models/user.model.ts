export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'COMMERCIAL'
  | 'OPERATOR'
  | 'FINANCE'
  | 'TECHNICIAN'
  | 'LAUNDRY'
  | 'PLATFORM_ADMIN';

export type AuthProvider = 'LOCAL' | 'GOOGLE' | 'FACEBOOK';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  /** Nome da pessoa (ou email, se ainda não o preencheu) — nunca o nome da empresa. */
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  locale: string;
  /** `light` | `dark` | `system`; ausente/null = nunca escolheu no servidor. */
  themePreference?: string | null;
  emailVerified: boolean;
  authProvider: AuthProvider;
  createdAt: string;
  mustChangePassword: boolean;
}

export interface AuthTokens {
  accessToken: string;
  /** Ausente no portal: o refresh token viaja num cookie HttpOnly, nunca no corpo. */
  refreshToken?: string;
  expiresIn: number;
  userId: string;
  role: UserRole;
  isNewUser: boolean;
  mustChangePassword: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface TenantCreateRequest {
  name: string;
  countryCode: string;
  taxId?: string;
  address: string;
  addressComplement?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  description?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
}
