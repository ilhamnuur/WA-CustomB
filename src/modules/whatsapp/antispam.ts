import { WASocket, AnyMessageContent, MiscMessageGenerationOptions } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";

class AntiSpamManager {
    private static instance: AntiSpamManager;
    private sessionHistory: Map<string, number[]> = new Map();
    private sessionQueues: Map<string, Promise<any>> = new Map();

    private constructor() { }

    static getInstance() {
        if (!AntiSpamManager.instance) {
            AntiSpamManager.instance = new AntiSpamManager();
        }
        return AntiSpamManager.instance;
    }

    /**
     * Wraps the socket.sendMessage to add Anti-Spam delays
     */
    async wrap(socket: WASocket, sessionId: string) {
        const originalSendMessage = socket.sendMessage.bind(socket);

        socket.sendMessage = async (
            jid: string,
            content: AnyMessageContent,
            options?: MiscMessageGenerationOptions
        ) => {
            // Get current config for this session
            const botConfig = await this.getBotConfig(sessionId) as any;

            if (!botConfig || !botConfig.antiSpamEnabled) {
                return originalSendMessage(jid, content, options);
            }

            // Implementation of per-session queue to prevent simultaneous burst
            // Even with individual delays, a queue ensures strict ordering and staggering
            if (!this.sessionQueues.has(sessionId)) {
                this.sessionQueues.set(sessionId, Promise.resolve());
            }

            const currentQueue = this.sessionQueues.get(sessionId)!;

            const nextInQueue = currentQueue.then(async () => {
                const now = Date.now();
                const history = this.sessionHistory.get(sessionId) || [];

                // Clean up history (older than interval)
                const windowStart = now - (botConfig.spamInterval * 1000);
                const recentMessages = history.filter(ts => ts > windowStart);

                if (recentMessages.length >= botConfig.spamLimit) {
                    // Limit reached! Calculate random delay
                    const delay = Math.floor(Math.random() * (botConfig.spamDelayMax - botConfig.spamDelayMin + 1)) + botConfig.spamDelayMin;

                    console.log(`[Anti-Spam] Session ${sessionId}: Limit reached (${recentMessages.length}/${botConfig.spamLimit}). Delaying message by ${delay}ms...`);

                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                // Update history with the actual send time (after delay)
                const updatedHistory = this.sessionHistory.get(sessionId) || [];
                updatedHistory.push(Date.now());
                // Keep history lean
                this.sessionHistory.set(sessionId, updatedHistory.filter(ts => ts > (Date.now() - 60000))); // Keep last 1 min max

                return originalSendMessage(jid, content, options);
            });

            this.sessionQueues.set(sessionId, nextInQueue.catch(() => { })); // Prevent queue breakage on error
            return nextInQueue;
        };
    }

    private async getBotConfig(sessionId: string) {
        try {
            // We fetch by sessionId (the string UUID/Name used in the app)
            // Note: In our schema BotConfig is linked to Session via ID (cuid), 
            // but the API often uses sessionId (the human readable string).
            const session = await prisma.session.findUnique({
                where: { sessionId },
                select: { id: true, botConfig: true }
            });
            return session?.botConfig;
        } catch (error) {
            console.error(`[Anti-Spam] Error fetching config for ${sessionId}:`, error);
            return null;
        }
    }
}

export const antispam = AntiSpamManager.getInstance();
