/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Clerk cutover (#59). When set, the app authenticates via Clerk; when unset,
   *  it stays on the legacy JWT-cookie flow (both remain bootable). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
