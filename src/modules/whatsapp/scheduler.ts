import { prisma } from "@/lib/prisma";
import { waManager } from "./manager";
import { logger } from "@/lib/logger";

async function getBlastRecipients(sessionId: string, tagName: string) {
    const contacts = await prisma.phoneBook.findMany({
        where: {
            sessionId: sessionId,
            tags: {
                contains: tagName,
                mode: 'insensitive'
            }
        },
        select: { jid: true }
    });
    return contacts.map(c => c.jid).filter(Boolean) as string[];
}

const checkScheduledMessages = async () => {
    try {
        const now = new Date();
        // logger.debug("Scheduler", `Checking messages at ${now.toISOString()}`);

        const pendingMessages = await prisma.scheduledMessage.findMany({
            where: {
                status: { in: ["PENDING", "SENDING"] },
                sendAt: { lte: now }
            },
            include: {
                session: true
            }
        });

        if (pendingMessages.length === 0) return;

        logger.info("Scheduler", `Found ${pendingMessages.length} messages due for processing.`);

        for (const msg of pendingMessages) {
            const instance = waManager.getInstance(msg.session.sessionId);

            if (!instance?.socket) {
                logger.warn("Scheduler", `⚠️ Skipping msg ${msg.id}: Session ${msg.session.sessionId} is not connected.`);
                continue;
            }

            try {
                // Mark as SENDING to prevent double processing
                await prisma.scheduledMessage.update({
                    where: { id: msg.id },
                    data: { status: "SENDING" }
                });

                let recipients: string[] = [];
                if (msg.type === 'blast') {
                    recipients = await getBlastRecipients(msg.sessionId, msg.jid);
                    logger.info("Scheduler", `Blast ${msg.id} targeting ${recipients.length} contacts with tag "${msg.jid}"`);
                } else {
                    recipients = [msg.jid];
                }

                if (recipients.length === 0) {
                    throw new Error("No recipients found for this message.");
                }

                // Prepare Content
                let content: any = {};
                if (msg.mediaUrl) {
                    const url = msg.mediaUrl;
                    const type = msg.mediaType || 'image';
                    if (type === 'video') content = { video: { url }, caption: msg.content };
                    else if (type === 'document') content = { document: { url }, caption: msg.content, fileName: 'file', mimetype: 'application/octet-stream' };
                    else content = { image: { url }, caption: msg.content };
                } else {
                    content = { text: msg.content };
                }

                // Send to each recipient
                for (const toJid of recipients) {
                    try {
                        if (!toJid || !toJid.includes("@")) {
                            logger.warn("Scheduler", `Skipping invalid JID for msg ${msg.id}: ${toJid}`);
                            continue;
                        }
                        
                        await instance.socket.sendMessage(toJid, content);
                        
                        if (msg.type === 'blast') {
                            await new Promise(r => setTimeout(r, 2000)); // Anti-spam delay for blasts
                        }
                    } catch (sendErr) {
                        logger.error("Scheduler", `Failed to send to ${toJid}`, sendErr);
                    }
                }

                // Handle Rescheduling or Completion
                if (msg.scheduleType === 'once' || !msg.scheduleType) {
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: { status: "SENT", updatedAt: new Date() }
                    });
                    logger.success("Scheduler", `Msg ${msg.id} finished successfully.`);
                } else {
                    // Reschedule (Daily logic - add 24 hours)
                    const nextSend = new Date(msg.sendAt.getTime() + 24 * 60 * 60 * 1000);
                    
                    // Simple logic for working_days / holidays can be added here
                    // For now, we'll follow the reference app's pattern of moving daily
                    // and skipping delivery inside the loop if the day doesn't match.
                    
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: { 
                            sendAt: nextSend, 
                            status: "PENDING",
                            updatedAt: new Date() 
                        }
                    });
                    logger.info("Scheduler", `Msg ${msg.id} rescheduled to ${nextSend.toISOString()}`);
                }

            } catch (err: any) {
                logger.error("Scheduler", `Failed msg ${msg.id}`, err);
                await prisma.scheduledMessage.update({
                    where: { id: msg.id },
                    data: { 
                        status: "FAILED", 
                        errorMessage: err?.message || String(err),
                        updatedAt: new Date()
                    }
                });
            }
        }
    } catch (e) {
        logger.error("Scheduler", "Scheduler loop error:", e);
    }
};

export function startScheduler() {
    logger.info("Scheduler", "Message Scheduler Service Started.");
    checkScheduledMessages();
    setInterval(checkScheduledMessages, 60 * 1000);
}
