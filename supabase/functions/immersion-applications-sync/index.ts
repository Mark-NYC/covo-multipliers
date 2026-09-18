// supabase/functions/immersion-applications-sync/index.ts
//
// Covo Multipliers — Immersion Applications Sync (read-only) entrypoint.
//
// All logic lives in ./handler.ts so it can be imported and tested without
// starting a server or constructing a real Supabase client. This file wires
// the production dependencies and starts the HTTP handler.
//
// See handler.ts for the full contract, the request/response shape, and the
// list of secrets.

import { buildRealDeps, createHandler } from "./handler.ts";

Deno.serve(createHandler(buildRealDeps()));
