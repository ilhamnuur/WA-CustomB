import { prisma } from "@/lib/prisma";
import type { WASocket } from "@whiskeysockets/baileys";
import { normalizeMessageContent } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";
import moment from "moment-timezone";


// Helper for permission check (Deduplicate from command-handler if possible, but keep simple here)
function canAutoReply(config: any, fromMe: boolean, senderJid: string): boolean {
    if (!config || !config.enabled) return false;

    // Auto Reply Specific Mode
    const mode = config.autoReplyMode || 'ALL';

    if (fromMe) {
        // If mode is OWNER, it triggers for ME? 
        // Auto Reply usually replies TO someone. 
        // If I send a message, and mode is OWNER, should it reply to me? 
        // User requested "Self Mode" -> Use case: Snippets.
        // So yes, if fromMe checks out.

        // However, standard auto-reply logic (replying to incoming) should be blocked if fromMe is true AND mode is ALL?
        // No, typically Auto Reply doesn't trigger on own messages to prevent unexpected loops.
        // But for "Self Mode" (Macros), it MUST trigger on own messages.

        if (mode === 'OWNER') return true;
        if (mode === 'ALL') return false; // Standard auto-reply ignores self

        // Specific? 
        return false;
    } else {
        // Incoming message from others
        if (mode === 'OWNER') return false; // Owner only acts on Owner messages
        if (mode === 'ALL') return true;

        if (mode === 'SPECIFIC') {
            const allowedJids = config.autoReplyAllowedJids || [];
            if (Array.isArray(allowedJids)) {
                return allowedJids.some((jid: string) => senderJid.includes(jid));
            }
        }

        if (mode === 'BLACKLIST') {
            const blockedJids = config.autoReplyBlockedJids || [];
            if (Array.isArray(blockedJids)) {
                const isBlocked = blockedJids.some((jid: string) => senderJid.includes(jid));
                return !isBlocked; // Return true if NOT blocked
            }
            return true; // If blacklist empty, allow all
        }
    }

    return false;
}

async function isRuleActive(rule: any): Promise<boolean> {
    const sysConfig = await prisma.systemConfig.findUnique({
        where: { id: 'default' }
    });
    const timezone = sysConfig?.timezone || 'Asia/Jakarta';
    
    const now = moment().tz(timezone);
    const day = now.day(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    if (rule.isActive === false) return false;
    
    // Check Days
    if (rule.activeDays === 'work_days') {
        // Monday (1) to Friday (5)
        if (day === 0 || day === 6) return false;
    } else if (rule.activeDays === 'weekend') {
        // Saturday (6) and Sunday (0)
        if (day !== 0 && day !== 6) return false;
    }
    
    // Check Hours
    if (rule.startTime && rule.endTime) {
        const currentTime = now.hours() * 60 + now.minutes();
        
        const [startH, startM] = rule.startTime.split(':').map(Number);
        const [endH, endM] = rule.endTime.split(':').map(Number);
        
        const startTimeInMinutes = startH * 60 + startM;
        const endTimeInMinutes = endH * 60 + endM;
        
        // Handle overnight shifts if needed? 
        // For now assume simple same-day range (e.g. 08:00 to 17:00)
        if (startTimeInMinutes < endTimeInMinutes) {
            if (currentTime < startTimeInMinutes || currentTime > endTimeInMinutes) {
                return false;
            }
        } else {
            // Overnight (e.g. 22:00 to 05:00)
            if (currentTime < startTimeInMinutes && currentTime > endTimeInMinutes) {
                return false;
            }
        }
    }
    
    return true;
}


export async function bindAutoReply(sock: WASocket, sessionId: string) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        // Fetch session ID and Bot Config once per batch (optimization)
        const session = await prisma.session.findUnique({
            where: { sessionId },
            // @ts-ignore
            include: { botConfig: true }
        });

        if (!session) return;

        // @ts-ignore
        let config = (session as any).botConfig;

        if (!config) {
            logger.warn("AutoReply", "No config found, creating default...");
            config = await prisma.botConfig.create({
                data: {
                    sessionId: session.id,
                    enabled: true,
                    botMode: 'OWNER',
                    autoReplyMode: 'ALL'
                }
            });
        }

        logger.debug("AutoReply", `Processing for ${sessionId}. Config: ${config ? "Found" : "Missing"}, ${config?.enabled ? "Enabled" : "Disabled"}`);

        if (!config || !config.enabled) return;

        for (const msg of messages) {
            const fromMe = msg.key.fromMe || false;
            const remoteJid = msg.key.remoteJid;

            // Standardized Sender Logic
            const isGroup = remoteJid?.endsWith("@g.us") || false;
            const remoteJidAlt = msg.key.remoteJidAlt;
            let senderJid = (isGroup ? (msg.key.participant || msg.participant) : remoteJid);

            if (!isGroup && remoteJidAlt) {
                senderJid = remoteJidAlt;
            }

            if (!remoteJid || !senderJid) continue;

            // Check Permissions
            if (!canAutoReply(config, fromMe, senderJid)) continue;

            const content = normalizeMessageContent(msg.message);
            const text = content?.conversation || content?.extendedTextMessage?.text || ""; // Caption?

            if (!text) continue;

            try {
                // Fetch rules for this session
                const rules = await prisma.autoReply.findMany({
                    where: {
                        session: {
                            sessionId: sessionId
                        }
                    }
                });

                for (const rule of rules) {
                    let match = false;
                    const keyword = rule.keyword.toLowerCase();
                    const incoming = text.toLowerCase();

                    switch (rule.matchType) {
                        case 'EXACT':
                            match = incoming === keyword;
                            break;
                        case 'CONTAINS':
                            match = incoming.includes(keyword);
                            break;
                        case 'REGEX':
                            try {
                                const regex = new RegExp(rule.keyword, 'i');
                                match = regex.test(text); // Use original case for regex
                            } catch (e) {
                                logger.error("AutoReply", "Invalid regex in auto-reply", rule.keyword);
                            }
                            break;
                    }

                    if (match) {
                        // Check Scheduling
                        const active = await isRuleActive(rule);
                        if (!active) {
                            logger.debug("AutoReply", `Match found for ${rule.keyword} but rule is not active at this time.`);
                            continue;
                        }

                        // Check trigger context (GROUP, PRIVATE, or ALL)

                        const isGroup = remoteJid.endsWith('@g.us');
                        const triggerType = (rule as any).triggerType || 'ALL'; // Default to ALL if undefined

                        if (triggerType === 'GROUP' && !isGroup) continue;
                        if (triggerType === 'PRIVATE' && isGroup) continue;

                        logger.info("AutoReply", `Match: ${rule.keyword} -> ${remoteJid}`);

                        if (rule.isMedia && rule.mediaUrl) {
                            const url = rule.mediaUrl;
                            const isVideo = url.endsWith('.mp4') || url.endsWith('.avi') || url.endsWith('.mov');
                            const isDocument = url.endsWith('.pdf') || url.endsWith('.doc') || url.endsWith('.docx') || url.endsWith('.zip');

                            if (isVideo) {
                                await sock.sendMessage(remoteJid, {
                                    video: { url },
                                    caption: rule.response
                                }, { quoted: msg });
                            } else if (isDocument) {
                                await sock.sendMessage(remoteJid, {
                                    document: { url },
                                    caption: rule.response,
                                    mimetype: 'application/octet-stream', // Default mimetype
                                    fileName: url.split('/').pop() || 'document'
                                }, { quoted: msg });
                            } else {
                                // Default to Image
                                await sock.sendMessage(remoteJid, {
                                    image: { url },
                                    caption: rule.response
                                }, { quoted: msg });
                            }
                        } else {
                            await sock.sendMessage(remoteJid, { text: rule.response }, { quoted: msg });
                        }

                        break;
                    }
                }

            } catch (e) {
                logger.error("AutoReply", "Error executing auto-reply", e);
            }
        }
    });
}
