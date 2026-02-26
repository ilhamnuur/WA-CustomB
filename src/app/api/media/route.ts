import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, stat, unlink } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Media directory — private, NOT in public/
const MEDIA_DIR = path.join(process.cwd(), "data", "media");

/**
 * GET /api/media — List all media files with metadata
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

        const filenames = await readdir(MEDIA_DIR);
        const files = await Promise.all(
            filenames.map(async (name) => {
                const filePath = path.join(MEDIA_DIR, name);
                const fileStat = await stat(filePath);
                const ext = path.extname(name).toLowerCase();

                // Determine type category
                let type: "image" | "video" | "audio" | "document" = "document";
                if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) type = "image";
                else if ([".mp4", ".avi", ".mkv", ".mov", ".webm"].includes(ext)) type = "video";
                else if ([".mp3", ".wav", ".ogg", ".opus", ".m4a"].includes(ext)) type = "audio";

                // Extract sessionId from filename (format: sessionId-messageId.ext)
                const sessionId = name.split("-").slice(0, -1).join("-") || "unknown";

                return {
                    name,
                    size: fileStat.size,
                    type,
                    ext,
                    sessionId,
                    createdAt: fileStat.birthtime.toISOString(),
                    modifiedAt: fileStat.mtime.toISOString(),
                    url: `/api/media/${encodeURIComponent(name)}`,
                };
            })
        );

        // Sort by newest first
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
 * DELETE /api/media — Delete selected media files
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
            // Security: prevent directory traversal
            if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
                errors.push(`Invalid filename: ${filename}`);
                failed++;
                continue;
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
