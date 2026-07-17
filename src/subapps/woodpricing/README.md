# Wood Pricing MCP Server

A siloed NestJS subapp that stores hardwood lumber pricing (`WoodMaterial` /
`woodpricing_materials`) and exposes it exclusively through **two MCP
(Model Context Protocol) tools** over **Streamable HTTP** (for ChatGPT Apps /
remote clients) and **stdio** (for local Cursor / CLI use). There is no REST
API — the MCP tools are the only surface, by design (see "Design notes"
below).

This document is the contract for anyone building a frontend (a ChatGPT Apps
widget, etc.) or connecting an MCP client against this backend.

## Base URL

- Local dev: `http://localhost:3000/api/v1/subapps/woodpricing/mcp`
- Production: `https://<deployed-host>/api/v1/subapps/woodpricing/mcp`

## Auth

No authentication is required in this MVP — `/mcp` is public
(`@Auth(AuthType.None)`). OAuth 2.1 (Protected Resource Metadata, DCR/CIMD)
will be required before this is submitted as a public ChatGPT app; do not
assume "no auth" is permanent.

## Rate limiting

Every route in this app inherits a global default of **10 requests/60s per
IP** (`ThrottlerModule` + a global `APP_GUARD`, configured in `app.module.ts`).
`POST /mcp` overrides this with a higher, tool-specific limit of **60
requests/60s per IP** (`@Throttle(...)` in `mcp.controller.ts`), since a single
ChatGPT conversation turn can fan out into several JSON-RPC requests
(`initialize`, `tools/list`, `tools/call`, ...) against the stateless
transport. Tune this if real usage patterns differ.

---

## MCP Tool Contract

Endpoint: `POST /api/v1/subapps/woodpricing/mcp` (Streamable HTTP, stateless —
JSON-RPC 2.0 per the MCP spec). `GET` on this path returns `405`.

Local/dev-only stdio entrypoint: `yarn mcp:stdio` (serves the identical tools
over stdio for Cursor's MCP client config; not reachable over HTTP).

There are exactly **two tools**, meant to be called in sequence: discover
with `get_material_catalog`, then compute with `calculate_project_cost` using
values taken directly from the catalog. This avoids the model (or the
underlying service) ever having to guess or disambiguate — `thickness` in
`calculate_project_cost` is required and must be a value that came from the
catalog, so there's no "which thickness did you mean?" round-trip.

### Tool 1: `get_material_catalog`

Zero input parameters. Returns the entire pricing catalog in one call (small
dataset — ~90 species/measurement-type groups, 121 total priced rows).

**Success output (`structuredContent`):**

```json
{
  "materials": [
    {
      "species": "Black Walnut",
      "measurementType": "BOARD_FOOT",
      "availableThicknesses": [
        { "thickness": "4/4", "unitPrice": 14.50 },
        { "thickness": "5/4", "unitPrice": 15.95 },
        { "thickness": "6/4", "unitPrice": 15.95 },
        { "thickness": "8/4", "unitPrice": 16.95 },
        { "thickness": "12/4", "unitPrice": 18.95 }
      ],
      "lastUpdated": "2026-07-16T00:00:00.000Z"
    },
    {
      "species": "Acacia",
      "measurementType": "BOARD_FOOT",
      "availableThicknesses": [
        { "thickness": "4/4", "unitPrice": 11.95 }
      ],
      "lastUpdated": "2026-07-16T00:00:00.000Z"
    }
  ]
}
```

A short `content` text summary is also returned (e.g. `"Returned pricing for
90 species/measurement-type group(s)."`) — the array above is the part a
widget/LLM should actually parse.

### Tool 2: `calculate_project_cost`

**Input schema:**

| Field       | Type          | Required | Notes                                                                                   |
|-------------|---------------|----------|-------------------------------------------------------------------------------------------|
| `species`   | string        | yes      | Must exactly match a `species` value from `get_material_catalog`.                        |
| `thickness` | string        | yes      | Must exactly match one of that species' `availableThicknesses[].thickness` values.        |
| `quantity`  | number (> 0)  | yes      | Unit is implied by the species' `measurementType` (currently always `BOARD_FOOT`).        |

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

**Error output:** `isError: true` with a `content` text block, e.g. `"No
pricing found for "<species>" at thickness "<thickness>". Call
get_material_catalog to see valid species/thickness combinations."` — this
should be rare in practice since a well-behaved client always sources
`species`/`thickness` from the catalog first.

---

## Data model (`WoodMaterial` entity → `woodpricing_materials` table)

| Field              | Type                                | Notes                                  |
|--------------------|---------------------------------------|------------------------------------------|
| `id`               | UUID                                   | primary key                             |
| `species`          | varchar(150)                           | includes sub-type when applicable       |
| `measurementType`  | enum: `BOARD_FOOT`, `LINEAR_FOOT`      | column `measurement_type`               |
| `thickness`        | varchar(10), nullable                  | e.g. `"4/4"`; part of the unique key    |
| `unitPrice`        | decimal(10,2)                          | column `unit_price`, price per unit of `measurementType` |
| `dimensions`       | jsonb, nullable                        | reserved for future stock-size metadata |
| `lastUpdated`      | timestamp                              | column `last_updated`, auto-updated on write |

Unique constraint: `(species, measurementType, thickness)`. This table has no
REST surface — it's only read/written via `WoodPricingService`, called from
the two MCP tools above and from `seed-wood-pricing.ts`.

## Design notes

- **No REST API.** Earlier drafts of this module exposed admin REST CRUD
  endpoints; those were removed. The only way in or out of this data is the
  two MCP tools (for reads) and the seed script (for writes). Keep it that
  way unless there's a concrete need for direct HTTP access.
- **Catalog-first, not thickness-guessing.** The original single-tool design
  made `thickness` optional on `calculate_project_cost` and had the service
  throw a "which thickness did you mean?" error when a species had multiple
  stocked thicknesses. That pushed disambiguation logic into the tool
  response, which the model then had to parse and retry against. Splitting
  into `get_material_catalog` (discovery) + `calculate_project_cost`
  (computation, with `thickness` required) moves disambiguation to a single
  upfront listing instead, which is easier for both the LLM and a widget to
  reason about, and removes a whole class of retry-on-error tool calls.

## Local development

```bash
# Build (also copies data/wood-pricing-seed.json into dist/)
yarn build

# Run migrations
yarn migrate:run

# Seed pricing data from the built data/wood-pricing-seed.json
yarn seed:woodpricing

# Run the app (HTTP + the /mcp Streamable HTTP endpoint)
yarn start:dev

# Run the same tools over stdio (for Cursor's MCP client config)
yarn mcp:stdio
```

`seed:woodpricing` runs against the **compiled** `dist/` output (`node
dist/src/subapps/woodpricing/seed-wood-pricing.js`), not `ts-node` — this is
required because Heroku prunes `devDependencies` (`ts-node`, `tsconfig-paths`,
`typescript`) from the production slug after building, so `ts-node` isn't
available at runtime via `heroku run`. Always run `yarn build` before
`yarn seed:woodpricing` (same requirement as `yarn migrate:run`).

On Heroku, seed with: `heroku run yarn seed:woodpricing --app <your-app-name>`
(no separate build step needed — Heroku already built `dist/` during deploy).
`mcp:stdio` is local-only (Cursor's MCP client config) and still uses
`ts-node`, since it's never meant to run on a production dyno.

## Module layout

```
woodpricing/
├── data/wood-pricing-seed.json       # converted from HardwoodPriceList.csv
├── dto/upsert-wood-material.dto.ts   # internal type for seeding, not a validated REST DTO
├── entities/wood-material.entity.ts
├── enums/measurement-type.enum.ts
├── mcp/
│   ├── mcp-provider.service.ts       # builds McpServer + registers both tools
│   ├── mcp.controller.ts             # POST /mcp (Streamable HTTP)
│   └── mcp-stdio.ts                  # standalone stdio entrypoint
├── migrations/*.migration.ts
├── seed-wood-pricing.ts              # CLI seeder (yarn seed:woodpricing)
├── wood-pricing.service.ts           # core business logic
└── woodpricing.module.ts
```
