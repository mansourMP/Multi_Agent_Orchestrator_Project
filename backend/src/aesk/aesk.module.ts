import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AeskController } from './aesk.controller';
import { CompanyBrainService } from './services/company-brain.service';
import { AutonomousOrchestratorService } from './services/autonomous-orchestrator.service';
import { PulseService } from './services/pulse.service';
import { CortexService } from './services/cortex.service';
import { VectorMemoryService } from './services/vector-memory.service';
import { SandboxService } from './services/sandbox.service';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
    imports: [PrismaModule, WorkflowsModule],
    controllers: [AeskController],
    providers: [
        CompanyBrainService,
        AutonomousOrchestratorService,
        PulseService,
        CortexService,
        VectorMemoryService,
        SandboxService,
    ],
    exports: [CompanyBrainService, VectorMemoryService, SandboxService],
})
export class AeskModule { }
