export interface JwtPayload {
  sub: string;
  /** When the token was issued, in seconds. Added by the JWT library. */
  iat?: number;
}

export interface AuthUser {
  id: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  createdAt: Date;
}
