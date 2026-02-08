import { Controller, Post, Body, Res } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { SquadConfig } from './agent.types';
import { Response } from 'express';

@Controller('agents')
export class AgentsController {
    constructor(private readonly agentsService: AgentsService) { }

    @Post('squad/stream')
    async streamSquad(@Body() config: SquadConfig, @Res() res: Response) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        try {
            const stream = await this.agentsService.startSquadSession(config);

            for await (const chunk of stream) {
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
        } catch (error) {
            console.error('Stream error:', error);
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        } finally {
            res.end();
        }
    }
}

