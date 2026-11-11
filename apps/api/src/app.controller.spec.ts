import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should report that the API is up', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'pulse-api',
        message: 'Pulse backend is running!',
      });
    });
  });
});
