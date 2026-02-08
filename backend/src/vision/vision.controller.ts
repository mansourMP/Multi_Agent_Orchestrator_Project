import { Controller, Post, Body } from '@nestjs/common';
import { VisionService } from './vision.service';

class AnalyzeScreenshotDto {
    imageUrl: string;
    task: string;
    analysisType?: 'ui-audit' | 'competitor-analysis' | 'accessibility' | 'general';
}

class AnalyzeWorkflowDto {
    screenshots: Array<{ url: string; step: string }>;
    goal: string;
}

class CompareScreenshotsDto {
    imageUrl1: string;
    imageUrl2: string;
    comparisonGoal: string;
}

@Controller('vision')
export class VisionController {
    constructor(private readonly visionService: VisionService) { }

    @Post('analyze')
    async analyzeScreenshot(@Body() dto: AnalyzeScreenshotDto) {
        return this.visionService.analyzeScreenshot(
            dto.imageUrl,
            dto.task,
            dto.analysisType || 'general'
        );
    }

    @Post('analyze-workflow')
    async analyzeWorkflow(@Body() dto: AnalyzeWorkflowDto) {
        return this.visionService.analyzeWorkflow(dto.screenshots, dto.goal);
    }

    @Post('compare')
    async compareScreenshots(@Body() dto: CompareScreenshotsDto) {
        return this.visionService.compareScreenshots(
            dto.imageUrl1,
            dto.imageUrl2,
            dto.comparisonGoal
        );
    }
}
