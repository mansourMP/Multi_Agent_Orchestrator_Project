import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    // In-memory map of ChatID -> ExecutionID
    // In production, use Redis or Database
    private activeConversations: Map<string, string> = new Map();

    constructor(private configService: ConfigService) { }

    /**
     * Set the Telegram Webhook to point to our backend
     */
    async setWebhook(token: string, baseUrl: string) {
        const url = `https://api.telegram.org/bot${token}/setWebhook?url=${baseUrl}/api/v1/integrations/telegram/webhook/${token}`;
        try {
            await fetch(url);
            this.logger.log(`Telegram webhook set to ${baseUrl}/api/v1/integrations/telegram/webhook/${token}`);
        } catch (e) {
            this.logger.error(`Failed to set webhook: ${e.message}`);
        }
    }

    async sendMessage(token: string, chatId: string, text: string) {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    }

    /**
     * Register that a specific chat user is expected to reply to a specific execution
     */
    registerPendingReply(chatId: string, executionId: string) {
        this.activeConversations.set(chatId.toString(), executionId);
        this.logger.log(`Registered pending reply for ChatID ${chatId} -> Execution ${executionId}`);
    }

    /**
     * Get the execution waiting for this user
     */
    getPendingExecution(chatId: string): string | undefined {
        const execId = this.activeConversations.get(chatId.toString());
        if (execId) {
            this.activeConversations.delete(chatId.toString()); // Clear after consuming
        }
        return execId;
    }
}
