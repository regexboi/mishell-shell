/// <reference types="vite/client" />

import type { MishellApi } from "@shared/api";

declare global {
  interface Window {
    mishell: MishellApi;
  }
}

export {};
