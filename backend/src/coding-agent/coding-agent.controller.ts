import { Controller, Post, Body } from '@nestjs/common';
import { CodingAgentService } from './coding-agent.service';

class ExecuteCodeTaskDto {
    description: string;
    language: 'typescript' | 'python' | 'javascript' | 'bash';
    requirements?: string[];
    context?: string;
}

@Controller('coding-agent')
export class CodingAgentController {
    constructor(private readonly codingAgent: CodingAgentService) { }

    @Post('execute')
    async executeTask(@Body() dto: ExecuteCodeTaskDto) {
        return this.codingAgent.executeTask({
            description: dto.description,
            language: dto.language,
            requirements: dto.requirements,
            context: dto.context
        });
    }

    @Post('clean-workspace')
    async cleanWorkspace() {
        await this.codingAgent.cleanWorkspace();
        return { message: 'Workspace cleaned' };
    }
}
