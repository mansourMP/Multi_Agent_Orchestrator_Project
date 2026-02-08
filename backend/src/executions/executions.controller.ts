import { Controller, Post, Param, Body, Get, UseGuards } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('executions')
// @UseGuards(JwtAuthGuard)
export class ExecutionsController {
    constructor(private readonly executionsService: ExecutionsService) { }

    @Post(':workflowId/run')
    async run(@Param('workflowId') workflowId: string, @Body() body: any) {
        return this.executionsService.executeWorkflow(workflowId, body);
    }

    @Post(':id/resume')
    async resume(@Param('id') id: string, @Body() body: any) {
        return this.executionsService.resumeExecution(id, body);
    }

    @Get()
    async findAll() {
        return this.executionsService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.executionsService.findOne(id);
    }
}
