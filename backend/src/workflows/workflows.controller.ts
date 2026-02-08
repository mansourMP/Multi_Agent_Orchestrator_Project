import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('workflows')
// @UseGuards(JwtAuthGuard)
export class WorkflowsController {
    constructor(private readonly workflowsService: WorkflowsService) { }

    @Post()
    create(
        @Body() createWorkflowDto: CreateWorkflowDto,
        @Query('workspaceId') workspaceId: string,
        @CurrentUser() user: any,
    ) {
        const userId = user ? user.id : 'dev-user-id';
        return this.workflowsService.create(workspaceId, createWorkflowDto, userId);
    }

    @Get()
    findAll(@Query('workspaceId') workspaceId: string) {
        return this.workflowsService.findAll(workspaceId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.workflowsService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateWorkflowDto: UpdateWorkflowDto) {
        return this.workflowsService.update(id, updateWorkflowDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.workflowsService.remove(id);
    }

    @Post(':id/publish')
    publish(@Param('id') id: string) {
        return this.workflowsService.publish(id);
    }
}
