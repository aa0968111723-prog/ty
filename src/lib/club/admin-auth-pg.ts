import { getSql } from "@/lib/db";
import { createSqlStore } from "./admin-auth.mjs";

export async function bindPostgresAdminAuthStore() {
  const sql = await getSql();
  return createSqlStore((text: string, params: unknown[] = []) => sql.query(text, params));
}
