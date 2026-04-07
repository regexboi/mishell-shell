import foundationSql from "./migrations/0001_foundation.sql";
import historySearchSql from "./migrations/0002_history_search.sql";

export const migrations = [
  {
    name: "0001_foundation",
    sql: foundationSql,
  },
  {
    name: "0002_history_search",
    sql: historySearchSql,
  },
] as const;
