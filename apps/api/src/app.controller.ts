import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'pulse-api',
      message: 'Pulse backend is running!',
    };
  }
}
