import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CompanyBrainService } from './company-brain.service';
import { PulseService } from './pulse.service';
import { CortexService } from './cortex.service';

@Injectable()
export class AutonomousOrchestratorService implements OnModuleInit {
    private readonly logger = new Logger(AutonomousOrchestratorService.name);
    private isRunning = false;
    private loopIntervalMs = 15000; // 15 seconds

    constructor(
        private brain: CompanyBrainService,
        private pulse: PulseService,
        private cortex: CortexService,
    ) { }

    onModuleInit() {
        this.logger.log('AESK Orchestrator initialized. Starting autonomous loop...');
        this.startLoop();
    }

    private async startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;

        while (this.isRunning) {
            try {
                await this.runCycle();
                // Sleep for interval
                await new Promise((resolve) => setTimeout(resolve, this.loopIntervalMs));
            } catch (error) {
                this.logger.error('Orchestrator cycle failed', error);
                await new Promise((resolve) => setTimeout(resolve, 60000));
            }
        }
    }

    private async runCycle() {
        // PHASE 1: LISTEN (Pulse)
        // Scan for new signals from the environment
        await this.pulse.scanEnvironment();

        // PHASE 2: THINK (Cortex)
        // Analyze pending signals and decide what to do
        const decisions = await this.cortex.analyze([]);

        // PHASE 3: ACT (Hands)
        if (decisions.length > 0) {
            for (const decision of decisions) {
                await this.cortex.executeDecision(decision);
            }
        }
    }

    stopLoop() {
        this.isRunning = false;
    }
}
