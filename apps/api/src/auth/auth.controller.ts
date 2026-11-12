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
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }
}
