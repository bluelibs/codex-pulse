import type { CodexPulseApi } from '@shared/usage'

declare global {
  interface Window {
    codexPulse: CodexPulseApi
  }
}

export {}

