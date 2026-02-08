import { Module } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { ExecutionsController } from './executions.controller';
import { ExecutionsGateway } from './executions.gateway';

import { AiModule } from '../ai/ai.module';
import { MemoryModule } from '../memory/memory.module';
import { VisionModule } from '../vision/vision.module';
import { CodingAgentModule } from '../coding-agent/coding-agent.module';
import { ResearchAgentModule } from '../research-agent/research-agent.module';

import { forwardRef } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
    imports: [AiModule, MemoryModule, VisionModule, CodingAgentModule, ResearchAgentModule, forwardRef(() => IntegrationsModule)],
    controllers: [ExecutionsController],
    providers: [ExecutionsService, ExecutionsGateway],
    exports: [ExecutionsService, ExecutionsGateway],
})
export class ExecutionsModule { }
