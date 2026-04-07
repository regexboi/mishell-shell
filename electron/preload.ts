import { contextBridge, ipcRenderer } from "electron";

import type { MishellApi } from "@shared/api";
import { bootstrapPayloadSchema, ipcChannels } from "@shared/contracts";

const api: MishellApi = {
  app: {
    async getBootstrap() {
      const payload = await ipcRenderer.invoke(ipcChannels.getBootstrap);

      return bootstrapPayloadSchema.parse(payload);
    },
  },
};

contextBridge.exposeInMainWorld("mishell", api);
