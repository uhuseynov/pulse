import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, welcomeEmail } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import type {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.schemas';
import type { JwtPayload, PublicUser } from './auth.types';
import { hashPassword, verifyPassword } from './password';

const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** How long a password-reset link works. */
export const RESET_TOKEN_TTL_MINUTES = 60;

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  /** Address of the web app, for links in emails. */
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_ORIGIN', { infer: true })[0];
  }

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
      // Not awaited: signing up must not wait for, or fail with, the email.
      void this.mail.send({
        to: user.email,
        ...welcomeEmail(user.displayName, this.webUrl),
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

  /**
   * Emails a link for choosing a new password. Does nothing, and says
   * nothing, when no account has this address.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      return;
    }

    // The token itself only ever exists in the email; we keep its hash.
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      // Asking again makes every earlier link stop working.
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
        },
      }),
    ]);
    // Not awaited, so the response takes the same time either way.
    void this.mail.send({
      to: user.email,
      ...passwordResetEmail(
        user.displayName,
        `${this.webUrl}/reset-password?token=${token}`,
        RESET_TOKEN_TTL_MINUTES,
      ),
    });
  }

  /** Sets a new password with a link from requestPasswordReset. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const invalid = new BadRequestException(
      'This reset link is invalid or has expired. Request a new one.',
    );
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!record || record.expiresAt <= new Date()) {
      throw invalid;
    }

    const passwordHash = await hashPassword(input.password);
    // Token times are whole seconds, so this is rounded down to match.
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await this.prisma.$transaction(async (tx) => {
      // Deleting first makes the link single-use even if it is sent twice.
      const { count } = await tx.passwordResetToken.deleteMany({
        where: { id: record.id },
      });
      if (count === 0) {
        throw invalid;
      }
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: changedAt },
      });
    });
  }

  /**
   * Returns the user id when the token is valid, otherwise null. A token
   * issued before the user's last password change is no longer valid, so
   * resetting a password signs out every other device.
   */
  async verifyToken(token: string): Promise<string | null> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return null;
    }
    if (typeof payload.sub !== 'string') {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { passwordChangedAt: true },
    });
    if (!user) {
      return null;
    }
    const issuedAt = (payload.iat ?? 0) * 1000;
    if (user.passwordChangedAt && issuedAt < user.passwordChangedAt.getTime()) {
      return null;
    }
    return payload.sub;
  }

  private async withToken(user: PublicUser) {
    const payload: JwtPayload = { sub: user.id };
    return { user, accessToken: await this.jwt.signAsync(payload) };
  }
}
