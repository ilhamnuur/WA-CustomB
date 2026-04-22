import { prisma } from "../src/lib/prisma";

async function listUsers() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true }
        });
        console.log("Database Users:");
        console.table(users);
    } catch (e) {
        console.error("Prisma error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

listUsers();
