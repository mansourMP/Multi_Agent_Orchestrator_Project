import { Module } from '@nestjs/common';
import { CodingAgentService } from './coding-agent.service';
import { CodingAgentController } from './coding-agent.controller';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [AiModule],
    providers: [CodingAgentService],
    controllers: [CodingAgentController],
    exports: [CodingAgentService],
})
export class CodingAgentModule { }
