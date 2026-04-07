import type {
  BootstrapPayload,
  ExecutionEvent,
  RunCommandRequest,
  RunCommandResponse,
} from "./contracts";

export interface MishellApi {
  app: {
    getBootstrap: () => Promise<BootstrapPayload>;
    runCommand: (input: RunCommandRequest) => Promise<RunCommandResponse>;
    onExecutionEvent: (listener: (event: ExecutionEvent) => void) => () => void;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
}
