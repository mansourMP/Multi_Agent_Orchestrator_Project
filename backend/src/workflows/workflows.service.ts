import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import {
    type WorkflowValidationIssue,
    normalizeWorkflowDefinition,
    validateWorkflowDefinition,
} from './workflow-schema';

type WorkflowValidationSummary = {
    draftIssues: WorkflowValidationIssue[];
    publishIssues: WorkflowValidationIssue[];
    hasDraftErrors: boolean;
    hasPublishErrors: boolean;
    draftErrorCount: number;
    publishErrorCount: number;
    draftWarningCount: number;
    publishWarningCount: number;
};

@Injectable()
export class WorkflowsService {
    constructor(
        private prisma: PrismaService
    ) { }

    private isSystemActor(userId?: string | null, isService = false): boolean {
        const normalized = String(userId || '').trim();
        return isService || !normalized || normalized === 'system' || normalized.startsWith('AESK_');
    }

    private async listAccessibleWorkspaceIds(userId: string): Promise<string[]> {
        const memberships = await this.prisma.organizationMember.findMany({
            where: { userId },
            select: { organizationId: true },
        });
        const organizationIds = memberships.map((item) => item.organizationId);
        if (organizationIds.length === 0) {
            return [];
        }
        const workspaces = await this.prisma.workspace.findMany({
            where: {
                organizationId: { in: organizationIds },
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
        });
        return workspaces.map((item) => item.id);
    }

    private async resolveWorkspaceIdForActor(workspaceId: string | undefined, userId?: string, isService = false): Promise<string> {
        const requestedWorkspaceId = String(workspaceId || '').trim();
        if (this.isSystemActor(userId, isService)) {
            if (requestedWorkspaceId && requestedWorkspaceId !== 'default') {
                const workspace = await this.prisma.workspace.findUnique({ where: { id: requestedWorkspaceId } });
                if (!workspace) {
                    throw new NotFoundException(`Workspace with ID ${requestedWorkspaceId} not found`);
                }
                return workspace.id;
            }
            const ws = await this.prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
            if (ws) {
                return ws.id;
            }
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
            return newWs.id;
        }

        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) {
            throw new ForbiddenException('Authenticated user is required.');
        }

        const accessibleWorkspaceIds = await this.listAccessibleWorkspaceIds(normalizedUserId);
        if (accessibleWorkspaceIds.length === 0) {
            throw new ForbiddenException('No accessible workspace found for this user.');
        }

        if (!requestedWorkspaceId || requestedWorkspaceId === 'default') {
            return accessibleWorkspaceIds[0];
        }

        if (!accessibleWorkspaceIds.includes(requestedWorkspaceId)) {
            throw new ForbiddenException('Workspace is not accessible for this user.');
        }

        return requestedWorkspaceId;
    }

    private async getWorkflowForActor(id: string, userId?: string, isService = false) {
        const workflow = await this.prisma.workflow.findUnique({
            where: { id },
            include: {
                workspace: {
                    select: {
                        id: true,
                        organizationId: true,
                    },
                },
            },
        });
        if (!workflow) {
            throw new NotFoundException(`Workflow with ID ${id} not found`);
        }
        if (this.isSystemActor(userId, isService)) {
            return workflow;
        }
        const accessibleWorkspaceIds = await this.listAccessibleWorkspaceIds(String(userId || '').trim());
        if (!accessibleWorkspaceIds.includes(workflow.workspaceId)) {
            throw new ForbiddenException('Workflow is not accessible for this user.');
        }
        return workflow;
    }

    async create(workspaceId: string, createWorkflowDto: CreateWorkflowDto, userId: string = 'system', isService = false) {
        const finalWorkspaceId = await this.resolveWorkspaceIdForActor(workspaceId, userId, isService);
        const normalizedDefinition = normalizeWorkflowDefinition(createWorkflowDto.definition);

        const workflow = await this.prisma.workflow.create({
            data: {
                ...createWorkflowDto,
                definition: JSON.stringify(normalizedDefinition),
                workspaceId: finalWorkspaceId,
                createdBy: userId || 'system',
                status: 'draft',
            },
        });
        return this.deserializeWorkflow(workflow);
    }

    async findAll(workspaceId: string, userId?: string, isService = false) {
        const resolvedWorkspaceId = await this.resolveWorkspaceIdForActor(workspaceId, userId, isService);
        const whereClause: any = { workspaceId: resolvedWorkspaceId, status: { not: 'archived' } };

        try {
            const workflows = await this.prisma.workflow.findMany({
                where: whereClause,
                orderBy: { updatedAt: 'desc' },
            });
            return workflows.map((w: any) => this.deserializeWorkflow(w));
        } catch (e) {
            console.error("FindAll Workflows Failed:", e);
            return [];
        }
    }

    async findOne(id: string, userId?: string, isService = false) {
        const workflow = await this.getWorkflowForActor(id, userId, isService);
        return this.deserializeWorkflow(workflow);
    }

    async update(id: string, updateWorkflowDto: UpdateWorkflowDto, userId?: string, isService = false) {
        await this.getWorkflowForActor(id, userId, isService);

        const data: any = { ...updateWorkflowDto };
        if (data.definition) {
            data.definition = JSON.stringify(normalizeWorkflowDefinition(data.definition));
        }

        const workflow = await this.prisma.workflow.update({
            where: { id },
            data,
        });
        return this.deserializeWorkflow(workflow);
    }

    private buildWorkflowValidationSummary(definitionInput: unknown): WorkflowValidationSummary {
        const draftIssues = validateWorkflowDefinition(definitionInput, { forPublish: false });
        const publishIssues = validateWorkflowDefinition(definitionInput, { forPublish: true });
        const draftErrorCount = draftIssues.filter((item) => item.level === 'error').length;
        const publishErrorCount = publishIssues.filter((item) => item.level === 'error').length;
        const draftWarningCount = draftIssues.filter((item) => item.level === 'warning').length;
        const publishWarningCount = publishIssues.filter((item) => item.level === 'warning').length;
        return {
            draftIssues,
            publishIssues,
            hasDraftErrors: draftErrorCount > 0,
            hasPublishErrors: publishErrorCount > 0,
            draftErrorCount,
            publishErrorCount,
            draftWarningCount,
            publishWarningCount,
        };
    }

    private deserializeWorkflow(workflow: any) {
        let normalizedDefinition = normalizeWorkflowDefinition({});
        if (workflow && workflow.definition && typeof workflow.definition === 'string') {
            try {
                normalizedDefinition = normalizeWorkflowDefinition(JSON.parse(workflow.definition));
            } catch (e) {
                normalizedDefinition = normalizeWorkflowDefinition({});
            }
        } else if (workflow && workflow.definition) {
            normalizedDefinition = normalizeWorkflowDefinition(workflow.definition);
        }
        workflow.definition = normalizedDefinition;
        workflow.validation = this.buildWorkflowValidationSummary(normalizedDefinition);
        return workflow;
    }

    async remove(id: string, userId?: string, isService = false) {
        await this.getWorkflowForActor(id, userId, isService);
        return this.prisma.workflow.update({
            where: { id },
            data: {
                status: 'archived',
            },
        });
    }

    async publish(id: string, userId?: string, isService = false) {
        const workflow = await this.getWorkflowForActor(id, userId, isService);
        const normalizedDefinition = normalizeWorkflowDefinition(
            typeof workflow.definition === 'string' ? JSON.parse(workflow.definition) : workflow.definition,
        );
        const validation = this.buildWorkflowValidationSummary(normalizedDefinition);
        const issues = validation.publishIssues
            .filter((item) => item.level === 'error');
        if (issues.length > 0) {
            throw new BadRequestException({
                detail: 'Workflow has blocking issues.',
                issues,
                validation,
            });
        }
        const published = await this.prisma.workflow.update({
            where: { id },
            data: {
                definition: JSON.stringify(normalizedDefinition),
                status: 'published',
                publishedAt: new Date(),
            },
        });
        return this.deserializeWorkflow(published);
    }
}
