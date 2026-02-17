import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Request, WorkflowDefinition, ApprovalHistory } from '../models/index.js';
import type { ResolvedApprovalStep } from '../models/request.js';

// ============================================================
// 申請書PDF出力
// ============================================================

const PAGE_WIDTH = 595.28;  // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const LINE_HEIGHT = 16;

export function generateRequestText(
  request: Request,
  workflow: WorkflowDefinition,
  route: ResolvedApprovalStep[],
  history: ApprovalHistory[]
): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════');
  lines.push('                   申 請 書                    ');
  lines.push('═══════════════════════════════════════════════');
  lines.push('');
  if (request.docNumber) {
    lines.push(`文書番号: ${request.docNumber}`);
  }
  lines.push(`件名: ${request.title}`);
  lines.push(`ワークフロー: ${workflow.name}`);
  lines.push(`ステータス: ${request.status}`);
  lines.push(`作成日: ${new Date(request.createdAt).toLocaleDateString('ja-JP')}`);
  if (request.submittedAt) {
    lines.push(`提出日: ${new Date(request.submittedAt).toLocaleDateString('ja-JP')}`);
  }
  lines.push('');

  // 申請内容
  lines.push('───────────────────────────────────────────────');
  lines.push('申請内容:');
  const content = request.content as Record<string, unknown>;
  if (content && typeof content === 'object') {
    for (const [key, value] of Object.entries(content)) {
      lines.push(`  ${key}: ${value}`);
    }
  }
  lines.push('');

  // 承認経路
  lines.push('───────────────────────────────────────────────');
  lines.push('承認経路:');
  route.forEach((step, i) => {
    const approverName = step.approver?.name || '未割当';
    const statusLabels: Record<string, string> = {
      pending: '承認待ち', approved: '承認済み', rejected: '却下',
      skipped: 'スキップ', waiting: '待機中',
    };
    lines.push(`  ${i + 1}. ${step.label || 'ステップ ' + step.stepOrder} - ${approverName} [${statusLabels[step.status] || step.status}]`);
  });
  lines.push('');

  // 承認履歴
  if (history.length > 0) {
    lines.push('───────────────────────────────────────────────');
    lines.push('承認履歴:');
    history.forEach(h => {
      const actionLabels: Record<string, string> = {
        approve: '承認', reject: '却下', remand: '差戻し', skip: 'スキップ',
        pull_up: '引き上げ', withdraw: '取り下げ',
      };
      lines.push(`  ${new Date(h.createdAt).toLocaleDateString('ja-JP')} - ${actionLabels[h.action] || h.action} (ステップ${h.stepOrder})${h.comment ? ': ' + h.comment : ''}`);
    });
  }

  lines.push('═══════════════════════════════════════════════');
  return lines.join('\n');
}

async function createPdfFromText(
  title: string,
  textContent: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontSize = 9;

  const lines = textContent.split('\n');
  const usableHeight = PAGE_HEIGHT - MARGIN * 2;
  const linesPerPage = Math.floor(usableHeight / LINE_HEIGHT);

  for (let pageStart = 0; pageStart < lines.length; pageStart += linesPerPage) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const pageLines = lines.slice(pageStart, pageStart + linesPerPage);

    let y = PAGE_HEIGHT - MARGIN;
    for (const line of pageLines) {
      const asciiLine = line.replace(/[^\x20-\x7E]/g, '?');
      page.drawText(asciiLine, {
        x: MARGIN,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      y -= LINE_HEIGHT;
    }
  }

  pdfDoc.setTitle(title);
  pdfDoc.setCreationDate(new Date());

  return pdfDoc.save();
}

export async function generateRequestPdf(
  request: Request,
  workflow: WorkflowDefinition,
  route: ResolvedApprovalStep[],
  history: ApprovalHistory[]
): Promise<Uint8Array> {
  const text = generateRequestText(request, workflow, route, history);
  return createPdfFromText(`Request ${request.docNumber || request.id}`, text);
}

function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP');
}
