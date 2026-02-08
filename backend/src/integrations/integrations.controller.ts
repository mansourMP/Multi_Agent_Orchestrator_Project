import { Controller, Post, Body, Param, Logger, Inject, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ExecutionsService } from '../executions/executions.service';

@Controller('integrations')
export class IntegrationsController {
    private readonly logger = new Logger(IntegrationsController.name);

    constructor(
        private telegramService: TelegramService,
        @Inject(forwardRef(() => ExecutionsService))
        private executionsService: ExecutionsService
    ) { }

    @Post('telegram/webhook/:token')
    async handleTelegramWebhook(@Param('token') token: string, @Body() update: any) {
        if (!update.message || !update.message.text) return;

        const chatId = update.message.chat.id;
        const text = update.message.text;
        const username = update.message.from.username || update.message.from.first_name;

        this.logger.log(`Received Telegram message from ${username} (${chatId}): ${text}`);

        // Check if there is a pending execution waiting for this user
        const executionId = this.telegramService.getPendingExecution(chatId);

        if (executionId) {
            this.logger.log(`Resuming execution ${executionId} with reply`);
            await this.executionsService.resumeExecution(executionId, {
                decision: 'approved', // Treat reply as approval/input
                reply: text,
                source: 'telegram',
                user: username
            });

            // Ack receipt
            await this.telegramService.sendMessage(token, chatId, "✅ Input received. Resuming workflow...");
        } else {
            // No pending execution
            await this.telegramService.sendMessage(token, chatId, "I'm not waiting for any input right now. Trigger a workflow first.");
        }

        return { ok: true };
    }
}
