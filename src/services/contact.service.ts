import { getLarkClient } from '../lark/client.js';

// Lark Contact API から取得する部署情報
export interface LarkDepartment {
  department_id: string;
  name: string;
  parent_department_id: string;
  open_department_id?: string;
  member_count?: number;
  status?: { is_deleted?: boolean };
}

// Lark Contact API から取得するユーザー情報
export interface LarkContactUser {
  user_id: string;
  open_id?: string;
  name: string;
  email?: string;
  mobile?: string;
  department_ids?: string[];
  status?: {
    is_frozen?: boolean;
    is_resigned?: boolean;
    is_activated?: boolean;
  };
  job_title?: string;
}

/**
 * Lark SDK の AxiosError からAPIエラーメッセージを抽出
 */
function extractLarkError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // AxiosError の場合、response.data に Lark API のエラー情報がある
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>;
      if (resp.data && typeof resp.data === 'object') {
        const data = resp.data as Record<string, unknown>;
        if (data.msg) return `Lark API error: code=${data.code}, msg=${data.msg}`;
      }
    }
    if (e.message) return String(e.message);
  }
  return String(err);
}

export class ContactService {
  /**
   * 全部署を再帰的に取得（ルート部署 "0" の子を fetch_child=true で取得）
   */
  async fetchAllDepartments(): Promise<LarkDepartment[]> {
    const client = getLarkClient();
    const all: LarkDepartment[] = [];
    let pageToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      let res: Awaited<ReturnType<typeof client.contact.department.children>>;
      try {
        res = await client.contact.department.children({
          params: {
            department_id_type: 'department_id',
            fetch_child: true,
            page_size: 50,
            page_token: pageToken,
          },
          path: { department_id: '0' },
        });
      } catch (err) {
        throw new Error(
          `部署一覧の取得に失敗しました。Larkアプリに Contact API スコープ（contact:contact:readonly_as_app 等）が必要です。\n${extractLarkError(err)}`
        );
      }

      if (res.code !== 0) {
        throw new Error(`Lark Contact API error (departments): code=${res.code}, msg=${res.msg}`);
      }

      const items = res.data?.items ?? [];
      for (const item of items) {
        all.push({
          department_id: item.department_id ?? '',
          name: item.name,
          parent_department_id: item.parent_department_id,
          open_department_id: item.open_department_id,
          member_count: item.member_count,
          status: item.status,
        });
      }

      pageToken = res.data?.page_token;
      hasMore = res.data?.has_more ?? false;
    }

    return all;
  }

  /**
   * 全ユーザーを取得（各部署のメンバーを取得してマージ）
   * まず全部署を取得し、各部署のユーザーを取得する。
   * ルート部署(0)も含めて取得し、user_id で重複排除する。
   */
  async fetchAllUsers(): Promise<LarkContactUser[]> {
    const client = getLarkClient();
    const departments = await this.fetchAllDepartments();
    const departmentIds = ['0', ...departments.map((d) => d.department_id)];
    const userMap = new Map<string, LarkContactUser>();

    for (const deptId of departmentIds) {
      let pageToken: string | undefined;
      let hasMore = true;

      while (hasMore) {
        let res: Awaited<ReturnType<typeof client.contact.user.findByDepartment>>;
        try {
          res = await client.contact.user.findByDepartment({
            params: {
              user_id_type: 'user_id',
              department_id_type: 'department_id',
              department_id: deptId,
              page_size: 50,
              page_token: pageToken,
            },
          });
        } catch (err) {
          // 権限不足の場合はスキップ
          console.warn(`Lark Contact API warning (users in dept ${deptId}): ${extractLarkError(err)}`);
          break;
        }

        if (res.code !== 0) {
          console.warn(`Lark Contact API warning (users in dept ${deptId}): code=${res.code}, msg=${res.msg}`);
          break;
        }

        const items = res.data?.items ?? [];
        for (const item of items) {
          const userId = item.user_id ?? '';
          if (userId && !userMap.has(userId)) {
            userMap.set(userId, {
              user_id: userId,
              open_id: item.open_id,
              name: item.name,
              email: item.email ?? item.enterprise_email,
              mobile: item.mobile,
              department_ids: item.department_ids,
              status: item.status,
              job_title: item.job_title,
            });
          }
        }

        pageToken = res.data?.page_token;
        hasMore = res.data?.has_more ?? false;
      }
    }

    return Array.from(userMap.values());
  }
}
