import { prisma } from "@/lib/prisma";
import { batchResolveToPhoneJid } from "@/lib/jid-utils";
import { waManager } from "@/modules/whatsapp/manager";
import Sticker from "wa-sticker-formatter";

export class ChatService {
    /**
     * Get the active chats list for a session, including last message preview.
     */
    static async getChatsList(dbSessionId: string) {
        const contacts = await prisma.contact.findMany({
            where: { sessionId: dbSessionId },
            orderBy: { updatedAt: 'desc' },
            select: { jid: true, name: true, notify: true, profilePic: true }
        });

        const allJids = contacts.map(c => c.jid);
        const jidMap = await batchResolveToPhoneJid(allJids, dbSessionId);

        const chatList = await Promise.all(contacts.map(async (c) => {
            const normalizedJid = jidMap.get(c.jid) || c.jid;
            const lastMessage = await prisma.message.findFirst({
                where: {
                    sessionId: dbSessionId,
                    OR: [{ remoteJid: c.jid }, { remoteJid: normalizedJid }]
                },
                orderBy: { timestamp: 'desc' },
                select: { content: true, timestamp: true, type: true }
            });
            return {
                ...c,
                jid: normalizedJid,
                lastMessage: lastMessage ? {
                    content: lastMessage.content,
                    timestamp: lastMessage.timestamp,
                    type: lastMessage.type
                } : undefined
            };
        }));

        chatList.sort((a, b) => {
            const tA = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
            const tB = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
            return tB - tA;
        });

        return chatList;
    }

    /**
     * Get recent messages for a specific chat.
     */
    static async getMessages(dbSessionId: string, jid: string, take: number = 100) {
        return await prisma.message.findMany({
            where: {
                sessionId: dbSessionId,
                remoteJid: jid
            },
            orderBy: { timestamp: 'asc' },
            take
        });
    }

    /**
     * Send a text message, optionally with mentions and stickers if formatted as URL.
     */
    static async sendTextMessage(sessionId: string, jid: string, messagePayload: any, mentions?: string[]) {
        const instance = waManager.getInstance(sessionId);
        if (!instance || !instance.socket) {
            throw new Error("WhatsApp session is disconnected or not found");
        }

        let msgPayload = { ...messagePayload };

        if (msgPayload.sticker && (msgPayload.sticker.url || typeof msgPayload.sticker === 'string')) {
            const url = msgPayload.sticker.url || msgPayload.sticker;
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to fetch sticker media`);
                const buffer = await res.arrayBuffer();
                const sticker = new Sticker(Buffer.from(buffer), {
                    pack: msgPayload.sticker.pack || "WA-AKG Bot",
                    author: msgPayload.sticker.author || "WA-AKG",
                    type: "full",
                    quality: 50
                });
                msgPayload = { sticker: await sticker.toBuffer() };
            } catch (e: any) {
                throw new Error(`Failed to generate sticker from URL: ${e.message}`);
            }
        }

        if (msgPayload.text && mentions && Array.isArray(mentions)) {
            msgPayload.mentions = mentions;
        }

        return await instance.socket.sendMessage(jid, msgPayload, { mentions: mentions || [] } as any);
    }

    /**
     * Send a media message locally from a buffer.
     */
    static async sendMediaMessage(
        sessionId: string, 
        jid: string, 
        buffer: Buffer, 
        type: string, 
        mimetype: string,
        fileName: string, 
        caption: string
    ) {
        const instance = waManager.getInstance(sessionId);
        if (!instance || !instance.socket) {
            throw new Error("WhatsApp session is disconnected or not found");
        }

        const messageOptions: any = {};
        if (caption) messageOptions.caption = caption;
        messageOptions.mimetype = mimetype;
        
        let content: any = {};

        if (type === 'image') {
            content = { image: buffer, ...messageOptions };
        } else if (type === 'video') {
             content = { video: buffer, ...messageOptions };
        } else if (type === 'audio') {
             content = { audio: buffer, mimetype: 'audio/mp4', ptt: false };
        } else if (type === 'voice') {
             content = { audio: buffer, mimetype: 'audio/mp4', ptt: true };
        } else if (type === 'document') {
             content = { document: buffer, mimetype, fileName, ...messageOptions };
        } else if (type === 'sticker') {
            const sticker = new Sticker(buffer, {
                pack: "WA-AKG Bot",
                author: "WA-AKG",
                type: "full",
                quality: 50
            });
            content = { sticker: await sticker.toBuffer() };
        } else {
             content = { document: buffer, mimetype, fileName, ...messageOptions };
        }

        return await instance.socket.sendMessage(jid, content);
    }
}
