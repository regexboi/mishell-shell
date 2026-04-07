import type { BootstrapPayload } from "./contracts";

export interface MishellApi {
  app: {
    getBootstrap: () => Promise<BootstrapPayload>;
  };
}
