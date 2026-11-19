# Security Specification — Valterra Quant Firestore Rules

## 1. Data Invariants
1. **Identity Isolation (Master Gate)**: All user data lives under `/users/{userId}`, `/users/{userId}/portfolios/{portfolioId}`, and `/users/{userId}/stressTests/{testId}`. Only an authenticated user with `request.auth.token.email_verified == true` and `request.auth.uid == userId` may read or write any document inside their tree.
2. **No Shadow Fields**: Every `create` strictly checks `keys().hasAll(...) && keys().hasOnly(...)`, and every `update` strictly checks `affectedKeys().hasOnly(...)`.
3. **Immutable Ownership & Creation Timestamps**: `uid`, `ownerId`, and `createdAt` cannot be modified after creation. `createdAt` and `updatedAt` must equal `request.time`.
4. **Bounded Arrays & Validated Identifiers**: Document IDs must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` chars. Portfolio `tickers` and `weights` lists must have size between `2` and `12`, matching equal length, with element type validation (`tickers[0] is string`, `weights[0] is number`).
5. **PII Protection**: User email resides exclusively inside `/users/{userId}` where `allow get` is restricted to `isOwner(userId)` and `allow list` is explicitly denied (`if false`).

## 2. Adversarial "Dirty Dozen" Test Payloads
1. **Unauthenticated read on `/users/u1`**: Denied (`isSignedIn()` fails).
2. **Cross-user get on `/users/u2/portfolios/p1` by `u1`**: Denied (`isOwner(userId)` fails).
3. **List scraping on `/users` by `u1`**: Denied (`allow list: if false` on `/users`).
4. **Unverified email write (`email_verified: false`)**: Denied (`isVerifiedUser()` fails).
5. **Identity spoofing (`ownerId: "u2"` inside `/users/u1/portfolios/p1`)**: Denied (`incoming().ownerId == request.auth.uid`).
6. **Shadow field injection (`isAdmin: true` in UserProfile)**: Denied (`keys().hasOnly(...)`).
7. **ID poisoning (`portfolioId` of 500 chars with `$`)**: Denied (`isValidId(portfolioId)`).
8. **Client-forged `createdAt` timestamp**: Denied (`incoming().createdAt == request.time`).
9. **Immutable `ownerId` mutation on portfolio update**: Denied (`incoming().ownerId == existing().ownerId` & `affectedKeys().hasOnly(...)`).
10. **Unbounded `tickers` array (> 12 items)**: Denied (`data.tickers.size() <= 12`).
11. **Invalid sector enum (`sector: "crypto_meme"`)**: Denied (`data.sector in [...]`).
12. **Stress test numeric poisoning (`volMultiplier: "high"`)**: Denied (`data.volMultiplier is number`).
