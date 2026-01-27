import * as lark from '@larksuiteoapi/node-sdk';

export interface LarkConfig {
  appId: string;
  appSecret: string;
}

let client: lark.Client | null = null;

export function initLarkClient(config: LarkConfig): lark.Client {
  client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: lark.Domain.Lark, // Lark international (including Japan)
    loggerLevel: lark.LoggerLevel.info,
  });

  return client;
}

export function getLarkClient(): lark.Client {
  if (!client) {
    throw new Error('Lark client not initialized. Call initLarkClient first.');
  }
  return client;
}

// Lark Base（多維表格/Bitable）操作用のヘルパー
export interface LarkBaseConfig {
  appToken: string; // Base App Token
}

// Lark Base レコード型
export interface LarkBaseRecord {
  record_id?: string;
  fields: Record<string, unknown>;
}

export class LarkBaseClient {
  private client: lark.Client;
  private appToken: string;

  constructor(config: LarkBaseConfig) {
    this.client = getLarkClient();
    this.appToken = config.appToken;
  }

  /**
   * テーブル一覧を取得
   */
  async listTables(): Promise<unknown[]> {
    const response = await this.client.bitable.v1.appTable.list({
      path: { app_token: this.appToken },
    });

    return (response.data?.items as unknown[]) ?? [];
  }

  /**
   * レコード一覧を取得
   */
  async listRecords(
    tableId: string,
    options?: {
      pageToken?: string;
      pageSize?: number;
      filter?: string;
      sort?: string;
    }
  ): Promise<{
    records: LarkBaseRecord[];
    pageToken?: string;
    hasMore: boolean;
  }> {
    const response = await this.client.bitable.v1.appTableRecord.list({
      path: {
        app_token: this.appToken,
        table_id: tableId,
      },
      params: {
        page_token: options?.pageToken,
        page_size: options?.pageSize ?? 100,
        filter: options?.filter,
        sort: options?.sort,
      },
    });

    return {
      records: (response.data?.items as LarkBaseRecord[]) ?? [],
      pageToken: response.data?.page_token,
      hasMore: response.data?.has_more ?? false,
    };
  }

  /**
   * 全レコードを取得（ページング対応）
   */
  async getAllRecords(
    tableId: string,
    filter?: string
  ): Promise<LarkBaseRecord[]> {
    const allRecords: LarkBaseRecord[] = [];
    let pageToken: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await this.listRecords(tableId, {
        pageToken,
        pageSize: 500,
        filter,
      });

      allRecords.push(...result.records);
      pageToken = result.pageToken;
      hasMore = result.hasMore;
    }

    return allRecords;
  }

  /**
   * レコードを作成
   */
  async createRecord(
    tableId: string,
    fields: Record<string, unknown>
  ): Promise<LarkBaseRecord> {
    const response = await this.client.bitable.v1.appTableRecord.create({
      path: {
        app_token: this.appToken,
        table_id: tableId,
      },
      data: { fields: fields as Record<string, string | number | boolean> },
    });

    return response.data?.record as LarkBaseRecord;
  }

  /**
   * レコードを一括作成
   */
  async batchCreateRecords(
    tableId: string,
    records: { fields: Record<string, unknown> }[]
  ): Promise<LarkBaseRecord[]> {
    const response = await this.client.bitable.v1.appTableRecord.batchCreate({
      path: {
        app_token: this.appToken,
        table_id: tableId,
      },
      data: {
        records: records.map((r) => ({
          fields: r.fields as Record<string, string | number | boolean>,
        })),
      },
    });

    return (response.data?.records as LarkBaseRecord[]) ?? [];
  }

  /**
   * レコードを更新
   */
  async updateRecord(
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<LarkBaseRecord> {
    const response = await this.client.bitable.v1.appTableRecord.update({
      path: {
        app_token: this.appToken,
        table_id: tableId,
        record_id: recordId,
      },
      data: { fields: fields as Record<string, string | number | boolean> },
    });

    return response.data?.record as LarkBaseRecord;
  }

  /**
   * レコードを削除
   */
  async deleteRecord(tableId: string, recordId: string): Promise<void> {
    await this.client.bitable.v1.appTableRecord.delete({
      path: {
        app_token: this.appToken,
        table_id: tableId,
        record_id: recordId,
      },
    });
  }

  /**
   * レコードを一括削除
   */
  async batchDeleteRecords(tableId: string, recordIds: string[]): Promise<void> {
    await this.client.bitable.v1.appTableRecord.batchDelete({
      path: {
        app_token: this.appToken,
        table_id: tableId,
      },
      data: { records: recordIds },
    });
  }
}
