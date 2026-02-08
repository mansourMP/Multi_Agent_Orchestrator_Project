import { Controller, Post, Body } from '@nestjs/common';
import { ResearchAgentService } from './research-agent.service';

class ResearchTopicDto {
    topic: string;
    depth?: 'quick' | 'standard' | 'deep';
    focus?: 'general' | 'trends' | 'competitors' | 'technical';
    context?: string;
}

class ResearchCompetitorDto {
    companyName: string;
    aspects: Array<'pricing' | 'features' | 'marketing' | 'technology' | 'reviews'>;
}

class ResearchMarketDto {
    industry: string;
    region?: string;
    timeframe?: string;
}

@Controller('research-agent')
export class ResearchAgentController {
    constructor(private readonly researchAgent: ResearchAgentService) { }

    @Post('research')
    async research(@Body() dto: ResearchTopicDto) {
        return this.researchAgent.researchTopic({
            topic: dto.topic,
            depth: dto.depth || 'standard',
            focus: dto.focus,
            context: dto.context
        });
    }

    @Post('competitor')
    async researchCompetitor(@Body() dto: ResearchCompetitorDto) {
        return this.researchAgent.researchCompetitor(dto);
    }

    @Post('market')
    async researchMarket(@Body() dto: ResearchMarketDto) {
        return this.researchAgent.researchMarket(dto);
    }
}
