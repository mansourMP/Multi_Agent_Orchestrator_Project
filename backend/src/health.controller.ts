import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
    @Get()
    getRoot() {
        return {
            status: 'ok',
            name: 'AgentForge API',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            frozen: true,
            endpoints: {
                workflows: '/workflows',
                executions: 'frozen_legacy_backend',
                auth: '/api/v1/auth',
                agents: '/api/v1/agents',
            }
        };
    }

    @Get('health')
    getHealth() {
        return {
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    }
}
