import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body({ schema: registerSchema }) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post('login')
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
