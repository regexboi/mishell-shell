import foundationSql from "./migrations/0001_foundation.sql";

export const migrations = [
  {
    name: "0001_foundation",
    sql: foundationSql,
  },
] as const;
