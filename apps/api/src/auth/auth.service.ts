import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginInput, RegisterInput } from './auth.schemas';
import type { JwtPayload, PublicUser } from './auth.types';
import { hashPassword, verifyPassword } from './password';

const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { email: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === input.email
          ? 'Email is already registered'
          : 'Username is already taken',
      );
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          displayName: input.displayName ?? input.username,
          passwordHash: await hashPassword(input.password),
        },
        select: publicUserSelect,
      });
      return this.withToken(user);
    } catch (error) {
      // Two requests raced for the same email or username.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or username is already in use');
      }
      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...publicUserSelect, passwordHash: true },
    });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return this.withToken(publicUser);
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  /** Returns the user id when the token is valid, otherwise null. */
  async verifyToken(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  private async withToken(user: PublicUser) {
    const payload: JwtPayload = { sub: user.id };
    return { user, accessToken: await this.jwt.signAsync(payload) };
  }
}
