import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ChatModule } from './chat/chat.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BillingModule } from './billing/billing.module';
import { AiModule } from './ai/ai.module';
import { N8nModule } from './n8n/n8n.module';
import { MemoryModule } from './memory/memory.module';
import { VisionModule } from './vision/vision.module';
import { CodingAgentModule } from './coding-agent/coding-agent.module';
import { ResearchAgentModule } from './research-agent/research-agent.module';
import { AeskModule } from './aesk/aesk.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        PrismaModule,
        AuthModule,
        AgentsModule,
        AeskModule,
        ChatModule,
        OrganizationsModule,
        BillingModule,
        AiModule,
        N8nModule,
        MemoryModule,
        VisionModule,
        CodingAgentModule,
        ResearchAgentModule,
        IntegrationsModule,
    ],
    controllers: [HealthController],
})
export class AppModule { }
