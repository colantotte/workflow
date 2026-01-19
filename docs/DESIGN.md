# Lark Base 承認ワークフローシステム設計書

## 1. システム概要

Lark Baseを活用した柔軟な承認ワークフローシステム。
組織変更・人事異動に強く、空席スキップ・兼務スキップを自動処理。

## 2. アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      Lark App / Web UI                       │
├─────────────────────────────────────────────────────────────┤
│                        API Gateway                           │
├──────────────────┬──────────────────┬───────────────────────┤
│   Workflow       │   Organization   │   Import/Export       │
│   Engine         │   Service        │   Service             │
├──────────────────┴──────────────────┴───────────────────────┤
│                     Lark Base (データ層)                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │組織マスタ│ │ユーザー │ │承認ロール│ │ワークフロー│           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│  │申請データ│ │承認履歴 │ │監査ログ │                        │
│  └─────────┘ └─────────┘ └─────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## 3. データモデル

### 3.1 組織マスタ (Organizations)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 組織ID |
| name | string | 組織名 |
| code | string | 組織コード |
| level | enum | 階層レベル (company/division/department/section) |
| parent_id | string? | 親組織ID |
| is_active | boolean | 有効フラグ |

### 3.2 役職マスタ (Positions)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 役職ID |
| name | string | 役職名 (社長/本部長/部長/課長/一般) |
| level | number | 役職レベル (1:社長 〜 5:一般) |
| is_active | boolean | 有効フラグ |

### 3.3 承認ロールマスタ (ApprovalRoles)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ロールID |
| name | string | ロール名 (経理承認者/法務確認者/取締役決裁) |
| description | string | 説明 |
| is_active | boolean | 有効フラグ |

### 3.4 ユーザー (Users)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ユーザーID |
| lark_user_id | string | LarkユーザーID |
| name | string | 氏名 |
| email | string | メールアドレス |
| is_active | boolean | 有効フラグ |

### 3.5 ユーザー役職 (UserPositions) - 多対多

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ID |
| user_id | string | ユーザーID |
| organization_id | string | 組織ID |
| position_id | string | 役職ID |
| is_primary | boolean | 主務フラグ |
| valid_from | date | 有効開始日 |
| valid_to | date? | 有効終了日 |

### 3.6 ユーザー承認ロール (UserApprovalRoles) - 多対多

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ID |
| user_id | string | ユーザーID |
| approval_role_id | string | 承認ロールID |
| target_organization_id | string? | 対象組織ID (null=全組織) |
| valid_from | date | 有効開始日 |
| valid_to | date? | 有効終了日 |

### 3.7 ワークフロー定義 (WorkflowDefinitions)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ワークフローID |
| name | string | ワークフロー名 |
| description | string | 説明 |
| category | string | カテゴリ (経費精算/稟議/休暇申請) |
| is_active | boolean | 有効フラグ |

### 3.8 承認ステップ (ApprovalSteps)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | ステップID |
| workflow_id | string | ワークフローID |
| step_order | number | 順序 |
| step_type | enum | タイプ (position/role/specific_user) |
| position_id | string? | 役職ID (step_type=position時) |
| approval_role_id | string? | 承認ロールID (step_type=role時) |
| specific_user_id | string? | 特定ユーザーID (step_type=specific_user時) |
| is_required | boolean | 必須フラグ |
| skip_if_same_person | boolean | 同一人物スキップフラグ |
| skip_if_vacant | boolean | 空席スキップフラグ |
| condition | json? | 条件 (金額分岐など) |

### 3.9 申請 (Requests)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 申請ID |
| workflow_id | string | ワークフローID |
| applicant_id | string | 申請者ID |
| title | string | タイトル |
| content | json | 申請内容 |
| status | enum | ステータス (draft/pending/approved/rejected/cancelled) |
| current_step | number | 現在ステップ |
| created_at | datetime | 作成日時 |
| updated_at | datetime | 更新日時 |

### 3.10 承認履歴 (ApprovalHistory)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 履歴ID |
| request_id | string | 申請ID |
| step_order | number | ステップ順序 |
| approver_id | string | 承認者ID |
| action | enum | アクション (approve/reject/remand/skip) |
| comment | string? | コメント |
| skip_reason | string? | スキップ理由 |
| created_at | datetime | 日時 |

## 4. スキップロジック

### 4.1 空席スキップ

```typescript
// 組織に該当役職の人がいない場合、上位役職にスキップ
function findApprover(orgId: string, positionId: string): User | null {
  const user = findUserByOrgAndPosition(orgId, positionId);
  if (user) return user;

  // 上位役職を探す
  const higherPosition = getHigherPosition(positionId);
  if (higherPosition) {
    return findApprover(orgId, higherPosition.id);
  }

  // 上位組織を探す
  const parentOrg = getParentOrganization(orgId);
  if (parentOrg) {
    return findApprover(parentOrg.id, positionId);
  }

  return null;
}
```

### 4.2 兼務スキップ

```typescript
// 同一人物が既に承認済みの場合スキップ
function shouldSkipStep(
  request: Request,
  step: ApprovalStep,
  previousApprovers: string[]
): boolean {
  if (!step.skip_if_same_person) return false;

  const approver = resolveApprover(request, step);
  if (!approver) return step.skip_if_vacant;

  return previousApprovers.includes(approver.id);
}
```

## 5. API設計

### 5.1 組織・ユーザー管理

```
GET    /api/organizations
POST   /api/organizations
PUT    /api/organizations/:id
DELETE /api/organizations/:id

GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id

POST   /api/users/:id/positions      # 役職付与
DELETE /api/users/:id/positions/:positionId

POST   /api/users/:id/approval-roles # 承認ロール付与
DELETE /api/users/:id/approval-roles/:roleId
```

### 5.2 ワークフロー管理

```
GET    /api/workflows
POST   /api/workflows
PUT    /api/workflows/:id
DELETE /api/workflows/:id

GET    /api/workflows/:id/steps
POST   /api/workflows/:id/steps
PUT    /api/workflows/:id/steps/:stepId
DELETE /api/workflows/:id/steps/:stepId
```

### 5.3 申請・承認

```
GET    /api/requests
POST   /api/requests
GET    /api/requests/:id
PUT    /api/requests/:id

POST   /api/requests/:id/submit      # 申請提出
POST   /api/requests/:id/approve     # 承認
POST   /api/requests/:id/reject      # 却下
POST   /api/requests/:id/remand      # 差戻し
POST   /api/requests/:id/cancel      # 取消し

GET    /api/requests/:id/route       # 承認ルート確認（スキップ反映）
```

### 5.4 一括インポート

```
POST   /api/import/organizations     # 組織一括インポート
POST   /api/import/users             # ユーザー一括インポート
POST   /api/import/user-positions    # ユーザー役職一括インポート
POST   /api/import/workflows         # ワークフロー一括インポート

POST   /api/import/preview           # インポートプレビュー
GET    /api/import/templates/:type   # テンプレートダウンロード
```

## 6. 技術スタック

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Framework**: Express.js / Hono
- **Lark SDK**: @larksuiteoapi/node-sdk
- **Validation**: Zod
- **CSV/Excel**: csv-parse, exceljs
- **Testing**: Vitest
- **Linting**: ESLint, Prettier

## 7. ディレクトリ構成

```
src/
├── index.ts                 # エントリーポイント
├── config/                  # 設定
│   └── lark.ts
├── models/                  # データモデル
│   ├── organization.ts
│   ├── user.ts
│   ├── position.ts
│   ├── approval-role.ts
│   ├── workflow.ts
│   └── request.ts
├── services/                # ビジネスロジック
│   ├── organization.service.ts
│   ├── user.service.ts
│   ├── workflow.service.ts
│   ├── approval.service.ts  # 承認エンジン
│   └── import.service.ts    # インポート機能
├── routes/                  # APIルート
│   ├── organizations.ts
│   ├── users.ts
│   ├── workflows.ts
│   ├── requests.ts
│   └── import.ts
├── lark/                    # Lark連携
│   ├── client.ts
│   ├── base.ts              # Lark Base操作
│   └── bot.ts               # 通知Bot
└── utils/                   # ユーティリティ
    ├── csv-parser.ts
    ├── excel-parser.ts
    └── validators.ts
```

## 8. 次のステップ

1. プロジェクト初期化
2. データモデル実装
3. ワークフローエンジン（スキップロジック）
4. CSV/Excelインポート機能
5. Lark Base連携
6. テスト・ドキュメント
