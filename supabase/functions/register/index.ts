// supabase/functions/register/index.ts
//
// Covo Multipliers — Event Registration Edge Function (entrypoint).
//
// All logic lives in ./handler.ts so it can be imported and tested without
// starting a server or constructing real Supabase/Resend dependencies. This
// file is the deployable entrypoint: it wires the production dependencies and
// starts the HTTP handler.
//
// See handler.ts for the full pipeline documentation and the list of secrets.

import { buildRealDeps, createHandler } from "./handler.ts";

Deno.serve(createHandler(buildRealDeps()));
