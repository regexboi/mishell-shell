import type {
  BootstrapPayload,
  ExecutionEvent,
  HistoryAutocompleteRequest,
  HistoryAutocompleteResponse,
  HistoryRecallRequest,
  HistoryRecallResponse,
  HistorySearchRequest,
  HistorySearchResponse,
  RunCommandRequest,
  RunCommandResponse,
} from "./contracts";

export interface MishellApi {
  app: {
    getBootstrap: () => Promise<BootstrapPayload>;
    runCommand: (input: RunCommandRequest) => Promise<RunCommandResponse>;
    onExecutionEvent: (listener: (event: ExecutionEvent) => void) => () => void;
  };
  history: {
    getAutocomplete: (
      input: HistoryAutocompleteRequest,
    ) => Promise<HistoryAutocompleteResponse>;
    search: (input: HistorySearchRequest) => Promise<HistorySearchResponse>;
    getRecall: (input: HistoryRecallRequest) => Promise<HistoryRecallResponse>;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
}
