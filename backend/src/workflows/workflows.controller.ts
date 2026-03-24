import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HybridAuthGuard } from '../auth/guards/hybrid-auth.guard';

@Controller('workflows')
@UseGuards(HybridAuthGuard)
export class WorkflowsController {
    constructor(private readonly workflowsService: WorkflowsService) { }

    @Post()
    create(
        @Body() createWorkflowDto: CreateWorkflowDto,
        @Query('workspaceId') workspaceId: string,
        @CurrentUser() user: any,
    ) {
        return this.workflowsService.create(workspaceId, createWorkflowDto, user?.id, Boolean(user?.isService));
    }

    @Get()
    findAll(@Query('workspaceId') workspaceId: string, @CurrentUser() user: any) {
        return this.workflowsService.findAll(workspaceId, user?.id, Boolean(user?.isService));
    }

    @Get(':id')
    findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.workflowsService.findOne(id, user?.id, Boolean(user?.isService));
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateWorkflowDto: UpdateWorkflowDto, @CurrentUser() user: any) {
        return this.workflowsService.update(id, updateWorkflowDto, user?.id, Boolean(user?.isService));
    }

    @Delete(':id')
    remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.workflowsService.remove(id, user?.id, Boolean(user?.isService));
    }

    @Post(':id/publish')
    publish(@Param('id') id: string, @CurrentUser() user: any) {
        return this.workflowsService.publish(id, user?.id, Boolean(user?.isService));
    }
}
