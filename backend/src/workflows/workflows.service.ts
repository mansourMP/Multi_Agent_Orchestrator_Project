import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

@Injectable()
export class WorkflowsService {
    constructor(
        private prisma: PrismaService
    ) { }

    async create(workspaceId: string, createWorkflowDto: CreateWorkflowDto, userId: string = 'system') {
        let finalWorkspaceId = workspaceId;

        // Handle "default" workspace ID
        if (workspaceId === 'default') {
            const ws = await this.prisma.workspace.findFirst();
            if (ws) {
                finalWorkspaceId = ws.id;
            } else {
                // Create a default workspace if none exists
                const newWs = await this.prisma.workspace.create({
                    data: {
                        name: 'Default Workspace',
                        organization: {
                            create: {
                                name: 'Default Org',
                                slug: 'default-org-' + Date.now(),
                            }
                        }
                    }
                });
                finalWorkspaceId = newWs.id;
            }
        }

        return this.prisma.workflow.create({
            data: {
                ...createWorkflowDto,
                definition: JSON.stringify(createWorkflowDto.definition),
                workspaceId: finalWorkspaceId,
                createdBy: userId || 'system',
                status: 'draft',
            },
        });
    }

    async findAll(workspaceId: string) {
        let whereClause: any = { workspaceId, status: { not: 'archived' } };

        if (workspaceId === 'default') {
            // If default, try to find the first workspace to filter by, or just return all
            const ws = await this.prisma.workspace.findFirst();
            if (ws) {
                whereClause = { workspaceId: ws.id, status: { not: 'archived' } };
            } else {
                whereClause = { status: { not: 'archived' } }; // Return all non-archived if no workspace found/created yet
            }
        }

        try {
            const workflows = await this.prisma.workflow.findMany({
                where: whereClause,
                orderBy: { updatedAt: 'desc' },
            });
            return workflows.map(w => this.deserializeWorkflow(w));
        } catch (e) {
            console.error("FindAll Workflows Failed:", e);
            return [];
        }
    }

    async findOne(id: string) {
        console.log(`DEBUG: findOne called for ${id}`);
        try {
            const workflow = await this.prisma.workflow.findUnique({
                where: { id },
            });
            console.log(`DEBUG: findOne result:`, workflow ? 'FOUND' : 'NULL');
            if (!workflow) throw new NotFoundException(`Workflow with ID ${id} not found`);
            const result = this.deserializeWorkflow(workflow);
            console.log(`DEBUG: findOne deserialized`);
            return result;
        } catch (e) {
            console.error(`DEBUG: findOne ERROR:`, e);
            throw e;
        }
    }

    async update(id: string, updateWorkflowDto: UpdateWorkflowDto) {
        await this.findOne(id);

        const data: any = { ...updateWorkflowDto };
        if (data.definition) {
            data.definition = JSON.stringify(data.definition);
        }

        const workflow = await this.prisma.workflow.update({
            where: { id },
            data,
        });
        return this.deserializeWorkflow(workflow);
    }

    private deserializeWorkflow(workflow: any) {
        if (workflow && workflow.definition && typeof workflow.definition === 'string') {
            try {
                workflow.definition = JSON.parse(workflow.definition);
            } catch (e) {
                workflow.definition = {};
            }
        }
        return workflow;
    }

    async remove(id: string) {
        await this.findOne(id);
        return this.prisma.workflow.update({
            where: { id },
            data: {
                status: 'archived',
            },
        });
    }

    async publish(id: string) {
        // Native Activation: Just mark as Published
        return this.prisma.workflow.update({
            where: { id },
            data: {
                status: 'published',
                publishedAt: new Date(),
            },
        });
    }
}
