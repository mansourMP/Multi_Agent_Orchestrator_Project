import { Module } from '@nestjs/common';
import { ResearchAgentService } from './research-agent.service';
import { ResearchAgentController } from './research-agent.controller';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [AiModule],
    providers: [ResearchAgentService],
    controllers: [ResearchAgentController],
    exports: [ResearchAgentService],
})
export class ResearchAgentModule { }
