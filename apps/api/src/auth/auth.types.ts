export interface JwtPayload {
  sub: string;
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
