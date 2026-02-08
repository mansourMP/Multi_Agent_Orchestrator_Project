import { Injectable, Logger } from '@nestjs/common';
import { CompanyBrainService } from './company-brain.service';

@Injectable()
export class PulseService {
    private readonly logger = new Logger(PulseService.name);

    constructor(private brain: CompanyBrainService) { }

    async scanEnvironment() {
        // In a real app, this would fetch from Twitter API, Email, Sentry, etc.
        // For MVP, we'll simulate random incoming signals to test the Cortex.

        const signals = [];

        // 1. Simulate finding a random signal (50% chance)
        if (Math.random() > 0.5) {
            const mockSignals = [
                { source: 'twitter', content: '@ConductorApp My login is crashing on iOS 17! Fix it!', sentiment: -0.8 },
                { source: 'appstore', content: 'Great app, but I wish it had dark mode.', sentiment: 0.2 },
                { source: 'email', content: 'Urgent: API billing is incorrect.', sentiment: -0.6 },
                { source: 'system', content: 'Error rate spiked to 5% in module Auth.', sentiment: -1.0 },
                { source: 'internal', content: 'Competitor X just launched a new AI feature.', sentiment: 0.0 }
            ];

            const randomSignal = mockSignals[Math.floor(Math.random() * mockSignals.length)];

            // Check if we already have this exact content pending to avoid dupes
            // (Simplified check)
            const exists = await this.brain.getPendingFeedback();
            const isDuplicate = exists.some((f: any) => f.content === randomSignal.content);

            if (!isDuplicate) {
                this.logger.log(`📡 [PULSE] Detected signal from ${randomSignal.source}: "${randomSignal.content}"`);

                await this.brain.logFeedback({
                    organizationId: 'default-org', // TODO: Dynamic Org
                    source: randomSignal.source,
                    content: randomSignal.content,
                    sentimentScore: randomSignal.sentiment,
                    metadata: { detectedAt: new Date() }
                });

                signals.push(randomSignal);
            }
        }

        return signals;
    }
}
