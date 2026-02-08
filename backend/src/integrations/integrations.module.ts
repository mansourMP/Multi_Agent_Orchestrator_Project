import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { IntegrationsController } from './integrations.controller';
import { ExecutionsModule } from '../executions/executions.module';

@Module({
    imports: [forwardRef(() => ExecutionsModule)],
    controllers: [IntegrationsController],
    providers: [TelegramService],
    exports: [TelegramService],
})
export class IntegrationsModule { }
