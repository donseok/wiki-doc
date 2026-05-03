/**
 * 이메일 발송 헬퍼 — FR-904
 *
 * 사내 SMTP 환경 변수가 모두 비어 있으면 no-op (개발/임베디드 환경 안전성).
 * 운영 환경에서 SMTP_HOST 만 설정해도 동작 가능 (인증 옵션은 USER/PASS 양쪽 필요).
 *
 * 사용자별 ON/OFF 는 UserPreference 미모델 — 1차에서는 알림 type 기반으로
 * 화이트리스트 적용. 추후 사용자 설정 테이블 도입 시 확장.
 */

import nodemailer, { type Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

let cachedTransporter: Transporter | null = null;
let cachedKey: string | null = null;

function buildTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 25);
  const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;

  const auth = user && pass ? { user, pass } : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    pool: true,
    maxConnections: 3,
  });
}

function getTransporter(): Transporter | null {
  const key = `${process.env.SMTP_HOST}|${process.env.SMTP_PORT}|${process.env.SMTP_USER}`;
  if (cachedKey !== key) {
    cachedTransporter = buildTransporter();
    cachedKey = key;
  }
  return cachedTransporter;
}

export function isEmailEnabled(): boolean {
  return !!process.env.SMTP_HOST?.trim();
}

/**
 * 사용자명 -> email 변환.
 *  1) 이미 email 형식이면 그대로
 *  2) NOTIFY_EMAIL_DOMAIN 설정 시 user@domain
 *  3) 외에는 null (스킵)
 */
export function resolveEmail(userName: string): string | null {
  if (!userName) return null;
  if (userName.includes('@') && /\S+@\S+\.\S+/.test(userName)) return userName;
  const domain = process.env.NOTIFY_EMAIL_DOMAIN?.trim();
  if (!domain) return null;
  // 한글/공백 제거된 안전한 local part
  const local = userName.replace(/[^a-zA-Z0-9._\-]/g, '').toLowerCase();
  if (!local) return null;
  return `${local}@${domain}`;
}

/**
 * 이메일 발송. SMTP 미설정 시 false 반환 (no-op).
 */
export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  const from = process.env.SMTP_FROM || 'Atlas <noreply@example.com>';
  try {
    await t.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return true;
  } catch (e) {
    console.warn('[email] send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * 알림 → 이메일 발송 (FR-904). NotifyType 별 화이트리스트로 알림 과다 방지.
 */
const EMAIL_TYPE_WHITELIST = new Set([
  'mention',
  'pending_decision',
  'edit_lock_force_released',
]);

export async function maybeSendEmailForNotification(opts: {
  recipient: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  if (!isEmailEnabled()) return false;
  if (!EMAIL_TYPE_WHITELIST.has(opts.type)) return false;
  const to = resolveEmail(opts.recipient);
  if (!to) return false;

  const message = (opts.payload.message as string) || `[${opts.type}]`;
  const pageId = opts.payload.pageId as string | undefined;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = pageId ? `${appUrl}/pages/${pageId}` : appUrl;

  const subject = `[Atlas] ${labelOfType(opts.type)}: ${truncate(message, 60)}`;
  const text = `${message}\n\n${link}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.6">
      <p>${escapeHtml(message)}</p>
      <p><a href="${link}" style="color:#4f46e5">${link}</a></p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="font-size:11px;color:#6b7280">Atlas — 사내 시스템 지식의 지도</p>
    </div>
  `;

  return sendEmail({ to, subject, text, html });
}

function labelOfType(t: string): string {
  switch (t) {
    case 'mention': return '멘션';
    case 'pending_decision': return '결정 요청';
    case 'edit_lock_force_released': return '편집 잠금 해제';
    default: return '알림';
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
