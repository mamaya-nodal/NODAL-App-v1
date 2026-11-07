import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/** Split PostgreSQL scripts without splitting strings or dollar-quoted bodies. */
export function sqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0, quote = "", line = false, block = 0;
  for (let i = 0; i < sql.length; i++) {
    if (line) { if (sql[i] === "\n") line = false; continue; }
    if (block) { if (sql.slice(i, i + 2) === "*/") { block--; i++; } else if (sql.slice(i, i + 2) === "/*") { block++; i++; } continue; }
    if (quote) {
      if (sql.startsWith(quote, i)) {
        if ((quote === "'" || quote === '"') && sql.startsWith(quote + quote, i)) { i++; continue; }
        i += quote.length - 1; quote = "";
      }
      continue;
    }
    if (sql.slice(i, i + 2) === "--") { line = true; i++; continue; }
    if (sql.slice(i, i + 2) === "/*") { block++; i++; continue; }
    if (sql[i] === "'" || sql[i] === '"') { quote = sql[i]; continue; }
    if (sql[i] === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag) { quote = tag[0]; i += quote.length - 1; continue; }
    }
    if (sql[i] === ";") { statements.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start));
  return statements;
}

export async function createAccountingDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create function auth.jwt() returns jsonb language sql as 'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
    create function auth.role() returns text language sql as 'select coalesce(nullif(current_setting(''request.jwt.claim.role'',true),''''),''authenticated'')';
    create function extensions.digest(text,text) returns bytea language sql as 'select sha256(convert_to($1,''UTF8''))';
    create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql as 'select string_to_array($1,''/'')';
  `);
  const applied: string[] = [];
  try {
    for (const file of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
      if (file >= "20261106170000") continue;
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
      for (const statement of sqlStatements(sql)) {
        const clean = statement.replace(/--[^\n]*(\n|$)/g, " ").trim();
        // Historical user repairs and seed data are deliberately not replayed.
        // All schema/functions/triggers and structural migration DO blocks are real.
        if (!clean || /^(begin|commit|rollback|insert|update|delete|select|set)\b/i.test(clean)) continue;
        if (/^do\s+\$repair\$/i.test(clean)) continue;
        if (/^create temp(?:orary)? table/i.test(clean)) continue;
        if (file.includes("reopen_october") && !/^(?:create or replace function|comment on function|revoke .*function|grant .*function)/i.test(clean)) continue;
        if (/private_\w+/i.test(clean) && /^(create (schema|table)|revoke)/i.test(clean)) continue;
        if (/^do\b/i.test(clean) && /\b(?:lore_id|franco_id|david_id|mauricio|target_user_id constant|admin_id constant|constant uuid)\b/i.test(clean)) continue;
        if (/^(?:create|alter|drop|grant|revoke|comment|do)\b/i.test(clean)) {
          try { await db.exec(statement); } catch (error) { throw new Error(`${file}: ${clean.slice(0, 120)}: ${String(error)}`); }
        }
      }
      applied.push(file);
    }
    return { db, applied };
  } catch (error) { await db.close(); throw error; }
}
