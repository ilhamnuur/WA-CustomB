import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { auth } from "@/lib/auth";

export const GET = auth(async (req, { params }) => {
    try {
        const user = await getAuthenticatedUser(req as any);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
        }

        const { sessionId } = await (params as any);
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get("page") || "1");
        const limitParam = searchParams.get("limit") || "10";
        const isAll = limitParam === "all";
        const limit = isAll ? 0 : parseInt(limitParam) || 10;
        const search = searchParams.get("search") || "";
        const tag = searchParams.get("tag") || "";

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });
        }

        const sessionData = await prisma.session.findUnique({
            where: { sessionId: sessionId },
            select: { id: true }
        });

        if (!sessionData) {
            return NextResponse.json({ status: false, message: "Session not found" }, { status: 404 });
        }

        const where: any = {
            sessionId: sessionData.id,
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { number: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
                { tags: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (tag) {
            where.tags = { contains: tag, mode: 'insensitive' };
        }

        if (searchParams.get("type") === "tags") {
            const results = await prisma.phoneBook.findMany({
                where: { sessionId: sessionData.id },
                select: { tags: true }
            });
            const allTags = new Set<string>();
            results.forEach(r => {
                if (r.tags) {
                    r.tags.split(',').forEach(t => allTags.add(t.trim()));
                }
            });
            return NextResponse.json({ status: true, data: Array.from(allTags) });
        }

        const [contacts, total] = await Promise.all([
            prisma.phoneBook.findMany({
                where,
                ...(isAll ? {} : { skip: (page - 1) * limit, take: limit }),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.phoneBook.count({ where })
        ]);

        return NextResponse.json({
            status: true,
            message: "Phonebook retrieved successfully",
            data: contacts,
            meta: {
                total,
                page: isAll ? 1 : page,
                limit: isAll ? total : limit,
                totalPages: isAll ? 1 : Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching phonebook:", error);
        return NextResponse.json({ status: false, message: "Internal Server Error" }, { status: 500 });
    }
}) as any;

export const POST = auth(async (req, { params }) => {
    try {
        const user = await getAuthenticatedUser(req as any);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
        }

        const { sessionId } = await (params as any);
        const body = await req.json();
        const { name, number, category, tags } = body;

        if (!number) {
            return NextResponse.json({ status: false, message: "Number is required" }, { status: 400 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });
        }

        const sessionData = await prisma.session.findUnique({
            where: { sessionId: sessionId },
            select: { id: true }
        });

        if (!sessionData) {
            return NextResponse.json({ status: false, message: "Session not found" }, { status: 404 });
        }

        // Clean number
        let cleanNumber = number.replace(/\D/g, '');
        let jid = `${cleanNumber}@s.whatsapp.net`;

        const contact = await prisma.phoneBook.create({
            data: {
                sessionId: sessionData.id,
                name,
                number: cleanNumber,
                jid,
                category,
                tags
            }
        });

        return NextResponse.json({
            status: true,
            message: "Contact saved to phonebook",
            data: contact
        });

    } catch (error) {
        console.error("Error saving phonebook contact:", error);
        return NextResponse.json({ status: false, message: "Failed to save contact" }, { status: 500 });
    }
}) as any;

// BULK IMPORT
export const PUT = auth(async (req, { params }) => {
    try {
        const user = await getAuthenticatedUser(req as any);
        if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });

        const { sessionId } = await (params as any);
        const body = await req.json(); // Array of {name, number, category, tags}
        
        if (!Array.isArray(body)) {
            return NextResponse.json({ status: false, message: "Expected array of contacts" }, { status: 400 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) return NextResponse.json({ status: false, message: "Forbidden" }, { status: 403 });

        const sessionData = await prisma.session.findUnique({
            where: { sessionId: sessionId },
            select: { id: true }
        });

        if (!sessionData) return NextResponse.json({ status: false, message: "Session not found" }, { status: 404 });

        const dataToInsert = body.map(c => {
            const clean = String(c.number).replace(/\D/g, '');
            return {
                sessionId: sessionData.id,
                name: c.name || null,
                number: clean,
                jid: `${clean}@s.whatsapp.net`,
                category: c.category || null,
                tags: c.tags || null
            };
        });

        await prisma.phoneBook.createMany({
            data: dataToInsert,
            skipDuplicates: false // or true based on preference
        });

        return NextResponse.json({
            status: true,
            message: `Successfully imported ${dataToInsert.length} contacts`
        });

    } catch (error) {
        console.error("Bulk import error:", error);
        return NextResponse.json({ status: false, message: "Import failed" }, { status: 500 });
    }
}) as any;
