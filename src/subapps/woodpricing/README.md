# Wood Pricing MCP Server

A siloed NestJS subapp that stores hardwood lumber pricing (`WoodMaterial` /
`woodpricing_materials`) and exposes it two ways:

1. An MCP (Model Context Protocol) tool, `calculate_project_cost`, served over
   **Streamable HTTP** (for ChatGPT Apps / remote clients) and **stdio** (for
   local Cursor / CLI use).
2. A plain REST API for browsing/managing the underlying pricing data.

This document is the API contract for anyone building a frontend (a ChatGPT
Apps widget, an admin UI, etc.) against this backend.

## Base URL

- Local dev: `http://localhost:3000/api/v1/subapps/woodpricing`
- Production: `https://<deployed-host>/api/v1/subapps/woodpricing`

## Auth

No authentication is required in this MVP — the `/mcp` endpoint is public
(`@Auth(AuthType.None)`). The REST admin endpoints (`/woodpricing*`) are
**not** public — they require a valid Bearer token via the app's global
`AuthenticationGuard`, same as the rest of the backend. OAuth 2.1 (Protected
Resource Metadata, DCR/CIMD) will be required on `/mcp` before this is
submitted as a public ChatGPT app; do not assume "no auth" is permanent.

## Rate limiting

Every route in this app inherits a global default of **10 requests/60s per
IP** (`ThrottlerModule` + a global `APP_GUARD`, configured in `app.module.ts`).
`POST /mcp` overrides this with a higher, tool-specific limit of **60
requests/60s per IP** (`@Throttle(...)` in `mcp.controller.ts`), since a single
ChatGPT conversation turn can fan out into several JSON-RPC requests
(`initialize`, `tools/list`, `tools/call`, ...) against the stateless
transport. Tune this if real usage patterns differ.

---

## 1. MCP Tool Contract (what ChatGPT / MCP clients call)

Endpoint: `POST /api/v1/subapps/woodpricing/mcp` (Streamable HTTP, stateless —
JSON-RPC 2.0 per the MCP spec). `GET` on this path returns `405`.

Local/dev-only stdio entrypoint: `yarn mcp:stdio` (serves the identical tool
over stdio for Cursor's MCP client config; not reachable over HTTP).

### Tool: `calculate_project_cost`

**Input schema:**

| Field              | Type                              | Required | Notes                                                                                                                                                     |
|--------------------|------------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `species`          | string                             | yes      | e.g. `"Black Walnut"`, `"Maple - Hard Maple"`, `"Oak - White Oak - Quarter Sawn"`. Sub-type/description is folded into this string with a `" - "` separator. |
| `quantity`         | number (> 0)                       | yes      | Unit is implied by `measurementType`.                                                                                                                    |
| `measurementType`  | enum: `"BOARD_FOOT"` \| `"LINEAR_FOOT"` | yes  | Currently all seeded data is `BOARD_FOOT`.                                                                                                                |
| `thickness`        | string                              | no       | Nominal board thickness, e.g. `"4/4"`, `"5/4"`, `"6/4"`, `"8/4"`, `"12/4"`, `"16/4"`. Required whenever a species has more than one stocked thickness.  |

**Success output (`structuredContent`):**

```json
{
  "species": "Black Walnut",
  "measurementType": "BOARD_FOOT",
  "thickness": "8/4",
  "quantity": 25,
  "unitPrice": 16.95,
  "totalCost": 423.75,
  "lastUpdated": "2026-07-16T00:00:00.000Z"
}
```

A human-readable `content` text block is also returned, e.g.:
`"Black Walnut: 25 BOARD_FOOT (8/4) x $16.95 = $423.75"`.

**Error output:** `isError: true` with a `content` text block. Common cases:

- Ambiguous thickness: `"Multiple thicknesses found for "Black Walnut": 4/4, 5/4, 6/4, 8/4, 12/4. Please specify a thickness."`
- Unknown species/thickness combination: `"No pricing found for "<species>" ..."`.

---

## 2. REST API (browsing/managing pricing data directly)

### `GET /api/v1/subapps/woodpricing`
Returns all `WoodMaterial` rows, ordered by `species`, `thickness`.

### `GET /api/v1/subapps/woodpricing/:species`
Returns all thickness/price variants for one species. URL-encode the species
string (it may contain spaces and `-`), e.g. `Maple%20-%20Hard%20Maple`.

### `POST /api/v1/subapps/woodpricing`
Creates a single material row. Body:

```json
{
  "species": "Black Walnut",
  "measurementType": "BOARD_FOOT",
  "thickness": "8/4",
  "unitPrice": 16.95,
  "dimensions": null
}
```

### `POST /api/v1/subapps/woodpricing/upsert-bulk`
Body: an array of the same shape as above. Upserts on the
`(species, measurementType, thickness)` key inside a DB transaction.

---

## 3. Data model (`WoodMaterial` entity → `woodpricing_materials` table)

| Field              | Type                                | Notes                                  |
|--------------------|---------------------------------------|------------------------------------------|
| `id`               | UUID                                   | primary key                             |
| `species`          | varchar(150)                           | includes sub-type when applicable       |
| `measurementType`  | enum: `BOARD_FOOT`, `LINEAR_FOOT`      | column `measurement_type`               |
| `thickness`        | varchar(10), nullable                  | e.g. `"4/4"`; part of the unique key    |
| `unitPrice`        | decimal(10,2)                          | column `unit_price`, price per unit of `measurementType` |
| `dimensions`       | jsonb, nullable                        | reserved for future stock-size metadata |
| `lastUpdated`      | timestamp                              | column `last_updated`, auto-updated on write |

Unique constraint: `(species, measurementType, thickness)`.

## Notes for frontend implementers

- Species names are free-text strings, not IDs — fetch `GET /woodpricing` once
  and build an autocomplete/dropdown from the distinct `species` + `thickness`
  combos rather than letting users type species freely, to avoid
  "species not found" errors.
- Several species have only one stocked thickness (e.g. `Acacia`, `Ebony`) —
  the frontend can omit the thickness selector for those, or always show it
  for consistency; the backend tolerates omission when unambiguous.
- All prices are per-board-foot in the current dataset; no `LINEAR_FOOT` rows
  exist yet, but the UI should still support that enum value for forward
  compatibility.

---

## Local development

```bash
# Run migrations (after building)
yarn build
yarn migrate:run

# Seed pricing data from data/wood-pricing-seed.json
yarn seed:woodpricing

# Run the app (HTTP + the /mcp Streamable HTTP endpoint)
yarn start:dev

# Run the same tool over stdio (for Cursor's MCP client config)
yarn mcp:stdio
```

## Module layout

```
woodpricing/
├── data/wood-pricing-seed.json       # converted from HardwoodPriceList.csv
├── dto/upsert-wood-material.dto.ts
├── entities/wood-material.entity.ts
├── enums/measurement-type.enum.ts
├── mcp/
│   ├── mcp-provider.service.ts       # builds McpServer + registers the tool
│   ├── mcp.controller.ts             # POST /mcp (Streamable HTTP)
│   └── mcp-stdio.ts                  # standalone stdio entrypoint
├── migrations/*.migration.ts
├── seed-wood-pricing.ts              # CLI seeder (yarn seed:woodpricing)
├── wood-pricing.controller.ts        # REST CRUD
├── wood-pricing.service.ts           # core business logic
└── woodpricing.module.ts
```
