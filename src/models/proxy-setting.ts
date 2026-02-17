import { z } from 'zod';

// 代理タイプ
export const ProxyType = z.enum(['application', 'processing']);
export type ProxyTypeValue = z.infer<typeof ProxyType>;

// 代理設定スキーマ
export const ProxySettingSchema = z.object({
  id: z.string().uuid(),
  principalUserId: z.string().uuid(),  // 委任元（本人）
  proxyUserId: z.string().uuid(),      // 代理者
  proxyType: ProxyType,
  targetRoles: z.array(z.string()).default([]),  // 対象ロール: ['approver', 'final_approver', 'handler']
  validFrom: z.date(),
  validTo: z.date().nullable().default(null),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type ProxySetting = z.infer<typeof ProxySettingSchema>;

export const CreateProxySettingSchema = ProxySettingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateProxySetting = z.input<typeof CreateProxySettingSchema>;
