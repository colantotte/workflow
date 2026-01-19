import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { z } from 'zod';

// インポート結果
export interface ImportResult<T> {
  success: boolean;
  totalRows: number;
  validRows: number;
  errorRows: number;
  data: T[];
  errors: ImportError[];
}

export interface ImportError {
  row: number;
  column?: string;
  value?: unknown;
  message: string;
}

// 組織インポート用スキーマ
const OrganizationImportRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  level: z.enum(['company', 'division', 'department', 'section']),
  parent_code: z.string().optional(),
});

export type OrganizationImportRow = z.infer<typeof OrganizationImportRowSchema>;

// ユーザーインポート用スキーマ
const UserImportRowSchema = z.object({
  lark_user_id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
});

export type UserImportRow = z.infer<typeof UserImportRowSchema>;

// ユーザー役職インポート用スキーマ
const UserPositionImportRowSchema = z.object({
  lark_user_id: z.string().min(1),
  organization_code: z.string().min(1),
  position_name: z.string().min(1),
  is_primary: z.string(),
  valid_from: z.string(),
  valid_to: z.string().optional(),
});

export type UserPositionImportRow = z.infer<typeof UserPositionImportRowSchema>;

// ユーザー承認ロールインポート用スキーマ
const UserApprovalRoleImportRowSchema = z.object({
  lark_user_id: z.string().min(1),
  approval_role_name: z.string().min(1),
  target_organization_code: z.string().optional(),
  valid_from: z.string(),
  valid_to: z.string().optional(),
});

export type UserApprovalRoleImportRow = z.infer<typeof UserApprovalRoleImportRowSchema>;

export class ImportService {
  /**
   * CSVファイルをパース
   */
  parseCSV<T>(
    content: string,
    schema: z.ZodSchema<T>
  ): ImportResult<T> {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    return this.validateAndTransform(records, schema);
  }

  /**
   * Excelファイルをパース
   */
  async parseExcel<T>(
    buffer: ArrayBuffer,
    schema: z.ZodSchema<T>,
    sheetName?: string
  ): Promise<ImportResult<T>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = sheetName
      ? workbook.getWorksheet(sheetName)
      : workbook.worksheets[0];

    if (!worksheet) {
      return {
        success: false,
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        data: [],
        errors: [{ row: 0, message: 'シートが見つかりません' }],
      };
    }

    const records: Record<string, string>[] = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // ヘッダー行
        row.eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value ?? '');
        });
      } else {
        // データ行
        const record: Record<string, string> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            record[header] = String(cell.value ?? '');
          }
        });
        records.push(record);
      }
    });

    return this.validateAndTransform(records, schema);
  }

  /**
   * レコードをバリデーション・変換
   */
  private validateAndTransform<T>(
    records: Record<string, string>[],
    schema: z.ZodSchema<T>
  ): ImportResult<T> {
    const data: T[] = [];
    const errors: ImportError[] = [];

    for (let i = 0; i < records.length; i++) {
      const rowNumber = i + 2; // ヘッダー行を考慮
      const record = records[i];

      const result = schema.safeParse(record);

      if (result.success) {
        data.push(result.data);
      } else {
        for (const issue of result.error.issues) {
          errors.push({
            row: rowNumber,
            column: issue.path.join('.'),
            value: record[issue.path[0] as string],
            message: issue.message,
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      totalRows: records.length,
      validRows: data.length,
      errorRows: records.length - data.length,
      data,
      errors,
    };
  }

  /**
   * 組織マスタをインポート
   */
  parseOrganizations(content: string): ImportResult<OrganizationImportRow> {
    return this.parseCSV(content, OrganizationImportRowSchema);
  }

  async parseOrganizationsExcel(buffer: ArrayBuffer): Promise<ImportResult<OrganizationImportRow>> {
    return this.parseExcel(buffer, OrganizationImportRowSchema, '組織');
  }

  /**
   * ユーザーマスタをインポート
   */
  parseUsers(content: string): ImportResult<UserImportRow> {
    return this.parseCSV(content, UserImportRowSchema);
  }

  async parseUsersExcel(buffer: ArrayBuffer): Promise<ImportResult<UserImportRow>> {
    return this.parseExcel(buffer, UserImportRowSchema, 'ユーザー');
  }

  /**
   * ユーザー役職をインポート
   */
  parseUserPositions(content: string): ImportResult<UserPositionImportRow> {
    return this.parseCSV(content, UserPositionImportRowSchema);
  }

  async parseUserPositionsExcel(buffer: ArrayBuffer): Promise<ImportResult<UserPositionImportRow>> {
    return this.parseExcel(buffer, UserPositionImportRowSchema, '役職');
  }

  /**
   * ユーザー承認ロールをインポート
   */
  parseUserApprovalRoles(content: string): ImportResult<UserApprovalRoleImportRow> {
    return this.parseCSV(content, UserApprovalRoleImportRowSchema);
  }

  async parseUserApprovalRolesExcel(buffer: ArrayBuffer): Promise<ImportResult<UserApprovalRoleImportRow>> {
    return this.parseExcel(buffer, UserApprovalRoleImportRowSchema, '承認ロール');
  }

  /**
   * インポートテンプレートを生成（Excel）
   */
  async generateTemplate(type: 'organizations' | 'users' | 'positions' | 'approval-roles'): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();

    switch (type) {
      case 'organizations': {
        const sheet = workbook.addWorksheet('組織');
        sheet.columns = [
          { header: 'code', key: 'code', width: 20 },
          { header: 'name', key: 'name', width: 30 },
          { header: 'level', key: 'level', width: 15 },
          { header: 'parent_code', key: 'parent_code', width: 20 },
        ];
        // サンプルデータ
        sheet.addRow({ code: 'CORP', name: '本社', level: 'company', parent_code: '' });
        sheet.addRow({ code: 'SALES', name: '営業本部', level: 'division', parent_code: 'CORP' });
        sheet.addRow({ code: 'SALES1', name: '営業1部', level: 'department', parent_code: 'SALES' });
        break;
      }
      case 'users': {
        const sheet = workbook.addWorksheet('ユーザー');
        sheet.columns = [
          { header: 'lark_user_id', key: 'lark_user_id', width: 30 },
          { header: 'name', key: 'name', width: 20 },
          { header: 'email', key: 'email', width: 30 },
        ];
        sheet.addRow({ lark_user_id: 'ou_xxxxx', name: '山田太郎', email: 'yamada@example.com' });
        break;
      }
      case 'positions': {
        const sheet = workbook.addWorksheet('役職');
        sheet.columns = [
          { header: 'lark_user_id', key: 'lark_user_id', width: 30 },
          { header: 'organization_code', key: 'organization_code', width: 20 },
          { header: 'position_name', key: 'position_name', width: 15 },
          { header: 'is_primary', key: 'is_primary', width: 10 },
          { header: 'valid_from', key: 'valid_from', width: 15 },
          { header: 'valid_to', key: 'valid_to', width: 15 },
        ];
        sheet.addRow({
          lark_user_id: 'ou_xxxxx',
          organization_code: 'SALES1',
          position_name: '課長',
          is_primary: 'true',
          valid_from: '2024-01-01',
          valid_to: '',
        });
        break;
      }
      case 'approval-roles': {
        const sheet = workbook.addWorksheet('承認ロール');
        sheet.columns = [
          { header: 'lark_user_id', key: 'lark_user_id', width: 30 },
          { header: 'approval_role_name', key: 'approval_role_name', width: 20 },
          { header: 'target_organization_code', key: 'target_organization_code', width: 25 },
          { header: 'valid_from', key: 'valid_from', width: 15 },
          { header: 'valid_to', key: 'valid_to', width: 15 },
        ];
        sheet.addRow({
          lark_user_id: 'ou_xxxxx',
          approval_role_name: '経理承認者',
          target_organization_code: '',
          valid_from: '2024-01-01',
          valid_to: '',
        });
        break;
      }
    }

    return workbook.xlsx.writeBuffer();
  }
}
