import { prisma } from "./prisma";
import { NextRequest } from "next/server";
import { auth } from "./auth";
import { logger } from "./logger";

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
    SUPERADMIN: 3,
    OWNER: 2,
    STAFF: 1
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

/**
 * Validate API key from request header
 */
export async function validateApiKey(request: NextRequest) {
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
        return null;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { apiKey },
            select: { id: true, email: true, name: true, role: true }
        });

        return user;
    } catch (error) {
        logger.error("Auth", "API key validation error:", error);
        return null;
    }
}

/**
 * Get authenticated user from either session or API key
 */
export async function getAuthenticatedUser(request?: NextRequest) {
    // 1. Try API key if request is provided
    if (request) {
        const apiKeyUser = await validateApiKey(request);
        if (apiKeyUser) {
            logger.debug("Auth", "Authenticated via API Key:", apiKeyUser.email);
            return { ...apiKeyUser, authMethod: "apiKey" as const };
        }
    }

    // 2. Fall back to session auth
    try {
        let userId: string | undefined;
        let userEmail: string | undefined;

        // A. Check if session is already provided by auth() wrapper (most efficient)
        if ((request as any)?.auth?.user) {
            userId = (request as any).auth.user.id;
            userEmail = (request as any).auth.user.email;
            logger.debug("Auth", "Using session from auth() wrapper context");
        } 
        
        // B. Fallback: Try getting token directly (most reliable for POST/Middleware/Proxy)
        if (!userId && request) {
            try {
                const { getToken } = await import("next-auth/jwt");
                const token = await getToken({ 
                    req: request, 
                    secret: process.env.AUTH_SECRET,
                    raw: false
                });
                
                if (token) {
                    userId = token.id as string;
                    userEmail = token.email as string;
                    logger.debug("Auth", "Authenticated via direct JWT Token lookup");
                }
            } catch (tokenError) {
                logger.error("Auth", "JWT getToken error:", tokenError);
            }
        }

        // C. Last resort: Try standard auth() (uses next/headers)
        if (!userId) {
            const session = await auth();
            if (session?.user) {
                userId = session.user.id;
                userEmail = session.user.email as string;
                logger.debug("Auth", "Authenticated via standard auth() helper");
            }
        }

        // 3. Resolve user from database
        if (userId || userEmail) {
            // First try ID
            let user = userId ? await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, name: true, role: true }
            }) : null;

            // Fallback to Email (resolves stale IDs)
            if (!user && userEmail) {
                user = await prisma.user.findUnique({
                    where: { email: userEmail },
                    select: { id: true, email: true, name: true, role: true }
                });
                
                if (user) {
                    logger.debug("Auth", "Recovered stale session via email fallback:", userEmail);
                }
            }

            if (user) {
                logger.debug("Auth", "Successfully authenticated user:", user.email);
                return { ...user, authMethod: "session" as const };
            } else {
                logger.warn("Auth", "User not found in database for provided credentials:", { userId, userEmail });
            }
        }
        
        logger.debug("Auth", "No valid authentication found (Session/JWT/API Key)");
    } catch (authError) {
        logger.error("Auth", "Unexpected error in getAuthenticatedUser:", authError);
    }

    return null;
}

/**
 * Check if user has required role level
 */
export function hasRole(userRole: string, requiredRole: Role): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as Role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Check if user is admin (SUPERADMIN or has admin privileges)
 */
export function isAdmin(userRole: string): boolean {
    return userRole === "SUPERADMIN";
}

/**
 * Check if user can access a session
 * - SUPERADMIN can access all sessions
 * - Other users can access their own sessions OR sessions shared with them
 */
export async function canAccessSession(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    // Check if session belongs to user (ownership)
    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId, userId },
                { sessionId: sessionId, userId }
            ]
        }
    });

    if (session) return true;

    // Check if user has shared access
    const dbSession = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId },
                { sessionId: sessionId }
            ]
        },
        select: { id: true }
    });

    if (!dbSession) return false;

    const sharedAccess = await prisma.sessionAccess.findUnique({
        where: {
            sessionId_userId: {
                sessionId: dbSession.id,
                userId
            }
        }
    });

    return !!sharedAccess;
}

/**
 * Check if user is the actual owner of a session (not just shared access)
 * Used for protecting management endpoints (e.g. granting/revoking access)
 */
export async function isSessionOwner(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId, userId },
                { sessionId: sessionId, userId }
            ]
        }
    });

    return !!session;
}

/**
 * Get sessions that user can access
 * - SUPERADMIN sees all
 * - Others see only their own
 */
export async function getAccessibleSessions(userId: string, userRole: string) {
    if (isAdmin(userRole)) {
        return prisma.session.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                botConfig: true,
                webhooks: true,
                _count: {
                    select: {
                        contacts: true,
                        messages: true,
                        groups: true,
                        autoReplies: true,
                        scheduledMessages: true
                    }
                }
            }
        });
    }

    // Get sessions owned by user + sessions shared with user
    const [ownedSessions, sharedAccess] = await Promise.all([
        prisma.session.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                botConfig: true,
                webhooks: true,
                _count: {
                    select: {
                        contacts: true,
                        messages: true,
                        groups: true,
                        autoReplies: true,
                        scheduledMessages: true
                    }
                }
            }
        }),
        prisma.sessionAccess.findMany({
            where: { userId },
            select: { sessionId: true }
        })
    ]);

    if (sharedAccess.length === 0) return ownedSessions;

    const sharedSessionIds = sharedAccess.map(a => a.sessionId);
    const ownedIds = new Set(ownedSessions.map(s => s.id));
    const missingIds = sharedSessionIds.filter(id => !ownedIds.has(id));

    if (missingIds.length === 0) return ownedSessions;

    const sharedSessions = await prisma.session.findMany({
        where: { id: { in: missingIds } },
        orderBy: { createdAt: 'desc' },
        include: {
            botConfig: true,
            webhooks: true,
            _count: {
                select: {
                    contacts: true,
                    messages: true,
                    groups: true,
                    autoReplies: true,
                    scheduledMessages: true
                }
            }
        }
    });

    return [...ownedSessions, ...sharedSessions];
}

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "wag_"; // Prefix for easy identification
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
