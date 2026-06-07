import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateToken, AuthUser, UserRole, UserTier } from '../lib/auth';

const prisma = new PrismaClient();

export default async function (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  fastify.post('/register', async (request, reply) => {
    const { email, password, name } = request.body as any;

    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'Email, password, and name are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.code(409).send({ error: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        username: email.split('@')[0] + '_' + Date.now().toString(36), // Generate unique username
        password: hashedPassword,
        name,
        // Default role and tier for new users
        role: 'USER',
        tier: 'free',
      },
    });

    const authUser: AuthUser = {
        ...user,
        role: UserRole.USER,
        tier: 'free' as UserTier,
    };

    const token = generateToken(authUser);
    reply.code(201).send({ token, user: authUser });
  });

  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password || '');
    if (!isPasswordValid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const authUser: AuthUser = {
        ...user,
        role: user.role as UserRole,
        tier: user.tier as UserTier,
    };

    const token = generateToken(authUser);
    reply.send({ token, user: authUser });
  });

  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      reply.send(user);
    }
  );
}
