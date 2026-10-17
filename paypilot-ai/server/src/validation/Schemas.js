import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  organizationName: z.string().trim().min(2).max(100).optional(),
  // bcrypt only uses the first 72 bytes, so we cap the length
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(72),
});

export const createOrderSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  seats: z.number().int('seats must be a whole number').min(1).max(1000),
});