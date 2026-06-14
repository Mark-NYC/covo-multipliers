// supabase/functions/assessment-import-items/index.ts
//
// CoVo Fivefold Stewardship Assessment — Approved Item Importer
//
// POST /functions/v1/assessment-import-items
// Header: x-admin-secret: <ADMIN_ASSESSMENT_SECRET>
// Body: {
//   version_id: string,           // UUID of the target draft version
//   dry_run?: boolean,            // true = validate only, no writes (default: true)
//   items: ImportItem[],          // array of items to import
// }
//
// Each ImportItem:
// {
//   pilot_id:         string,       // exact item ID, e.g. "PP-002"   REQUIRED
//   item_text:        string,       // exact approved wording           REQUIRED
//   domain_key:       string,       // e.g. "prophetic"                 REQUIRED
//   construct_key:    string|null,  // primary construct, e.g. "PL-1"  REQUIRED (null for cross-function)
//   secondary_tag:    string|null,  // optional secondary construct key
//   phenotype_layer:  string,       // one of 7 approved layers         REQUIRED
//   evidence_label:   string,       // A|B|S|F|FC|O|R                  REQUIRED
//   response_format:  string,       // AGR6|FREQ6|EX6|SC4|FC2|FC3      REQUIRED
//   timeframe:        string|null,  // e.g. "past 12 months"|"generally"
//   reverse_keyed:    boolean,      // default false
//   sort_order:       number,       // display order                    REQUIRED
//   options?: Array<{               // required for SC4/FC2/FC3 items
//     key:  string,                 // "A"|"B"|"C"|"D"
//     text: string,                 // exact option wording
//   }>
// }
//
// Returns:
// {
//   dry_run: boolean,
//   valid: boolean,
//   errors: ValidationError[],
//   warnings: string[],
//   summary: { total, valid, invalid, would_insert, would_skip_duplicate }
//   imported?: number   // only present when dry_run=false and valid=true
// }
//
// Duplicate-ID protection: if a pilot_id already exists in the target version,
// the item is rejected (not silently overwritten). Use explicit deactivation to
// replace items.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_DOMAINS = new Set([
  "prophetic", "evangelistic", "shepherding", "teaching",
  "apostolic_direction", "apostolic_formation", "apostolic_multiplying",
  "cross_function",
]);

const VALID_PHENOTYPE_LAYERS = new Set([
  "Perception", "Instinct", "Operating Style", "Behavioral History",
  "Self-Reported Outcome", "Reproduction", "Shadow",
]);

const VALID_EVIDENCE_LABELS = new Set(["A", "B", "S", "F", "FC", "O", "R"]);

const VALID_RESPONSE_FORMATS = new Set(["AGR6", "FREQ6", "EX6", "SC4", "FC2", "FC3"]);

const FORMATS_REQUIRING_OPTIONS = new Set(["SC4", "FC2", "FC3"]);

const VALID_OPTION_KEYS_BY_FORMAT: Record<string, Set<string>> = {
  SC4: new Set(["A", "B", "C", "D"]),
  FC3: new Set(["A", "B", "C"]),
  FC2: new Set(["A", "B"]),
};

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportOption {
  key: string;
  text: string;
}

interface ImportItem {
  pilot_id: string;
  item_text: string;
  domain_key: string;
  construct_key: string | null;
  secondary_tag?: string | null;
  phenotype_layer: string;
  evidence_label: string;
  response_format: string;
  timeframe?: string | null;
  reverse_keyed?: boolean;
  sort_order: number;
  options?: ImportOption[];
}

interface ValidationError {
  pilot_id: string | null;
  index: number;
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type, x-admin-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateItem(
  item: ImportItem,
  index: number,
  seenIds: Set<string>,
  knownConstructKeys: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const pid = typeof item.pilot_id === "string" ? item.pilot_id : null;

  function err(field: string, message: string) {
    errors.push({ pilot_id: pid, index, field, message });
  }

  // pilot_id
  if (!pid || pid.trim().length === 0) {
    err("pilot_id", "pilot_id is required and must be a non-empty string.");
  } else if (!/^[A-Z]{2,4}-\d{3}$/.test(pid.trim())) {
    err("pilot_id", `pilot_id "${pid}" does not match expected format (e.g. PP-002, PAD-001).`);
  } else if (seenIds.has(pid.trim())) {
    err("pilot_id", `Duplicate pilot_id "${pid}" — each item must have a unique ID within the import batch.`);
  } else {
    seenIds.add(pid.trim());
  }

  // item_text
  if (typeof item.item_text !== "string" || item.item_text.trim().length < 10) {
    err("item_text", "item_text is required and must be at least 10 characters.");
  }

  // domain_key
  if (!VALID_DOMAINS.has(item.domain_key)) {
    err("domain_key", `Unknown domain_key "${item.domain_key}". Valid values: ${[...VALID_DOMAINS].join(", ")}.`);
  }

  // construct_key
  if (item.construct_key !== null && item.construct_key !== undefined) {
    if (knownConstructKeys.size > 0 && !knownConstructKeys.has(item.construct_key)) {
      err("construct_key", `construct_key "${item.construct_key}" does not exist in this version's construct list.`);
    }
  } else if (item.domain_key !== "cross_function" && item.construct_key === null) {
    // Warning handled separately — null construct_key is allowed but unusual outside cross_function
  }

  // secondary_tag (optional — just check format if present)
  if (item.secondary_tag && !/^[A-Z]{2}-\d$/.test(item.secondary_tag)) {
    err("secondary_tag", `secondary_tag "${item.secondary_tag}" does not match expected format (e.g. PL-1).`);
  }

  // phenotype_layer
  if (!VALID_PHENOTYPE_LAYERS.has(item.phenotype_layer)) {
    err("phenotype_layer", `Unknown phenotype_layer "${item.phenotype_layer}". Valid values: ${[...VALID_PHENOTYPE_LAYERS].join(", ")}.`);
  }

  // evidence_label
  if (!VALID_EVIDENCE_LABELS.has(item.evidence_label)) {
    err("evidence_label", `Unknown evidence_label "${item.evidence_label}". Valid values: ${[...VALID_EVIDENCE_LABELS].join(", ")}.`);
  }

  // response_format
  if (!VALID_RESPONSE_FORMATS.has(item.response_format)) {
    err("response_format", `Unknown response_format "${item.response_format}". Valid values: ${[...VALID_RESPONSE_FORMATS].join(", ")}.`);
  }

  // Evidence / format consistency checks
  if (item.evidence_label === "F" && item.reverse_keyed !== true) {
    errors.push({
      pilot_id: pid, index, field: "reverse_keyed",
      message: `Shadow items (evidence_label="F") are expected to have reverse_keyed=true. Verify this is intentional.`,
    });
  }

  if (["S", "FC"].includes(item.evidence_label) && !FORMATS_REQUIRING_OPTIONS.has(item.response_format)) {
    err("response_format", `evidence_label "${item.evidence_label}" requires a scenario/forced-choice format (SC4, FC2, or FC3), but got "${item.response_format}".`);
  }

  // Options
  if (FORMATS_REQUIRING_OPTIONS.has(item.response_format)) {
    if (!Array.isArray(item.options) || item.options.length === 0) {
      err("options", `response_format "${item.response_format}" requires an options array.`);
    } else {
      const validKeys = VALID_OPTION_KEYS_BY_FORMAT[item.response_format];
      const expectedCount = { SC4: 4, FC3: 3, FC2: 2 }[item.response_format]!;
      if (item.options.length !== expectedCount) {
        err("options", `${item.response_format} requires exactly ${expectedCount} options; got ${item.options.length}.`);
      }
      const seenOptKeys = new Set<string>();
      item.options.forEach((opt, oi) => {
        if (!opt.key || !validKeys?.has(opt.key)) {
          err("options", `Option [${oi}]: invalid key "${opt.key}" for format ${item.response_format}.`);
        } else if (seenOptKeys.has(opt.key)) {
          err("options", `Option [${oi}]: duplicate key "${opt.key}".`);
        } else {
          seenOptKeys.add(opt.key);
        }
        if (typeof opt.text !== "string" || opt.text.trim().length < 5) {
          err("options", `Option [${oi}] key="${opt.key}": text is required and must be at least 5 characters.`);
        }
      });
    }
  } else if (item.options && item.options.length > 0) {
    errors.push({
      pilot_id: pid, index, field: "options",
      message: `response_format "${item.response_format}" does not use options. Remove the options array.`,
    });
  }

  // sort_order
  if (typeof item.sort_order !== "number" || !Number.isInteger(item.sort_order)) {
    err("sort_order", "sort_order must be an integer.");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  // Auth
  const providedSecret = req.headers.get("x-admin-secret");
  const expectedSecret = Deno.env.get("ADMIN_ASSESSMENT_SECRET");
  if (!expectedSecret) return json(500, { error: "Server configuration error." }, cors);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return json(401, { error: "Invalid admin secret." }, cors);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const versionId = body.version_id as string;
  const dryRun = body.dry_run !== false; // default true
  const rawItems = body.items;

  if (!versionId || !isUuid(versionId)) {
    return json(400, { error: "version_id must be a valid UUID." }, cors);
  }
  if (!Array.isArray(rawItems)) {
    return json(400, { error: "items must be an array." }, cors);
  }
  if (rawItems.length === 0) {
    return json(400, { error: "items array is empty." }, cors);
  }
  if (rawItems.length > 200) {
    return json(400, { error: "items array exceeds 200 items — import in smaller batches." }, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Verify version exists and is a non-active draft (not the unapproved reconstructed version)
  const { data: version, error: versionErr } = await supabase
    .from("assessment_versions")
    .select("id, version_tag, label, is_active, config")
    .eq("id", versionId)
    .single();

  if (versionErr || !version) {
    return json(404, { error: `Version ${versionId} not found.` }, cors);
  }

  const cfg = version.config as Record<string, unknown> ?? {};

  if (cfg.unapproved === true) {
    return json(400, {
      error: `Version "${version.version_tag}" is marked unapproved. Import approved items into the pending draft version instead.`,
    }, cors);
  }

  if (version.is_active) {
    return json(400, {
      error: `Version "${version.version_tag}" is already active. Item imports must target a draft (inactive) version.`,
    }, cors);
  }

  // Load existing pilot_ids in this version (duplicate protection)
  const { data: existingItems } = await supabase
    .from("assessment_items")
    .select("pilot_id")
    .eq("version_id", versionId);

  const existingIds = new Set((existingItems ?? []).map((i) => i.pilot_id));

  // Load construct keys for this version (for validation)
  const { data: constructs } = await supabase
    .from("assessment_constructs")
    .select("construct_key")
    .eq("version_id", versionId);

  const knownConstructKeys = new Set((constructs ?? []).map((c) => c.construct_key));

  // Validate all items
  const seenIds = new Set<string>();
  const allErrors: ValidationError[] = [];
  const warnings: string[] = [];
  const duplicates: string[] = [];

  const items = rawItems as ImportItem[];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const errors = validateItem(item, i, seenIds, knownConstructKeys);
    allErrors.push(...errors);

    // Check against DB duplicates
    const pid = typeof item.pilot_id === "string" ? item.pilot_id.trim() : null;
    if (pid && existingIds.has(pid)) {
      duplicates.push(pid);
      allErrors.push({
        pilot_id: pid, index: i, field: "pilot_id",
        message: `pilot_id "${pid}" already exists in version "${version.version_tag}". Items cannot be silently overwritten — deactivate the existing item first or use a different version.`,
      });
    }

    // Warnings
    if (item.construct_key === null && item.domain_key !== "cross_function") {
      warnings.push(`Item [${i}] ${pid ?? "?"}: null construct_key on non-cross-function item — verify this is intentional.`);
    }
    if (item.evidence_label === "O" && !item.item_text?.toLowerCase().includes("i have seen")) {
      warnings.push(`Item [${i}] ${pid ?? "?"}: outcome item (O) does not begin with "I have seen" framing — verify wording follows the approved language constraint.`);
    }
  }

  const validCount = items.length - new Set(allErrors.map((e) => e.index)).size;
  const hasErrors = allErrors.length > 0;

  const summary = {
    total: items.length,
    valid: validCount,
    invalid: items.length - validCount,
    would_insert: hasErrors ? 0 : items.length - duplicates.length,
    would_skip_duplicate: duplicates.length,
  };

  if (dryRun || hasErrors) {
    return json(hasErrors ? 422 : 200, {
      dry_run: dryRun || hasErrors,
      valid: !hasErrors,
      version_id: versionId,
      version_tag: version.version_tag,
      errors: allErrors,
      warnings,
      summary,
    }, cors);
  }

  // --- Live import ---
  let importedCount = 0;

  for (const item of items) {
    const pid = item.pilot_id.trim();

    // Insert item
    const { data: inserted, error: itemErr } = await supabase
      .from("assessment_items")
      .insert({
        version_id: versionId,
        pilot_id: pid,
        item_text: item.item_text.trim(),
        domain_key: item.domain_key,
        construct_key: item.construct_key ?? null,
        phenotype_layer: item.phenotype_layer,
        evidence_label: item.evidence_label,
        response_format: item.response_format,
        reverse_keyed: item.reverse_keyed === true,
        timeframe: item.timeframe ?? null,
        sort_order: item.sort_order,
        is_active: true,
      })
      .select("id")
      .single();

    if (itemErr || !inserted) {
      console.error(`[import] failed to insert item ${pid}:`, itemErr);
      return json(500, {
        error: `Database error inserting item ${pid}. Import aborted after ${importedCount} items.`,
        inserted_so_far: importedCount,
        failed_pilot_id: pid,
      }, cors);
    }

    // Insert options if present
    if (item.options && item.options.length > 0) {
      const optRows = item.options.map((opt, oi) => ({
        item_id: inserted.id,
        option_key: opt.key,
        option_text: opt.text.trim(),
        sort_order: oi,
      }));

      const { error: optErr } = await supabase
        .from("assessment_item_options")
        .insert(optRows);

      if (optErr) {
        console.error(`[import] failed to insert options for item ${pid}:`, optErr);
        return json(500, {
          error: `Database error inserting options for item ${pid}. Import aborted after ${importedCount} items.`,
          inserted_so_far: importedCount,
          failed_pilot_id: pid,
        }, cors);
      }
    }

    // Store secondary_tag in item metadata if provided
    if (item.secondary_tag) {
      await supabase
        .from("assessment_items")
        .update({ metadata: { secondary_tag: item.secondary_tag } } as Record<string, unknown>)
        .eq("id", inserted.id);
    }

    importedCount++;
  }

  // Audit log
  await supabase.from("admin_audit_log").insert({
    actor: "admin/assessment-import-items",
    action: "item.import",
    target_type: "assessment_version",
    target_id: versionId,
    detail: {
      imported: importedCount,
      version_tag: version.version_tag,
      dry_run: false,
    },
  });

  console.log(`[assessment-import-items] imported ${importedCount} items into version ${version.version_tag}`);

  return json(200, {
    dry_run: false,
    valid: true,
    version_id: versionId,
    version_tag: version.version_tag,
    errors: [],
    warnings,
    summary: { ...summary, would_insert: importedCount },
    imported: importedCount,
  }, cors);
});
