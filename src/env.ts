export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  SITE_URL: string;
  STUDIO_URL?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  /** Workers AI, used to find faces and subjects in photos */
  AI?: Ai;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string; // optional: any OpenAI compatible endpoint (Azure, Groq, Together, a local model)
  XAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  META_PAGE_ID?: string;
  META_PAGE_TOKEN?: string;
  META_IG_USER_ID?: string;
  LINKEDIN_TOKEN?: string;
  LINKEDIN_AUTHOR_URN?: string;
  SOCIAL_WEBHOOK_URL?: string;
  CONTACT_WEBHOOK_URL?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;      // optional, for example "Marc Gander <hello@ganders.co>"
  OWNER_EMAIL?: string;    // the first owner's sign in email
  NOTIFY_EMAIL?: string;   // optional, where form alerts go (defaults to OWNER_EMAIL) // optional: forward contact messages (Zapier, Make, Slack, email service)
  [key: string]: unknown;
}
import type { SessionUser } from './auth';
export type AppEnv = { Bindings: Env; Variables: { user?: SessionUser } };
