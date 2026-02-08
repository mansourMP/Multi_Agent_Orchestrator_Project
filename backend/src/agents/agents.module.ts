import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { AgentFactory } from './agent.factory';
import { SquadGraph } from './squad.graph';

@Module({
    controllers: [AgentsController],
    providers: [AgentsService, AgentFactory, SquadGraph],
    exports: [AgentsService],
})
export class AgentsModule { }
