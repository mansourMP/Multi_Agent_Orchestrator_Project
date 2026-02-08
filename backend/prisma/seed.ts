import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // 1. Create Default User
    const user = await prisma.user.upsert({
        where: { email: 'dev@agentforge.io' },
        update: {},
        create: {
            id: 'dev-user-id',
            email: 'dev@agentforge.io',
            name: 'Dev User',
            emailVerified: true,
        },
    });

    // 2. Create Default Organization
    const org = await prisma.organization.upsert({
        where: { slug: 'default-org' },
        update: {},
        create: {
            id: 'default-org-id',
            name: 'Default Org',
            slug: 'default-org',
        },
    });

    // 3. Create Default Workspace
    const workspace = await prisma.workspace.create({
        data: {
            id: 'default', // Matches the 'default' used in api.ts
            name: 'Default Workspace',
            organizationId: org.id,
        },
    });

    console.log('✅ Seeding complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
