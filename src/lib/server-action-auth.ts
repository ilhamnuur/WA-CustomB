import { auth } from "./auth";
import { prisma } from "./prisma";
import { logger } from "./logger";

/**
 * Gets the currently authenticated user from Next Auth without requiring a Request object.
 * Used primarily for Server Actions.
 */
export async function getAuthenticatedUserForAction() {
    try {
        const session = await auth();
        
        if (session?.user?.id || (session?.user as any)?.email) {
            const userId = session.user.id;
            const userEmail = (session.user as any).email;

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
                    logger.debug("Auth", "Recovered server action session via email fallback:", userEmail);
                }
            }

            if (user) {
                return user;
            }
        }
        return null;
    } catch (error) {
        logger.error("Auth", "Error getting authenticated user for action:", error);
        return null;
    }
}
