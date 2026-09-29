# osrs-data-hub changes for the guild map

The map works with the hub's current `/api/v1` and a personal API key. The hub changes below make the
integration sturdier and unlock two features that are already built on the map side:

- a key that belongs to the guild rather than to one person;
- automatic player ↔ user linking;
- exact matching of players the map also receives directly.

Start a new Claude Code session on `RedFirebreak/osrs-data-hub` and paste the prompt below.

What the map already reads (all optional, detected at runtime, see `server/src/hub/models.rs`):

| Hub field / endpoint | Used for |
|---|---|
| `owner.discord_id` on `/snapshot` accounts | links the player to the map user who logged in with that Discord account |
| `account_hash` on `/snapshot` accounts | matches a hub account to a player the map also gets directly |
| `key.kind` on `/me` | shown in the map's admin "Test connection" result |
| `/xp?accounts=` (batches of 10), `/accounts/{id}/locations`, `/leaderboards/gains`, `/events` | graphs, trails, Activity page |

---

## Prompt

> **Task: API additions to osrs-data-hub for the ha-osrs-map guild live map**
>
> ha-osrs-map (github.com/RedFirebreak/ha-osrs-map) is our guild live map. Its Rust backend polls this hub's
> `/api/v1` server-side; the key never reaches browsers.
>
> - It mirrors `GET /snapshot` into its own database every 5 s, using `since` and `If-None-Match`, plus a
>   full refresh every 2 minutes.
> - It proxies, with a short cache:
>   - `GET /xp?accounts=` in batches of 10, for its XP graphs;
>   - `GET /accounts/{id}/locations` for a trail layer;
>   - `GET /leaderboards/gains` and a single `GET /events` cursor follower for an activity page.
> - The consumer code is in `server/src/hub/` of that repo.
>
> Today it works with a personal API key. Please add the following to the hub:
>
> - Keep v1 additive (D-71).
> - Record each decision in `docs/ARCHITECTURE.md` as a new D-number.
> - Document it in `docs/API.md` and in the zod/OpenAPI schemas.
> - Add tests next to the existing `apps/web/src/app/api/v1/*.test.ts` and `packages/server/src/api/*.test.ts`.
>
> 1. **Integration keys (service keys). Required.**
>    - **Creating them.** Hub admins create them on a new admin page, e.g. `/admin/integrations`, backed
>      by `/api/app/admin/service-keys` routes. Creating and revoking one is audited, like D-76.
>    - **Format and storage.** Same `ohub_<prefix>_<secret>` format and storage as D-69. Mark them with a
>      `kind: 'service'` column, or use a separate table if that is cleaner.
>    - **Ownership.** They belong to no user. Offboarding a user, including the admin who created the
>      key, never revokes them, and they don't count toward the 10-keys-per-user limit.
>    - **Access is the guild audience.** The key sees exactly what an active guild member who is neither
>      owner, contributor nor grantee of an account would see: the accounts and categories whose sharing
>      audience is `guild`. `private` and `selected` stay hidden.
>      - There is still no admin override; D-70 stands.
>      - Evaluate access on every request through the existing resolver, by adding a guild-audience
>        principal to `resolveAccess`. Don't build a parallel code path.
>    - **Categories and expiry.** Same as user keys.
>    - **Rate limits.** Configurable per key, default 600 requests per minute; `/snapshot` stays at 1 per
>      second.
>    - **`/me`.** Reports `key.kind` (`user` or `service`) and `user: null` for service keys.
> 2. **Owner identity on accounts. Required, for automatic linking.**
>    - On `/snapshot`, `/accounts` and `/accounts/{id}`, add `owner: { name, discord_id }`.
>    - Include it only where the guild page would already show that owner to a guild member (D-68).
>      Never expose contributors.
>    - For user keys, include it when the key's creator can see the owner; otherwise leave it out.
> 3. **`account_hash` on accounts.** This is the plugin's salted SHA-224 `accountHash`.
>    - The map stores the same value from players who pair with it directly, so it can match a hub
>      account to the same player without relying on the name.
>    - Expose it to service keys. Decide whether it is also harmless for user keys, and record the
>      decision.
> 4. **Bulk history.**
>    - Raise the `/xp?accounts=` limit to 50 accounts for service keys; user keys stay at 10. Tell me the
>      new limit so the map can raise its batch size.
>    - Optionally add `GET /locations?accounts=a,b&from=&to=` (`location_history`). It returns every
>      account's trail in one call, with the same point format and thinning as
>      `/accounts/{id}/locations`.
> 5. **Optional: push for API keys.** A key-authenticated SSE stream of snapshot changes
>    (`GET /api/v1/stream`), which resolves open point §18.3 in `docs/design/HANDOFF-draft2.md`.
>    - Only build it if it fits the single-replica LISTEN/NOTIFY design (D-5).
>    - If it doesn't, record it as deferred.
>
> **Verify:**
>
> - `pnpm test`, `pnpm typecheck` and `pnpm lint` pass.
> - By hand:
>   1. Create a service key as an admin.
>   2. A `private` account is hidden and a `guild` account is visible.
>   3. Offboarding the admin who created the key leaves the key working.
>   4. `/api/v1/openapi.json` shows the new fields.
>
> Commit on a feature branch and push it.
