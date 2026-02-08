import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CompanyBrainService } from './services/company-brain.service';
import { CortexService } from './services/cortex.service';
import { SandboxService } from './services/sandbox.service';
import { CreateFeedbackDto } from './dto/aesk.dto';

@Controller('aesk')
export class AeskController {
    constructor(
        private readonly brainService: CompanyBrainService,
        private readonly cortexService: CortexService,
        private readonly sandboxService: SandboxService
    ) { }

    @Get('status')
    async getStatus() {
        return {
            status: 'ONLINE',
            mode: 'AUTONOMOUS',
            timestamp: new Date()
        };
    }

    @Post('feedback')
    async createFeedback(@Body() createFeedbackDto: CreateFeedbackDto) {
        return this.brainService.logFeedback(createFeedbackDto);
    }

    @Get('decisions')
    async getDecisions(@Query('limit') limit: string) {
        return this.brainService.getRecentDecisions(parseInt(limit) || 10);
    }

    @Post('chat')
    async chat(@Body() body: { message: string }) {
        return this.cortexService.chat(body.message);
    }

    @Post('dream')
    async dream(@Body() body: { language: 'python' | 'javascript', code: string }) {
        return this.sandboxService.execute(body.language, body.code);
    }
}
