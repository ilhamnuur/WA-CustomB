import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";

/**
 * POST /api/messages/{sessionId}/{jid}/{messageId}/reply
 * Reply to a specific message (quoted reply)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string; messageId: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid: rawJid, messageId } = await params;
        const jid = decodeURIComponent(rawJid);

        const body = await request.json();
        const { text, image, caption, fromMe, mentions } = body;

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
        // fromMe defaults to false (replying to incoming messages)
        const quotedMsg = {
            key: {
                remoteJid: jid,
                fromMe: fromMe === true,
                id: messageId
            },
            message: {} // Baileys only needs the key for quote context
        };

        // Build message payload
        let msgPayload: any;

        if (image) {
            // Reply with image
            msgPayload = {
                image: typeof image === "string" ? { url: image } : image,
                caption: caption || undefined,
            };
            if (mentions && Array.isArray(mentions)) {
                msgPayload.mentions = mentions;
            }
        } else {
            // Reply with text
            msgPayload = { text };
            if (mentions && Array.isArray(mentions)) {
                msgPayload.mentions = mentions;
            }
        }

        // Send the reply message with the quoted reference
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
