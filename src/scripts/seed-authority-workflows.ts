/**
 * 職務権限基準表に基づくワークフロー定義・承認ステップの一括登録
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initLarkClient, LarkBaseClient } from '../lark/client.js';

initLarkClient({
  appId: process.env.LARK_APP_ID!,
  appSecret: process.env.LARK_APP_SECRET!,
});

const client = new LarkBaseClient({ appToken: process.env.LARK_BASE_APP_TOKEN! });

const TABLES = {
  workflowDefinitions: process.env.LARK_TABLE_WORKFLOWS ?? 'tbloV9BwBTySxhzp',
  approvalSteps: process.env.LARK_TABLE_APPROVAL_STEPS ?? 'tbls8HxUObebzsFl',
};

// ステップ役割マッピング
// 起案責任 → approver (最初の確認者)
// ○ / 承認 → approver
// 決裁 → final_approver
// 報告 → notifier
type StepDef = {
  positionName: string;
  label: string;
  roleType: string; // step_role_type
  isRequired: boolean;
  skipIfSamePerson: boolean;
};

type WorkflowDef = {
  name: string;
  description: string;
  category: string;
  steps: StepDef[];
};

// ============================================================
// ワークフロー定義
// ============================================================
const workflows: WorkflowDef[] = [
  // ===== 稟議書系 =====
  {
    name: '稟議書（1,000万円以上）',
    description: '一般経費・設備投資等 1件1,000万円以上の稟議。取締役会決裁。',
    category: '稟議書',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '取締役会', label: '取締役会決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '稟議書（500万円以上1,000万円未満）',
    description: '一般経費・リース等 500万円以上1,000万円未満。代表取締役決裁。',
    category: '稟議書',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '稟議書（100万円以上500万円未満）',
    description: '一般経費・保守契約等 100万円以上500万円未満。本部長決裁。',
    category: '稟議書',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },
  {
    name: '稟議書（10万円以上100万円未満）',
    description: '一般経費・固定資産等 10万円以上100万円未満。部長決裁。',
    category: '稟議書',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== 交際費等申請書系 =====
  {
    name: '交際費等申請書（5,000円超/人・10万円以上/日）',
    description: '社外接待交際費 5,000円超/人かつ1日あたり10万円以上。代表取締役決裁。',
    category: '交際費',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '交際費等申請書（5,000円超/人・5万円以上10万円未満/日）',
    description: '社外接待交際費 5万円以上10万円未満。部長決裁。',
    category: '交際費',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },
  {
    name: '交際費等申請書（5,000円超/人・3万円以上5万円未満/日）',
    description: '社外接待交際費 3万円以上5万円未満。課長決裁。',
    category: '交際費',
    steps: [
      { positionName: '課長', label: '課長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== 発注書系 =====
  {
    name: '発注書（1,000万円以上）',
    description: '仕入発注 1件1,000万円以上。管掌取締役決裁。',
    category: '発注',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '発注書（500万円以上1,000万円未満）',
    description: '仕入発注 500万円以上1,000万円未満。本部長決裁。',
    category: '発注',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
    ],
  },
  {
    name: '発注書（100万円以上500万円未満）',
    description: '仕入発注 100万円以上500万円未満。部長決裁。',
    category: '発注',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
    ],
  },
  {
    name: '発注書（100万円未満）',
    description: '仕入発注 100万円未満。課長決裁。',
    category: '発注',
    steps: [
      { positionName: '課長', label: '課長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
    ],
  },

  // ===== 新規取引先申請書 =====
  {
    name: '新規取引先申請書',
    description: '新規取引先の取引口座開設及び変更（取引基本契約）の承認。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },

  // ===== 与信関連 =====
  {
    name: '顧客申請（与信枠設定）',
    description: '新規取引先の与信枠設定。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '与信限度額申請（変更）',
    description: '既存取引先の与信枠変更。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },

  // ===== 販売条件 =====
  {
    name: '取引条件変更申請書',
    description: '既存取引先で基準の卸掛け率を下回る場合の価格決定。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },

  // ===== 特別条件変更申請書系 =====
  {
    name: '特別条件変更申請書（500万円以上）',
    description: '特別条件販売（値引き・キャンペーン）500万円以上。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '特別条件変更申請書（50万円以上500万円未満）',
    description: '特別条件販売 50万円以上500万円未満。部長決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },
  {
    name: '特別条件変更申請書（50万円未満）',
    description: '特別条件販売 50万円未満。課長決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== 仮払申請書 =====
  {
    name: '仮払申請書（30万円以上）',
    description: '仮払金 30万円以上。管掌取締役決裁。',
    category: '経理',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '仮払申請書（30万円未満）',
    description: '仮払金 30万円未満。部長決裁。',
    category: '経理',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
    ],
  },

  // ===== 人事系稟議書 =====
  {
    name: '人事稟議書（重要使用人）',
    description: '部長・支店長等の採用・解雇・異動・表彰・懲戒。代表取締役決裁。',
    category: '人事',
    steps: [
      { positionName: '部長', label: '部長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '人事稟議書（一般社員）',
    description: '一般正社員・契約社員の採用・異動・人事考課・給与決定。管掌取締役決裁。',
    category: '人事',
    steps: [
      { positionName: '部長', label: '部長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '人事稟議書（パート・派遣）',
    description: 'パート・派遣社員の採用。部長決裁。',
    category: '人事',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== 海外出張 =====
  {
    name: '海外出張申請',
    description: '海外出張の承認。代表取締役決裁。',
    category: '出張',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },

  // ===== 捺印申請書 =====
  {
    name: '捺印申請書',
    description: '機密保持・業務委託等の契約（覚書）の締結・改廃。管掌取締役決裁。',
    category: '総務',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },

  // ===== 開発・販売承認シート =====
  {
    name: '開発・販売承認シート',
    description: '新製品の企画・開発・量産開始の決定。代表取締役決裁。',
    category: '製品開発',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },

  // ===== 売上戻入系 =====
  {
    name: '売上戻入申請（100万円以上）',
    description: '返品 100万円以上。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '売上戻入申請（50万円以上100万円未満）',
    description: '返品 50万円以上100万円未満。部長決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== リベート系 =====
  {
    name: 'リベート申請（500万円以上）',
    description: 'リベート 500万円以上。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: 'リベート申請（50万円以上500万円未満）',
    description: 'リベート 50万円以上500万円未満。部長決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== 商品上代価格変更 =====
  {
    name: '商品上代価格変更申請書（プロパー）',
    description: 'プロパー商品の上代価格変更（審議会承認必須）。代表取締役決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
  {
    name: '商品上代価格変更申請書（その他）',
    description: 'プロパー商品以外の上代価格変更。本部長決裁。',
    category: '営業',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役（報告）', roleType: 'notifier', isRequired: false, skipIfSamePerson: false },
    ],
  },

  // ===== 広告関連 =====
  {
    name: '広告契約申請（用品使用契約）',
    description: '契約選手との用品使用契約。代表取締役決裁。',
    category: '広告',
    steps: [
      { positionName: '課長', label: '課長確認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '部長', label: '部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '本部長', label: '本部長承認', roleType: 'approver', isRequired: true, skipIfSamePerson: true },
      { positionName: '取締役', label: '管掌取締役承認', roleType: 'approver', isRequired: true, skipIfSamePerson: false },
      { positionName: '代表取締役', label: '代表取締役決裁', roleType: 'final_approver', isRequired: true, skipIfSamePerson: false },
    ],
  },
];

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  職務権限基準表に基づくワークフロー一括登録');
  console.log(`${'='.repeat(60)}\n`);

  // 既存のワークフローとステップを確認
  const existingRecords = await client.getAllRecords(TABLES.workflowDefinitions);
  const existingSteps = await client.getAllRecords(TABLES.approvalSteps);
  console.log(`既存ワークフロー定義: ${existingRecords.length} 件`);
  console.log(`既存承認ステップ: ${existingSteps.length} 件\n`);

  let created = 0;
  let stepsCreated = 0;

  for (const wf of workflows) {
    // 同名のワークフローがあるか確認
    const exists = existingRecords.find(
      (r) => String(r.fields.name ?? '') === wf.name
    );

    let workflowId: string;

    if (exists) {
      workflowId = exists.record_id!;
      // 既にステップがあるかチェック
      const hasSteps = existingSteps.some(
        (s) => String(s.fields.workflow_id ?? '') === workflowId
      );
      if (hasSteps) {
        console.log(`  [SKIP] ${wf.name} (ステップ済み)`);
        continue;
      }
      console.log(`  [ADD STEPS] ${wf.name} (WF存在、ステップ追加)`);
    } else {
      // ワークフロー定義を作成
      console.log(`  [CREATE] ${wf.name}`);
      const wfRecord = await client.createRecord(TABLES.workflowDefinitions, {
        name: wf.name,
        description: wf.description,
        category: wf.category,
        is_active: true,
      });
      workflowId = wfRecord.record_id!;
      created++;
    }

    // 承認ステップを作成
    for (let i = 0; i < wf.steps.length; i++) {
      const step = wf.steps[i];
      await client.createRecord(TABLES.approvalSteps, {
        workflow_id: workflowId,
        step_order: i + 1,
        step_type: 'position',
        position_name: step.positionName,
        approval_role_name: '',
        specific_user_id: '',
        label: step.label,
        is_required: step.isRequired,
        skip_if_same_person: step.skipIfSamePerson,
        skip_if_vacant: false,
        step_role_type: step.roleType,
      });
      stepsCreated++;
      process.stdout.write(`    Step ${i + 1}: ${step.label}\n`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  完了: ${created} ワークフロー, ${stepsCreated} ステップ 作成`);
  console.log(`${'='.repeat(60)}\n`);

  // 最終確認
  const allWf = await client.getAllRecords(TABLES.workflowDefinitions);
  const allSteps = await client.getAllRecords(TABLES.approvalSteps);
  console.log(`Lark Base 合計: ${allWf.length} ワークフロー, ${allSteps.length} ステップ`);
}

main().catch(console.error);
