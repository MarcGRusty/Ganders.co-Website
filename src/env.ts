export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  SITE_URL: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
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
  [key: string]: unknown;
}
export type AppEnv = { Bindings: Env };
