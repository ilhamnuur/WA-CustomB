import { prisma } from "@/lib/prisma";

interface AntiSpamConfig {
    antiSpamEnabled: boolean;
    spamLimit: number;
    spamInterval: number;
    spamDelayMin: number;
    spamDelayMax: number;
}

class AntiSpamManager {
    private static instance: AntiSpamManager;
    private sessionHistory: Map<string, number[]> = new Map();
    private sessionQueues: Map<string, Promise<any>> = new Map();
    private configCache: Map<string, { config: AntiSpamConfig | null; cachedAt: number }> = new Map();

    private constructor() { }

    static getInstance() {
        if (!AntiSpamManager.instance) {
            AntiSpamManager.instance = new AntiSpamManager();
        }
        return AntiSpamManager.instance;
    }

    /**
     * Core method: apply anti-spam delay before sending a message.
     * Call this BEFORE every sendMessage call.
     */
    async applyDelay(sessionId: string): Promise<void> {
        const config = await this.getAntiSpamConfig(sessionId);

        if (!config || !config.antiSpamEnabled) {
            return; // Anti-spam disabled, no delay
        }

        // Ensure per-session queue exists
        if (!this.sessionQueues.has(sessionId)) {
            this.sessionQueues.set(sessionId, Promise.resolve());
        }

        const currentQueue = this.sessionQueues.get(sessionId)!;

        const delayPromise = currentQueue.then(async () => {
            const now = Date.now();
            const history = this.sessionHistory.get(sessionId) || [];

            // Clean up: keep only messages within the time window
            const windowStart = now - (config.spamInterval * 1000);
            const recentMessages = history.filter(ts => ts > windowStart);

            if (recentMessages.length >= config.spamLimit) {
                // Rate limit reached — apply random delay
                const delay = Math.floor(
                    Math.random() * (config.spamDelayMax - config.spamDelayMin + 1)
                ) + config.spamDelayMin;

                console.log(
                    `[Anti-Spam] Session ${sessionId}: Rate limit hit (${recentMessages.length}/${config.spamLimit} msgs in ${config.spamInterval}s). Delaying by ${delay}ms`
                );

                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Record this message timestamp
            recentMessages.push(Date.now());
            this.sessionHistory.set(sessionId, recentMessages);
        });

        this.sessionQueues.set(sessionId, delayPromise.catch(() => { }));
        await delayPromise;
    }

    /**
     * Fetch anti-spam config with 10-second cache to avoid hammering the DB.
     */
    private async getAntiSpamConfig(sessionId: string): Promise<AntiSpamConfig | null> {
        const cached = this.configCache.get(sessionId);
        if (cached && (Date.now() - cached.cachedAt) < 10000) {
            return cached.config;
        }

        try {
            // Use raw query to bypass Prisma client type issues
            const results: any[] = await prisma.$queryRawUnsafe(
                `SELECT bc.antiSpamEnabled, bc.spamLimit, bc.spamInterval, bc.spamDelayMin, bc.spamDelayMax
                 FROM BotConfig bc
                 INNER JOIN Session s ON s.id = bc.sessionId
                 WHERE s.sessionId = ?`,
                sessionId
            );

            if (results.length === 0) {
                this.configCache.set(sessionId, { config: null, cachedAt: Date.now() });
                return null;
            }

            const row = results[0];
            const config: AntiSpamConfig = {
                antiSpamEnabled: Boolean(row.antiSpamEnabled),
                spamLimit: Number(row.spamLimit) || 5,
                spamInterval: Number(row.spamInterval) || 10,
                spamDelayMin: Number(row.spamDelayMin) || 1000,
                spamDelayMax: Number(row.spamDelayMax) || 3000,
            };

            this.configCache.set(sessionId, { config, cachedAt: Date.now() });
            return config;
        } catch (error) {
            console.error(`[Anti-Spam] Error fetching config for ${sessionId}:`, error);
            this.configCache.set(sessionId, { config: null, cachedAt: Date.now() });
            return null;
        }
    }

    /**
     * Clear cache for a session (call when config is updated)
     */
    clearCache(sessionId: string) {
        this.configCache.delete(sessionId);
    }
}

export const antispam = AntiSpamManager.getInstance();
