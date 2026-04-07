import { queryOptions } from "@tanstack/react-query";

import { getMishellApi } from "@/lib/mishell-api";

export const bootstrapQueryOptions = queryOptions({
  queryKey: ["bootstrap"],
  queryFn: () => getMishellApi().app.getBootstrap(),
  staleTime: Infinity,
});
