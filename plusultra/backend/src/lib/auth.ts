import jwt from 'jsonwebtoken';
import { User as PrismaUser } from '@prisma/client';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export type UserTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface AuthUser extends PrismaUser {
  role: UserRole;
  tier: UserTier;
}

export interface UserJwtPayload {
  id: string;
  email: string;
  role: UserRole;
  tier: UserTier;
}

const JWT_SECRET: string = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in the environment variables');
}

export function generateToken(user: AuthUser): string {
  const payload: UserJwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    tier: user.tier,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): UserJwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as UserJwtPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}
