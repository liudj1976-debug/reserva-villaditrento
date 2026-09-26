export const ROLES = ['resident', 'portaria', 'sindico'] as const;
export type AppRole = (typeof ROLES)[number];
export interface UserProfile { role: AppRole; email: string | null; createdAt?: string; }
export const canAccessAdmin = (role: AppRole | null): boolean => role === 'sindico';
export const canAccessPortaria = (role: AppRole | null): boolean => role === 'portaria' || role === 'sindico';
export const isValidRole = (role: unknown): role is AppRole => typeof role === 'string' && (ROLES as readonly string[]).includes(role);
