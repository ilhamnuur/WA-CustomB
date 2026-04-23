import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import Sticker from "wa-sticker-formatter";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { jid, content, mediaUrl, type = "text" } = body;

        if (!jid) {
            return NextResponse.json({ status: false, message: "jid is required" }, { status: 400 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });
        }

        // Send logic
        if (type === "text" || !mediaUrl) {
            await ChatService.sendTextMessage(sessionId, jid, { text: content });
        } else {
            const res = await fetch(mediaUrl);
            if (!res.ok) throw new Error("Failed to fetch media from URL");
            const buffer = Buffer.from(await res.arrayBuffer());
            const fileName = mediaUrl.split("/").pop() || "file";
            const mimetype = res.headers.get("content-type") || "application/octet-stream";
            
            await ChatService.sendMediaMessage(
                sessionId, 
                jid, 
                buffer, 
                type, 
                mimetype, 
                fileName, 
                content
            );
        }

        return NextResponse.json({ status: true, message: "Sent" });
    } catch (error: any) {
        console.error("Chat send error:", error);
        return NextResponse.json({ status: false, message: error.message || "Failed to send" }, { status: 500 });
    }
}
