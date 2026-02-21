import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";

/**
 * POST /api/messages/{sessionId}/{jid}/reply
 * Reply to a message with messageId provided in the request body
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
        const { messageId, text, image, caption, fromMe, mentions } = body;

        if (!messageId) {
            return NextResponse.json({ error: "messageId is required" }, { status: 400 });
        }

        // At least one message content is required
        if (!text && !image) {
            return NextResponse.json({
                error: "Either text or image is required for reply"
            }, { status: 400 });
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
        const quotedMsg = {
            key: {
                remoteJid: jid,
                fromMe: fromMe === true,
                id: messageId
            },
            message: {}
        };

        // Build message payload
        let msgPayload: any;

        if (image) {
            msgPayload = {
                image: typeof image === "string" ? { url: image } : image,
                caption: caption || undefined,
            };
            if (mentions && Array.isArray(mentions)) {
                msgPayload.mentions = mentions;
            }
        } else {
            msgPayload = { text };
            if (mentions && Array.isArray(mentions)) {
                msgPayload.mentions = mentions;
            }
        }

        // Send the reply message with quoted reference
        const sent = await instance.socket.sendMessage(jid, msgPayload, {
            quoted: quotedMsg as any
        });

        return NextResponse.json({
            success: true,
            message: "Reply sent successfully",
            data: { id: sent?.key?.id }
        });

    } catch (error) {
        console.error("Reply message error:", error);
        return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
    }
}
