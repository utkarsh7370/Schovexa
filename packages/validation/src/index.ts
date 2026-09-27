// Shared Zod schemas between apps/api (request validation) and apps/web
// (React Hook Form resolvers) — one source of truth per docs/architecture.md
// "Validate at multiple layers" principle (frontend + API share this schema;
// business rules and DB constraints are additional, separate layers).
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters');

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
