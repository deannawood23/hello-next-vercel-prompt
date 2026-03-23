# AGENTS.md

## Project
- Repo: `hello-next-vercel-prompt`
- App type: Next.js admin interface backed by Supabase
- Current admin experience is branded as `Matrix`
- Primary active feature area: humor flavor prompt-chain management

## Matrix Scope
- `/admin` redirects to `/admin/data/humor-flavors`
- The Matrix UI is intentionally focused on humor flavors and prompt-chain testing
- The top bar stays visible with theme controls and account menu
- Sidebar is removed
- Unused legacy admin routes redirect back into the humor flavor flow

## Access Control
- Matrix pages should only work for users where one of these is true:
  - `profiles.is_superadmin = true`
  - `profiles.is_matrix_admin = true`
- Access enforcement currently lives in `src/lib/auth/requireSuperadmin.ts`

## Current Humor Flavor UX
- Home page:
  - searchable humor flavor card grid
  - alphabetical ordering
  - pagination
  - clicking anywhere on a flavor card opens that flavor’s Matrix page
- Flavor detail page:
  - overview with large slug and description
  - concise `FLAVOR DETAILS` block
  - top actions: `Add Step`, `Duplicate`, `Captions`, `Test`
  - `Duplicate` opens a modal on the same page
  - steps are collapsed by default
  - steps are not editable until the user explicitly clicks `Edit Step`
- Separate routes:
  - `app/admin/data/humor-flavors/[id]/add-step/page.tsx`
  - `app/admin/data/humor-flavors/[id]/captions/page.tsx`
  - `app/admin/data/humor-flavors/[id]/test/page.tsx`
  - `app/admin/data/humor-flavors/[id]/test/[setId]/page.tsx`

## Prompt Chain Behavior
- A humor flavor is an ordered list of `humor_flavor_steps`
- Step order is controlled by `humor_flavor_steps.order_by`
- Reordering is persisted by rewriting `order_by` across the step list
- Step display should prioritize:
  - step number
  - step type
  - prompts
- Expanded step views should stay concise and avoid repeating metadata already shown in the header

## Important Schema Notes
- The schema below is context only and should not be executed from this file
- Most useful tables for Matrix work:

### Auth / Profiles
- `profiles`
  - key admin flags:
    - `is_superadmin`
    - `is_matrix_admin`

### Humor Flavor Core
- `humor_flavors`
  - `id`
  - `slug`
  - `description`
  - `created_datetime_utc`
- `humor_flavor_steps`
  - `id`
  - `humor_flavor_id`
  - `order_by`
  - `llm_input_type_id`
  - `llm_output_type_id`
  - `llm_model_id`
  - `humor_flavor_step_type_id`
  - `llm_system_prompt`
  - `llm_user_prompt`
  - `llm_temperature`
  - `description`
- `humor_flavor_step_types`
  - `id`
  - `slug`
  - `description`

### LLM Lookup Tables
- `llm_input_types`
  - important: has `slug` and `description`
  - important: does not have `name`
- `llm_output_types`
  - important: has `slug` and `description`
- `llm_models`
  - has `name`
- `llm_model_responses`
  - audit trail for exact prompt/model output
  - includes `humor_flavor_step_id`

### Caption / Image Tables
- `captions`
  - generated caption records
  - linked to `humor_flavor_id`, `image_id`, `caption_request_id`, `llm_prompt_chain_id`
- `images`
  - `id`
  - `url`
  - `image_description`
  - `is_common_use`

### Study Testing Tables
- `study_image_sets`
  - image test-set definitions
- `study_image_set_image_mappings`
  - real mapping table between image sets and images
  - use this table first when loading images for a study image set
- `studies`
  - study entities
- `study_caption_mappings`
  - maps captions to studies
  - not fully wired into the Matrix captions flow yet

## Critical Implementation Notes
- `llm_input_types` and `llm_output_types` should not be ordered by `name`
  - use `slug`/`description` or generic sort helpers
- For flavor steps, related lookup rows should come from FK-backed joins off `humor_flavor_steps`
  - current helper: `app/admin/data/humor-flavors/[id]/_lib.ts`
- Step type description should come from `humor_flavor_step_types.description`
  - only fall back to `humor_flavor_steps.description` if needed
- Study image-set previews and counts should use `study_image_set_image_mappings`
  - earlier guessed relation names produced incorrect zero-image results

## Testing Flow
- `Test` should first show a grid of `study_image_sets`
- Each set card should show:
  - set name
  - description
  - image count
  - small image previews
- Clicking a set opens a dedicated run page
- The run page:
  - generates captions for each image in sequence
  - shows progressive loading/results
  - provides `View Captions`
- API endpoint used for generation:
  - `https://api.almostcrackd.ai/pipeline/generate-captions`

## Theme / Styling Notes
- Matrix supports:
  - light
  - dark
  - system
- Theme toggle lives in the top bar
- Light mode needed explicit darker text overrides for readability
- The flavor home page uses a centered inner max-width so content does not hug the left side

## Files To Check First For Matrix Changes
- `components/admin/AdminShell.tsx`
- `components/admin/ThemeToggle.tsx`
- `components/admin/HumorFlavorSetTester.tsx`
- `app/admin/page.tsx`
- `app/admin/data/[resource]/page.tsx`
- `app/admin/data/humor-flavors/[id]/page.tsx`
- `app/admin/data/humor-flavors/[id]/_lib.ts`
- `app/admin/data/humor-flavors/[id]/add-step/page.tsx`
- `app/admin/data/humor-flavors/[id]/captions/page.tsx`
- `app/admin/data/humor-flavors/[id]/test/page.tsx`
- `app/admin/data/humor-flavors/[id]/test/[setId]/page.tsx`
- `src/lib/auth/requireSuperadmin.ts`

## Working Conventions
- Prefer using the existing Matrix routes instead of reintroducing old admin UX
- Keep flavor detail pages concise and scan-friendly
- Avoid inline expansion of large secondary tools when a separate route is clearer
- Preserve the top bar and theme behavior
- When changing step data behavior, verify against the actual Supabase schema rather than guessing field names

## Verification
- Standard verification used in this repo:
  - `npm run build`
  - `npm run lint`
