import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeedbackDto, CreateDecisionDto } from '../dto/aesk.dto';

@Injectable()
export class CompanyBrainService {
    constructor(private prisma: PrismaService) { }

    //Configs
    async getConfig(organizationId: string) {
        return this.prisma.aESKConfig.upsert({
            where: { organizationId },
            update: {},
            create: {
                organizationId,
                enabled: true,
                budgetDailyUsd: 50.0,
            }
        });
    }

    // Feedback Operations
    async logFeedback(data: CreateFeedbackDto) {
        return this.prisma.feedback.create({
            data: {
                organizationId: data.organizationId,
                source: data.source,
                content: data.content,
                sentimentScore: data.sentimentScore,
                metadata: data.metadata ? JSON.stringify(data.metadata) : '{}',
                status: 'pending',
            },
        });
    }

    async getPendingFeedback() {
        return this.prisma.feedback.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'asc' },
        });
    }

    async updateFeedbackStatus(id: string, status: string) {
        return this.prisma.feedback.update({
            where: { id },
            data: { status },
        });
    }

    // Decision Operations
    async logDecision(data: CreateDecisionDto) {
        return this.prisma.decision.create({
            data: {
                organizationId: data.organizationId,
                agentName: data.agentName,
                actionType: data.actionType,
                reasoning: data.reasoning,
                priority: data.priority || 'MEDIUM',
                status: 'pending',
            },
        });
    }

    async getRecentDecisions(limit = 10) {
        return this.prisma.decision.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                feedback: true,
                workflowExecution: true,
            },
        });
    }

    // Metrics
    async logMetric(organizationId: string, metricName: string, value: number, unit: string) {
        return this.prisma.companyMetric.create({
            data: {
                organizationId,
                metricName,
                value,
                unit,
            },
        });
    }
}
