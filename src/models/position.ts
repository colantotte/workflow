import { z } from 'zod';

export const PositionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  level: z.number().int().min(1).max(5), // 1:社長 2:本部長 3:部長 4:課長 5:一般
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Position = z.infer<typeof PositionSchema>;

export const CreatePositionSchema = PositionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreatePosition = z.infer<typeof CreatePositionSchema>;

// 標準役職マスタ
export const DEFAULT_POSITIONS: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: '社長', level: 1, isActive: true },
  { name: '本部長', level: 2, isActive: true },
  { name: '部長', level: 3, isActive: true },
  { name: '課長', level: 4, isActive: true },
  { name: '一般', level: 5, isActive: true },
];

// レベルから上位役職を取得するためのヘルパー
export function getHigherPositionLevel(currentLevel: number): number | null {
  if (currentLevel <= 1) return null;
  return currentLevel - 1;
}

export function getLowerPositionLevel(currentLevel: number): number | null {
  if (currentLevel >= 5) return null;
  return currentLevel + 1;
}
