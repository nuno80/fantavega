# src/lib/db/services - Business Logic Core

## Package Identity
- **Role**: The "Brain" of the application. Encapsulates all business rules, database interactions, and real-time triggers.
- **Components**: Service classes (singleton or static patterns) that handle transactional logic.

## Key Services
- **`bid.service.ts`**: Manages auctions, bids, auto-bids, and timer resets. Triggers `auction-update` events.
- **`penalty.service.ts`**: Implements the compliance engine.
  - **Rules**: 1h grace period, 5 credit penalty/hour, max 25 credits.
  - **Lazy Evaluation**: Checks triggered on user value-add actions (login, bid).
- **`auction-league.service.ts`**: League management, participant state.
- **`player.service.ts`**: Player CRUD and search logic.

## Real-Time Pattern (Socket.IO)
This layer is responsible for PUSHING updates to the UI via `socket-server.ts`.
1. **Action**: User places a bid via Server Action.
2. **Service**: `BidService` validates and updates DB (transactional).
3. **Trigger**: `BidService` calls `notifySocketServer(event, payload)`.
4. **Broadcast**: Socket server pushes to room `league-[id]`.

## Conventions
- **Transactional**: Methods modifying multiple tables MUST use `db.transaction()`.
- **Validation**: Validate input at the service boundary using Zod or manual checks.
- **Return Types**: Return typed objects, not raw database rows when possible.
- **Error Handling**: Throw specific errors (e.g. `AuctionClosedError`) to be caught by Server Actions.

## JIT Index Hints
- Find business logic: `rg "class .*Service" src/lib/db/services`
- Find notification triggers: `rg "notifySocketServer" src/lib/db/services`
