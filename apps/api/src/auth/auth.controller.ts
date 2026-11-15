import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { authRateLimit } from '../config/env';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from './auth.schemas';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

// Slows down password guessing: a few attempts per minute per IP address.
const authThrottle = { default: { ttl: 60_000, limit: authRateLimit } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(authThrottle)
  register(@Body({ schema: registerSchema }) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post('login')
  @Throttle(authThrottle)
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) body: LoginInput) {
    return this.auth.login(body);
  }

  /**
   * Always answers 204, whether or not the address belongs to an account,
   * so the endpoint cannot be used to find out who is registered.
   */
  @Post('forgot-password')
  @Throttle(authThrottle)
  @HttpCode(204)
  forgotPassword(
    @Body({ schema: forgotPasswordSchema }) body: ForgotPasswordInput,
  ) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @Throttle(authThrottle)
  @HttpCode(204)
  resetPassword(
    @Body({ schema: resetPasswordSchema }) body: ResetPasswordInput,
  ) {
    return this.auth.resetPassword(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }
}
