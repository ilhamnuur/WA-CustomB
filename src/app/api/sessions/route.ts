import { NextResponse } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getAccessibleSessions } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export const GET = auth(async (req) => {
    try {
        const user = await getAuthenticatedUser(req as any);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const sessions = await getAccessibleSessions(user.id, user.role);
        return NextResponse.json({ status: true, message: "Sessions retrieved successfully", data: sessions });
    } catch (error) {
        logger.error("Get sessions error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch sessions", error: "Failed to fetch sessions" }, { status: 500 });
    }
}) as any;

export const POST = auth(async (req) => {
    logger.info("API", "POST /api/sessions hitting route handler (wrapped)");
    try {
        const user = await getAuthenticatedUser(req as any);
        if (!user) {
            logger.warn("API", "POST /api/sessions: User not authenticated");
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, sessionId } = body;

        if (!name) {
            return NextResponse.json({ status: false, message: "Session name is required", error: "Session name is required" }, { status: 400 });
        }

        const session = await waManager.createSession(user.id, name, sessionId);
        return NextResponse.json({ status: true, message: "Session created successfully", data: session });
    } catch (error) {
        logger.error("Create session error:", error);
        return NextResponse.json({ status: false, message: "Failed to create session", error: "Failed to create session" }, { status: 500 });
    }
}) as any;
