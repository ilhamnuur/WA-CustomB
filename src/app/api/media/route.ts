import { NextRequest, NextResponse } from "next/server";
import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getAuthenticatedUser, canAccessSession, getAccessibleSessions } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// Media directory — private, NOT in public/
const MEDIA_DIR = path.join(process.cwd(), "data", "media");

/**
 * Extract sessionId and messageKeyId from media filename.
 * Format: {sessionId}-{messageKeyId}.{ext}
 * e.g. "marketing-1-ABCDEF123456.jpg" → { sessionId: "marketing-1", keyId: "ABCDEF123456" }
 */
function parseFilename(filename: string): { sessionId: string; keyId: string } | null {
    const base = filename.replace(/\.[^.]+$/, "");
    const lastDash = base.lastIndexOf("-");
    if (lastDash <= 0) return null;
    return {
        sessionId: base.substring(0, lastDash),
        keyId: base.substring(lastDash + 1),
    };
}

/**
 * GET /api/media — List media files the user has access to, enriched with sender info
 */
export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        if (!existsSync(MEDIA_DIR)) {
            return NextResponse.json({ files: [], totalSize: 0, totalCount: 0 });
        }

        // Get sessions this user can access
        const accessibleSessions = await getAccessibleSessions(user.id, user.role);
        const sessionMap = new Map(accessibleSessions.map(s => [s.sessionId, s.name]));
        const isSuperAdmin = user.role === "SUPERADMIN";

        const filenames = (await readdir(MEDIA_DIR)).filter(n => n !== ".gitkeep");

        // Filter by session ownership
        const ownedFiles: { name: string; parsed: { sessionId: string; keyId: string } | null }[] = [];
        for (const name of filenames) {
            const parsed = parseFilename(name);
            if (!parsed) {
                if (isSuperAdmin) ownedFiles.push({ name, parsed: null });
                continue;
            }
            if (isSuperAdmin || sessionMap.has(parsed.sessionId)) {
                ownedFiles.push({ name, parsed });
            }
        }

        // Batch lookup messages in DB for sender info
        const keyIds = ownedFiles.filter(f => f.parsed).map(f => f.parsed!.keyId);
        const messages = keyIds.length > 0
            ? await prisma.message.findMany({
                where: { keyId: { in: keyIds } },
                select: { keyId: true, remoteJid: true, senderJid: true, pushName: true, fromMe: true },
            })
            : [];
        const messageMap = new Map(messages.map(m => [m.keyId, m]));

        // Build response
        const files = await Promise.all(
            ownedFiles.map(async ({ name, parsed }) => {
                const filePath = path.join(MEDIA_DIR, name);
                const fileStat = await stat(filePath);
                const ext = path.extname(name).toLowerCase();

                let type: "image" | "video" | "audio" | "document" = "document";
                if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) type = "image";
                else if ([".mp4", ".avi", ".mkv", ".mov", ".webm"].includes(ext)) type = "video";
                else if ([".mp3", ".wav", ".ogg", ".opus", ".m4a"].includes(ext)) type = "audio";

                const sessionId = parsed?.sessionId || "unknown";
                const sessionName = sessionMap.get(sessionId) || sessionId;

                // Sender info from DB
                const msgInfo = parsed ? messageMap.get(parsed.keyId) : null;
                const from = msgInfo?.fromMe
                    ? "Me"
                    : msgInfo?.senderJid || msgInfo?.remoteJid || "Unknown";
                const fromName = msgInfo?.pushName || null;

                return {
                    name,
                    size: fileStat.size,
                    type,
                    ext,
                    sessionId,
                    sessionName,
                    from,
                    fromName,
                    fromMe: msgInfo?.fromMe ?? false,
                    createdAt: fileStat.birthtime.toISOString(),
                    modifiedAt: fileStat.mtime.toISOString(),
                    url: `/api/media/${encodeURIComponent(name)}`,
                };
            })
        );

        files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const totalSize = files.reduce((sum, f) => sum + f.size, 0);

        return NextResponse.json({
            files,
            totalSize,
            totalCount: files.length,
        });
    } catch (error: any) {
        console.error("Media list error:", error);
        return NextResponse.json({ error: "Failed to list media" }, { status: 500 });
    }
}

/**
 * DELETE /api/media — Delete selected media files (only user's own sessions)
 * Body: { filenames: string[] }
 */
export async function DELETE(request: NextRequest) {
    const user = await getAuthenticatedUser(request);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { filenames } = body;

        if (!Array.isArray(filenames) || filenames.length === 0) {
            return NextResponse.json({ error: "filenames array is required" }, { status: 400 });
        }

        let deleted = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const filename of filenames) {
            if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
                errors.push(`Invalid filename: ${filename}`);
                failed++;
                continue;
            }

            const parsed = parseFilename(filename);
            if (parsed) {
                const canAccess = await canAccessSession(user.id, user.role, parsed.sessionId);
                if (!canAccess) {
                    errors.push(`Forbidden: ${filename}`);
                    failed++;
                    continue;
                }
            }

            const filePath = path.join(MEDIA_DIR, filename);
            if (!existsSync(filePath)) {
                errors.push(`Not found: ${filename}`);
                failed++;
                continue;
            }

            try {
                await unlink(filePath);
                deleted++;
            } catch (e) {
                errors.push(`Failed to delete: ${filename}`);
                failed++;
            }
        }

        return NextResponse.json({ deleted, failed, errors });
    } catch (error: any) {
        console.error("Media delete error:", error);
        return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
    }
}
