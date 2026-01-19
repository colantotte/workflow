import { z } from 'zod';

export const OrganizationLevel = z.enum([
  'company',    // 会社
  'division',   // 本部
  'department', // 部
  'section',    // 課
]);

export type OrganizationLevel = z.infer<typeof OrganizationLevel>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50),
  level: OrganizationLevel,
  parentId: z.string().uuid().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const CreateOrganizationSchema = OrganizationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial();

export type UpdateOrganization = z.infer<typeof UpdateOrganizationSchema>;

// 組織階層レベルの順序マップ
export const ORGANIZATION_LEVEL_ORDER: Record<OrganizationLevel, number> = {
  company: 1,
  division: 2,
  department: 3,
  section: 4,
};
