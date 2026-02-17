/**
 * Script to clean up workflow-related tables from the ColanMRP Base.
 * Deletes 10 workflow tables that were mistakenly created in ColanMRP,
 * then lists the remaining tables to confirm only MRP tables remain.
 *
 * Uses the Lark SDK for authentication and plain fetch for API calls.
 *
 * Usage: npx tsx src/scripts/cleanup-colanmrp.ts
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient } from '../lark/client.js';

const COLANMRP_APP_TOKEN = 'ROVJb3M6YaIJlQsEUP0j50Cupvf';
const LARK_BASE_URL = 'https://open.larksuite.com/open-apis';

/** Workflow-related tables to delete from ColanMRP Base. */
const TABLES_TO_DELETE: { table_id: string; name: string }[] = [
  { table_id: 'tblCnyU5rDlwsFCd', name: '組織マスタ' },
  { table_id: 'tblvNSExDwSQLTl4', name: '役職マスタ' },
  { table_id: 'tblexuWyCZJQVsUt', name: '承認ロールマスタ' },
  { table_id: 'tblKjUDl9ysBlZot', name: 'ユーザー' },
  { table_id: 'tblGSAYD0p99ZpEf', name: 'ユーザー役職' },
  { table_id: 'tblbHimZpnz1tKzB', name: 'ユーザー承認ロール' },
  { table_id: 'tbloV9BwBTySxhzp', name: 'ワークフロー定義' },
  { table_id: 'tbls8HxUObebzsFl', name: '承認ステップ' },
  { table_id: 'tblU94oqwhezq03A', name: '申請' },
  { table_id: 'tblkIFM69oDD8nqY', name: '承認履歴' },
];

/**
 * Get a tenant_access_token using the Lark SDK's internal token manager.
 */
async function getTenantAccessToken(): Promise<string> {
  const client = initLarkClient({
    appId: process.env.LARK_APP_ID || '',
    appSecret: process.env.LARK_APP_SECRET || '',
  });

  const tokenManager = (client as unknown as Record<string, unknown>).tokenManager as {
    getTenantAccessToken: () => Promise<string>;
  };

  const token = await tokenManager.getTenantAccessToken();
  console.log('Successfully obtained tenant_access_token');
  return token;
}

interface LarkTable {
  table_id: string;
  name: string;
  revision: number;
}

interface ListTablesResponse {
  code: number;
  msg: string;
  data: {
    has_more: boolean;
    page_token?: string;
    total: number;
    items: LarkTable[];
  };
}

interface DeleteTableResponse {
  code: number;
  msg: string;
}

async function listTables(token: string): Promise<LarkTable[]> {
  const allTables: LarkTable[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `${LARK_BASE_URL}/bitable/v1/apps/${COLANMRP_APP_TOKEN}/tables`
    );
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }
    url.searchParams.set('page_size', '100');

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Failed to list tables: HTTP ${resp.status} - ${body}`);
    }

    const body = (await resp.json()) as ListTablesResponse;

    if (body.code !== 0) {
      throw new Error(`Lark API error: code=${body.code}, msg=${body.msg}`);
    }

    allTables.push(...body.data.items);
    pageToken = body.data.has_more ? body.data.page_token : undefined;
  } while (pageToken);

  return allTables;
}

async function deleteTable(
  token: string,
  tableId: string,
  tableName: string
): Promise<boolean> {
  const url = `${LARK_BASE_URL}/bitable/v1/apps/${COLANMRP_APP_TOKEN}/tables/${tableId}`;

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error(`  FAILED to delete ${tableId} (${tableName}): HTTP ${resp.status} - ${body}`);
    return false;
  }

  const body = (await resp.json()) as DeleteTableResponse;

  if (body.code !== 0) {
    console.error(`  FAILED to delete ${tableId} (${tableName}): code=${body.code}, msg=${body.msg}`);
    return false;
  }

  console.log(`  DELETED ${tableId} (${tableName})`);
  return true;
}

function printTableList(tables: LarkTable[]) {
  console.log('table_id'.padEnd(30) + 'name');
  console.log('-'.repeat(60));
  for (const table of tables) {
    console.log(`${table.table_id.padEnd(30)} ${table.name}`);
  }
}

async function main() {
  console.log('=== ColanMRP Base Cleanup ===');
  console.log(`Base app_token: ${COLANMRP_APP_TOKEN}`);
  console.log('');

  const token = await getTenantAccessToken();

  // Step 1: List current tables
  console.log('\n--- Step 1: Current tables ---');
  const tablesBefore = await listTables(token);
  console.log(`Found ${tablesBefore.length} table(s):\n`);
  printTableList(tablesBefore);

  // Step 2: Delete workflow-related tables one by one
  console.log(`\n--- Step 2: Deleting ${TABLES_TO_DELETE.length} workflow-related tables ---\n`);

  let successCount = 0;
  let failCount = 0;

  for (const { table_id, name } of TABLES_TO_DELETE) {
    const ok = await deleteTable(token, table_id, name);
    if (ok) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\nDeletion summary: ${successCount} succeeded, ${failCount} failed`);

  // Step 3: List remaining tables to verify
  console.log('\n--- Step 3: Remaining tables after cleanup ---');
  const tablesAfter = await listTables(token);
  console.log(`Found ${tablesAfter.length} table(s):\n`);
  printTableList(tablesAfter);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', (err as Error).message);
  process.exit(1);
});
