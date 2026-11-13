import { Global, Module } from '@nestjs/common';
import { VoicePresenceService } from './voice-presence.service';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Global()
@Module({
  controllers: [VoiceController],
  providers: [VoiceService, VoicePresenceService],
  exports: [VoiceService, VoicePresenceService],
})
export class VoiceModule {}
