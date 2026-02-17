import type { LarkBaseRepository } from '../repositories/lark-base.repository.js';
import type { ContactService, LarkDepartment, LarkContactUser } from './contact.service.js';
import type { Organization } from '../models/index.js';

export interface SyncDepartmentsResult {
  created: number;
  updated: number;
  deactivated: number;
}

export interface SyncUsersResult {
  created: number;
  updated: number;
  deactivated: number;
  unchanged: number;
}

export interface SyncResult {
  departments: SyncDepartmentsResult;
  users: SyncUsersResult;
}

/**
 * 部署の階層深さから組織レベルを推定
 * depth 0 = company, 1 = division, 2 = department, 3+ = section
 */
function inferLevel(depth: number): Organization['level'] {
  switch (depth) {
    case 0: return 'company';
    case 1: return 'division';
    case 2: return 'department';
    default: return 'section';
  }
}

/**
 * 部署リストから各部署の階層深さを計算
 */
function computeDepths(departments: LarkDepartment[]): Map<string, number> {
  const parentMap = new Map<string, string>();
  for (const dept of departments) {
    parentMap.set(dept.department_id, dept.parent_department_id);
  }

  const depthCache = new Map<string, number>();

  function getDepth(deptId: string): number {
    if (depthCache.has(deptId)) return depthCache.get(deptId)!;
    const parentId = parentMap.get(deptId);
    if (!parentId || parentId === '0' || parentId === '') {
      depthCache.set(deptId, 0);
      return 0;
    }
    const depth = getDepth(parentId) + 1;
    depthCache.set(deptId, depth);
    return depth;
  }

  for (const dept of departments) {
    getDepth(dept.department_id);
  }

  return depthCache;
}

/**
 * 部署を同期（Lark Contact → Lark Base 組織マスタ）
 */
export async function syncDepartments(
  repo: LarkBaseRepository,
  contactService: ContactService
): Promise<SyncDepartmentsResult> {
  const result: SyncDepartmentsResult = { created: 0, updated: 0, deactivated: 0 };

  // Lark Contact API から全部署取得
  const larkDepts = await contactService.fetchAllDepartments();
  console.log(`  Lark Contact: ${larkDepts.length} departments found`);

  // 既存の組織マスタ取得
  const existingOrgs = await repo.listOrganizations();
  const existingByCode = new Map<string, Organization>();
  for (const org of existingOrgs) {
    existingByCode.set(org.code, org);
  }

  // 階層深さ計算
  const depths = computeDepths(larkDepts);

  // Lark側の部署IDセット（無効化判定用）
  const larkDeptIds = new Set(larkDepts.map((d) => d.department_id));

  // 新規・更新
  for (const dept of larkDepts) {
    const code = dept.department_id;
    const name = dept.name;
    const parentCode = dept.parent_department_id === '0' ? '' : dept.parent_department_id;
    const level = inferLevel(depths.get(code) ?? 0);
    const isDeleted = dept.status?.is_deleted ?? false;

    const existing = existingByCode.get(code);
    if (!existing) {
      // 新規作成
      if (!isDeleted) {
        await repo.createOrganization({ code, name, level, parentCode, isActive: true });
        result.created++;
      }
    } else {
      // 変更チェック
      const nameChanged = existing.name !== name;
      const parentChanged = (existing.parentId ?? '') !== parentCode;
      const levelChanged = existing.level !== level;
      const activeChanged = existing.isActive !== !isDeleted;

      if (nameChanged || parentChanged || levelChanged || activeChanged) {
        await repo.updateOrganization(existing.id, {
          name,
          level,
          parentCode,
          isActive: !isDeleted,
        });
        result.updated++;
      }
    }
  }

  // Lark側に存在しなくなった部署を無効化（ただし0件取得時は安全のためスキップ）
  if (larkDepts.length > 0) {
    for (const org of existingOrgs) {
      if (org.isActive && org.code && !larkDeptIds.has(org.code)) {
        await repo.updateOrganization(org.id, { isActive: false });
        result.deactivated++;
      }
    }
  }

  // キャッシュクリア
  repo.clearCache('organizations');

  return result;
}

/**
 * ユーザーを同期（Lark Contact → Lark Base ユーザーテーブル）
 * roleは既存ユーザーの場合変更しない（管理者が手動設定するため）
 */
export async function syncUsers(
  repo: LarkBaseRepository,
  contactService: ContactService
): Promise<SyncUsersResult> {
  const result: SyncUsersResult = { created: 0, updated: 0, deactivated: 0, unchanged: 0 };

  // Lark Contact API から全ユーザー取得
  const larkUsers = await contactService.fetchAllUsers();
  console.log(`  Lark Contact: ${larkUsers.length} users found`);

  // 既存ユーザー取得
  const existingUsers = await repo.listUsers();
  const existingByLarkId = new Map<string, (typeof existingUsers)[0]>();
  for (const user of existingUsers) {
    if (user.larkUserId) {
      existingByLarkId.set(user.larkUserId, user);
    }
  }

  // Lark側のユーザーIDセット（無効化判定用）
  const larkUserIds = new Set<string>();

  for (const larkUser of larkUsers) {
    const isActive = isUserActive(larkUser);
    if (!isActive) continue; // 退職・凍結ユーザーはスキップ

    larkUserIds.add(larkUser.user_id);

    const existing = existingByLarkId.get(larkUser.user_id);
    if (!existing) {
      // 新規作成
      await repo.createUser({
        larkUserId: larkUser.user_id,
        name: larkUser.name,
        email: larkUser.email ?? '',
        role: 'user',
        isActive: true,
      });
      result.created++;
    } else {
      // 変更チェック（roleは変更しない）
      const nameChanged = existing.name !== larkUser.name;
      const emailChanged = (existing.email ?? '') !== (larkUser.email ?? '');
      const activeChanged = !existing.isActive;

      if (nameChanged || emailChanged || activeChanged) {
        await repo.updateUser(existing.id, {
          name: larkUser.name,
          email: larkUser.email ?? existing.email,
          isActive: true,
        });
        result.updated++;
      } else {
        result.unchanged++;
      }
    }
  }

  // Lark側で退職・無効になったユーザーを無効化（ただし0件取得時は安全のためスキップ）
  if (larkUsers.length > 0) {
    for (const user of existingUsers) {
      if (user.isActive && user.larkUserId && !larkUserIds.has(user.larkUserId)) {
        await repo.updateUser(user.id, { isActive: false });
        result.deactivated++;
      }
    }
  }

  // キャッシュクリア
  repo.clearCache('users');

  return result;
}

function isUserActive(user: LarkContactUser): boolean {
  if (!user.status) return true;
  if (user.status.is_resigned) return false;
  if (user.status.is_frozen) return false;
  return true;
}

/**
 * 全同期実行（部署 → ユーザーの順）
 */
export async function syncAll(
  repo: LarkBaseRepository,
  contactService: ContactService
): Promise<SyncResult> {
  console.log('Syncing departments...');
  const departments = await syncDepartments(repo, contactService);
  console.log(`  Departments: created=${departments.created}, updated=${departments.updated}, deactivated=${departments.deactivated}`);

  console.log('Syncing users...');
  const users = await syncUsers(repo, contactService);
  console.log(`  Users: created=${users.created}, updated=${users.updated}, deactivated=${users.deactivated}, unchanged=${users.unchanged}`);

  return { departments, users };
}
