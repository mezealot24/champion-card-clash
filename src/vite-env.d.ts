/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_BETA_CODE?: string
  readonly VITE_FEEDBACK_URL?: string
  readonly VITE_BUILD_LABEL?: string
}
