import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/messages/{sessionId}/{jid}/reply
 * Reply to a message with messageId provided in the request body
 * Uses same request format as /send: { message, mentions }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid: rawJid } = await params;
        const jid = decodeURIComponent(rawJid);

        const body = await request.json();
        const { messageId, message, mentions, fromMe } = body;

        if (!messageId) {
            return NextResponse.json({ error: "messageId is required" }, { status: 400 });
        }

        if (!message) {
            return NextResponse.json({ error: "message is required" }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ error: "Session not ready" }, { status: 503 });
        }

        // Construct the quoted message key
        const quotedMsgKey: any = {
            remoteJid: jid,
            fromMe: fromMe === true,
            id: messageId
        };

        let quotedMessageContent: any = { conversation: "" }; // Default fallback

        try {
            // Always fetch original message to build a proper quoted context for WA Web
            const originalMsg = await prisma.message.findUnique({
                where: {
                    sessionId_keyId: {
                        sessionId: sessionId,
                        keyId: messageId
                    }
                }
            });

            if (originalMsg) {
                // WA Web requires participant field for group chats
                if (jid.endsWith("@g.us") && originalMsg.senderJid) {
                    quotedMsgKey.participant = originalMsg.senderJid;
                }

                // Mock the quoted message content based on DB so WA Web displays the snippet
                switch (originalMsg.type) {
                    case 'TEXT':
                        quotedMessageContent = { conversation: originalMsg.content || "" };
                        break;
                    case 'IMAGE':
                        quotedMessageContent = { imageMessage: { caption: originalMsg.content || "" } };
                        break;
                    case 'VIDEO':
                        quotedMessageContent = { videoMessage: { caption: originalMsg.content || "" } };
                        break;
                    case 'DOCUMENT':
                        quotedMessageContent = { documentMessage: { fileName: originalMsg.content || "Document" } };
                        break;
                    case 'AUDIO':
                        quotedMessageContent = { audioMessage: {} };
                        break;
                    case 'STICKER':
                        quotedMessageContent = { stickerMessage: {} };
                        break;
                    case 'CONTACT':
                        quotedMessageContent = { contactMessage: { displayName: originalMsg.content || "" } };
                        break;
                    case 'LOCATION':
                        quotedMessageContent = { locationMessage: {} };
                        break;
                }
            }
        } catch (dbError) {
            console.warn("Could not fetch original message for quoted reply context:", dbError);
        }

        const quotedMsg = {
            key: quotedMsgKey,
            message: quotedMessageContent
        };

        // Process message payload (same as /send)
        let msgPayload = message;

        if (msgPayload.text && mentions && Array.isArray(mentions)) {
            msgPayload.mentions = mentions;
        }

        // Send the reply with quoted reference
        await instance.socket.sendMessage(jid, msgPayload, {
            quoted: quotedMsg as any
        });

        return NextResponse.json({ success: true, message: "Message sent successfully" });

    } catch (error) {
        console.error("Reply message error:", error);
        return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
    }
}
