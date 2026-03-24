import { Controller, Post, Param, Body, Get, UseGuards } from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HybridAuthGuard } from '../auth/guards/hybrid-auth.guard';

@Controller('executions')
@UseGuards(HybridAuthGuard)
export class ExecutionsController {
    constructor(private readonly executionsService: ExecutionsService) { }

    @Post(':workflowId/run')
    async run(@Param('workflowId') workflowId: string, @Body() body: any, @CurrentUser() user: any) {
        return this.executionsService.executeWorkflow(workflowId, body, user?.id, Boolean(user?.isService));
    }

    @Post(':id/resume')
    async resume(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
        return this.executionsService.resumeExecution(id, body, user?.id, Boolean(user?.isService));
    }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.executionsService.findAll(user?.id, Boolean(user?.isService));
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.executionsService.findOne(id, user?.id, Boolean(user?.isService));
    }
}
