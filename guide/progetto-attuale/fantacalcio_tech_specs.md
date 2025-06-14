# Fantacalcio Auction System - Technical Specifications

## File System Structure

```
fantacalcio-auction/
├── Frontend/ (Next.js 15)
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── dashboard/
│   │   ├── auction/
│   │   │   ├── [id]/
│   │   │   └── setup/
│   │   ├── players/
│   │   ├── admin/
│   │   └── api/
│   │       ├── auth/
│   │       ├── auctions/
│   │       ├── bids/
│   │       ├── players/
│   │       └── websocket/
│   ├── components/
│   │   ├── ui/ (shadcn/ui components)
│   │   ├── auction/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   └── admin/
│   ├── lib/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── websocket/
│   │   └── utils/
│   ├── hooks/
│   ├── types/
│   └── middleware.ts
├── Backend/ (Integrated with Next.js)
│   ├── database/
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   └── seeds/
│   ├── services/
│   │   ├── auction.service.ts
│   │   ├── bid.service.ts
│   │   ├── player.service.ts
│   │   └── notification.service.ts
│   └── utils/
├── Docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx.conf
├── Tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── Docs/
    ├── api/
    └── deployment/
```

---

## Feature Specifications

### **Feature 1: Extended Auction System**

* **Goal**
  
  Implement a 24-hour countdown auction system with real-time bidding, automatic timer resets, and three bidding modes (quick, manual, auto-bid).

* **API relationships**
  
  - `/api/auctions` - CRUD operations for auctions
  - `/api/bids` - Bid placement and history
  - `/api/websocket` - Real-time updates
  - `/api/players` - Player data retrieval
  - `/api/notifications` - Bid notifications

* **Detailed requirements**
  
  - Timer resets to 24 hours on each new bid
  - Support for 3 bidding modes with validation
  - Real-time updates via WebSocket connections
  - Concurrent bid conflict resolution
  - Automatic auction completion and player assignment
  - Budget validation before bid placement
  - Notification system for bid updates
  - Admin controls for auction management

* **Implementation guide**

#### Architecture Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Next.js API   │    │   BetterSQLite  │
│   (React)       │◄──►│   Routes        │◄──►│   Database      │
│                 │    │                 │    │                 │
│   WebSocket     │◄──►│   WebSocket     │    │   Auction Timer │
│   Client        │    │   Server        │    │   Jobs          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### Database Schema
```sql
-- Auctions table
CREATE TABLE auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    current_bid INTEGER DEFAULT 1,
    current_winner_id INTEGER,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status TEXT CHECK(status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (current_winner_id) REFERENCES users(id)
);

-- Bids table
CREATE TABLE bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    bid_type TEXT CHECK(bid_type IN ('manual', 'auto', 'quick')) DEFAULT 'manual',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auction_id) REFERENCES auctions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Auto-bids table
CREATE TABLE auto_bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    max_amount INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auction_id) REFERENCES auctions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_auctions_status ON auctions(status);
CREATE INDEX idx_auctions_end_time ON auctions(end_time);
CREATE INDEX idx_bids_auction_timestamp ON bids(auction_id, timestamp DESC);
CREATE INDEX idx_auto_bids_auction_active ON auto_bids(auction_id, is_active);
```

#### API Design
```typescript
// GET /api/auctions/[id]
interface AuctionResponse {
    id: number;
    player: PlayerData;
    currentBid: number;
    currentWinner: UserData | null;
    timeRemaining: number;
    status: 'active' | 'completed' | 'cancelled';
    bidHistory: BidData[];
    autoBids: AutoBidData[];
}

// POST /api/bids
interface PlaceBidRequest {
    auctionId: number;
    amount?: number; // Optional for quick bids
    bidType: 'manual' | 'auto' | 'quick';
    maxAmount?: number; // For auto-bids
}

interface PlaceBidResponse {
    success: boolean;
    bid: BidData;
    updatedAuction: AuctionResponse;
    errors?: string[];
}
```

#### Frontend Component Hierarchy
```
AuctionPage
├── AuctionHeader
│   ├── PlayerCard
│   └── AuctionTimer
├── BiddingInterface
│   ├── QuickBidButton
│   ├── ManualBidInput
│   └── AutoBidModal
├── BidHistory
└── BudgetTracker
```

#### WebSocket Implementation
```typescript
// WebSocket message types
interface WebSocketMessage {
    type: 'bid_placed' | 'auction_ended' | 'timer_update' | 'user_joined';
    data: any;
    auctionId: number;
    userId?: number;
}

// Client-side WebSocket handler
function handleWebSocketMessage(message: WebSocketMessage) {
    switch (message.type) {
        case 'bid_placed':
            updateAuctionState(message.data);
            showNotification(`New bid: ${message.data.amount}`);
            break;
        case 'auction_ended':
            showAuctionEndModal(message.data);
            break;
        case 'timer_update':
            updateTimer(message.data.timeRemaining);
            break;
    }
}
```

#### Bid Conflict Resolution
```typescript
async function placeBid(auctionId: number, userId: number, amount: number) {
    return await db.transaction(async (tx) => {
        // Lock auction row to prevent concurrent modifications
        const auction = await tx.get(
            'SELECT * FROM auctions WHERE id = ? AND status = "active" FOR UPDATE',
            auctionId
        );
        
        if (!auction) throw new Error('Auction not found or inactive');
        
        // Validate bid amount
        if (amount <= auction.current_bid) {
            throw new Error('Bid must be higher than current bid');
        }
        
        // Check user budget
        const user = await tx.get('SELECT budget FROM users WHERE id = ?', userId);
        if (user.budget < amount) {
            throw new Error('Insufficient budget');
        }
        
        // Insert bid
        const bid = await tx.run(
            'INSERT INTO bids (auction_id, user_id, amount) VALUES (?, ?, ?)',
            auctionId, userId, amount
        );
        
        // Update auction
        await tx.run(
            'UPDATE auctions SET current_bid = ?, current_winner_id = ?, end_time = datetime("now", "+24 hours") WHERE id = ?',
            amount, userId, auctionId
        );
        
        return bid;
    });
}
```

#### Timer Management
```typescript
class AuctionTimer {
    private timers: Map<number, NodeJS.Timeout> = new Map();
    
    startTimer(auctionId: number, endTime: Date) {
        const timeRemaining = endTime.getTime() - Date.now();
        
        const timer = setTimeout(async () => {
            await this.completeAuction(auctionId);
        }, timeRemaining);
        
        this.timers.set(auctionId, timer);
    }
    
    resetTimer(auctionId: number) {
        const existingTimer = this.timers.get(auctionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        
        const newEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        this.startTimer(auctionId, newEndTime);
    }
    
    private async completeAuction(auctionId: number) {
        // Complete auction logic
        await auctionService.completeAuction(auctionId);
        this.timers.delete(auctionId);
    }
}
```

---

### **Feature 2: User Management & Authentication**

* **Goal**
  
  Implement secure user authentication using Clark, role-based access control, and user profile management with budget tracking.

* **API relationships**
  
  - `/api/auth/*` - Authentication endpoints
  - `/api/users` - User CRUD operations
  - `/api/admin/users` - Admin user management
  - Clark Authentication Service (External)

* **Detailed requirements**
  
  - Clark authentication integration
  - JWT token management with refresh tokens
  - Role-based access control (admin/manager)
  - User registration approval workflow
  - Budget tracking and management
  - Profile management with avatar upload
  - Admin dashboard for user oversight

* **Implementation guide**

#### Database Schema
```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clark_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT CHECK(role IN ('admin', 'manager')) DEFAULT 'manager',
    budget INTEGER DEFAULT 200,
    spent_amount INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User sessions
CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User preferences
CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    bid_sound_alerts BOOLEAN DEFAULT FALSE,
    theme TEXT DEFAULT 'light',
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Authentication Flow
```typescript
// Clark authentication integration
async function authenticateWithClark(token: string) {
    const clarkUser = await clarkApi.verifyToken(token);
    
    let user = await db.get(
        'SELECT * FROM users WHERE clark_id = ?',
        clarkUser.id
    );
    
    if (!user) {
        // Create new user
        user = await createUser({
            clarkId: clarkUser.id,
            email: clarkUser.email,
            username: clarkUser.username,
            fullName: clarkUser.fullName,
            status: 'pending' // Requires admin approval
        });
    }
    
    // Generate JWT
    const jwt = generateJWT({
        userId: user.id,
        role: user.role,
        sessionId: generateSessionId()
    });
    
    return { user, token: jwt };
}
```

#### Authorization Middleware
```typescript
function requireAuth(roles?: string[]) {
    return async (req: NextRequest) => {
        const token = req.headers.get('authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        try {
            const payload = verifyJWT(token);
            const user = await getUserById(payload.userId);
            
            if (!user || user.status !== 'active') {
                return NextResponse.json({ error: 'User not active' }, { status: 403 });
            }
            
            if (roles && !roles.includes(user.role)) {
                return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
            }
            
            req.user = user;
        } catch (error) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
    };
}
```

---

### **Feature 3: Real-Time Bidding Interface**

* **Goal**
  
  Create an intuitive bidding interface supporting three bidding modes with real-time updates and conflict resolution.

* **API relationships**
  
  - `/api/bids` - Bid placement
  - `/api/websocket` - Real-time updates
  - `/api/auctions/[id]` - Auction state
  - `/api/users/budget` - Budget validation

* **Detailed requirements**
  
  - Three bidding modes: quick (+1), manual amount, auto-bid
  - Real-time bid validation and feedback
  - Budget constraint enforcement
  - Optimistic UI updates with rollback capability
  - Auto-bid management and conflict resolution
  - Mobile-responsive touch interface

* **Implementation guide**

#### Component Architecture
```typescript
// BiddingInterface component
interface BiddingInterfaceProps {
    auction: AuctionData;
    userBudget: number;
    onBidPlaced: (bid: BidData) => void;
}

function BiddingInterface({ auction, userBudget, onBidPlaced }: BiddingInterfaceProps) {
    const [bidMode, setBidMode] = useState<'quick' | 'manual' | 'auto'>('quick');
    const [customAmount, setCustomAmount] = useState('');
    const [autoBidMax, setAutoBidMax] = useState(0);
    const [isPlacingBid, setIsPlacingBid] = useState(false);
    
    const handleQuickBid = async () => {
        const amount = auction.currentBid + 1;
        await placeBid(amount, 'quick');
    };
    
    const handleManualBid = async () => {
        const amount = parseInt(customAmount);
        await placeBid(amount, 'manual');
    };
    
    const handleAutoBid = async () => {
        await setupAutoBid(autoBidMax);
    };
    
    return (
        <div className="bidding-interface">
            <BidModeSelector value={bidMode} onChange={setBidMode} />
            {bidMode === 'quick' && <QuickBidButton onClick={handleQuickBid} />}
            {bidMode === 'manual' && <ManualBidInput onSubmit={handleManualBid} />}
            {bidMode === 'auto' && <AutoBidSetup onSubmit={handleAutoBid} />}
        </div>
    );
}
```

#### Auto-Bid Logic
```typescript
async function processAutoBids(auctionId: number, newBidAmount: number) {
    const autoBids = await db.all(`
        SELECT ab.*, u.budget 
        FROM auto_bids ab
        JOIN users u ON ab.user_id = u.id
        WHERE ab.auction_id = ? AND ab.is_active = TRUE AND ab.max_amount > ?
        ORDER BY ab.max_amount DESC, ab.created_at ASC
    `, auctionId, newBidAmount);
    
    for (const autoBid of autoBids) {
        const nextBidAmount = newBidAmount + 1;
        
        if (nextBidAmount <= autoBid.max_amount && nextBidAmount <= autoBid.budget) {
            await placeBid(auctionId, autoBid.user_id, nextBidAmount, 'auto');
            break; // Only one auto-bid processes per trigger
        }
    }
}
```

#### Optimistic Updates
```typescript
function useOptimisticBidding() {
    const [optimisticBids, setOptimisticBids] = useState<BidData[]>([]);
    
    const placeBidOptimistically = async (amount: number, type: BidType) => {
        const optimisticBid: BidData = {
            id: `temp-${Date.now()}`,
            amount,
            type,
            timestamp: new Date(),
            userId: currentUser.id,
            status: 'pending'
        };
        
        setOptimisticBids(prev => [...prev, optimisticBid]);
        
        try {
            const actualBid = await bidApi.placeBid({ amount, type });
            setOptimisticBids(prev => 
                prev.filter(bid => bid.id !== optimisticBid.id)
            );
            return actualBid;
        } catch (error) {
            // Rollback optimistic update
            setOptimisticBids(prev => 
                prev.map(bid => 
                    bid.id === optimisticBid.id 
                        ? { ...bid, status: 'failed', error: error.message }
                        : bid
                )
            );
            throw error;
        }
    };
    
    return { optimisticBids, placeBidOptimistically };
}
```

---

### **Feature 4: Free Agent Management**

* **Goal**
  
  Provide comprehensive player database management with search, filtering, and export capabilities for unassigned players.

* **API relationships**
  
  - `/api/players` - Player CRUD operations
  - `/api/players/search` - Advanced search and filtering
  - `/api/export` - Data export functionality
  - `/api/admin/players` - Admin player management

* **Detailed requirements**
  
  - Player database with comprehensive statistics
  - Advanced search and filtering (position, team, availability)
  - Export functionality (CSV/JSON formats)
  - Player assignment tracking
  - Batch operations for admin users
  - Image upload and management for player photos

* **Implementation guide**

#### Database Schema
```sql
-- Players table
CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    team TEXT NOT NULL,
    jersey_number INTEGER,
    photo_url TEXT,
    is_assigned BOOLEAN DEFAULT FALSE,
    assigned_to_user_id INTEGER,
    last_season_points INTEGER DEFAULT 0,
    market_value INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
);

-- Player statistics
CREATE TABLE player_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    season TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    fantasy_points INTEGER DEFAULT 0,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Indexes for search performance
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_team ON players(team);
CREATE INDEX idx_players_assigned ON players(is_assigned);
CREATE INDEX idx_player_stats_season ON player_stats(season);
```

#### Search and Filtering API
```typescript
// GET /api/players/search
interface PlayerSearchParams {
    query?: string;
    position?: string[];
    team?: string[];
    available?: boolean;
    minPoints?: number;
    maxValue?: number;
    page?: number;
    limit?: number;
    sortBy?: 'name' | 'position' | 'team' | 'points' | 'value';
    sortOrder?: 'asc' | 'desc';
}

async function searchPlayers(params: PlayerSearchParams) {
    let query = `
        SELECT p.*, ps.fantasy_points as last_season_points
        FROM players p
        LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season = '2023'
        WHERE 1=1
    `;
    
    const conditions = [];
    const values = [];
    
    if (params.query) {
        conditions.push('p.name LIKE ?');
        values.push(`%${params.query}%`);
    }
    
    if (params.position?.length) {
        conditions.push(`p.position IN (${params.position.map(() => '?').join(',')})`);
        values.push(...params.position);
    }
    
    if (params.available !== undefined) {
        conditions.push('p.is_assigned = ?');
        values.push(params.available ? 0 : 1);
    }
    
    if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
    }
    
    // Add sorting
    const sortField = params.sortBy || 'name';
    const sortOrder = params.sortOrder || 'asc';
    query += ` ORDER BY ${sortField} ${sortOrder}`;
    
    // Add pagination
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    
    const players = await db.all(query, values);
    const total = await db.get('SELECT COUNT(*) as count FROM players WHERE ...');
    
    return {
        players,
        pagination: {
            page: params.page || 1,
            limit,
            total: total.count,
            pages: Math.ceil(total.count / limit)
        }
    };
}
```

#### Export Functionality
```typescript
// Export service
class ExportService {
    async exportPlayers(format: 'csv' | 'json', filters: PlayerSearchParams) {
        const players = await searchPlayers({ ...filters, limit: 10000 });
        
        if (format === 'csv') {
            return this.generateCSV(players.players);
        } else {
            return this.generateJSON(players.players);
        }
    }
    
    private generateCSV(players: PlayerData[]) {
        const headers = ['Name', 'Position', 'Team', 'Fantasy Points', 'Market Value', 'Status'];
        const rows = players.map(player => [
            player.name,
            player.position,
            player.team,
            player.last_season_points,
            player.market_value,
            player.is_assigned ? 'Assigned' : 'Available'
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    private generateJSON(players: PlayerData[]) {
        return JSON.stringify({
            exportDate: new Date().toISOString(),
            totalPlayers: players.length,
            players: players.map(player => ({
                id: player.id,
                name: player.name,
                position: player.position,
                team: player.team,
                fantasyPoints: player.last_season_points,
                marketValue: player.market_value,
                status: player.is_assigned ? 'assigned' : 'available'
            }))
        }, null, 2);
    }
}
```

---

### **Feature 5: Budget Management System**

* **Goal**
  
  Implement comprehensive budget tracking with real-time updates, spending analytics, and constraint enforcement.

* **API relationships**
  
  - `/api/users/budget` - Budget operations
  - `/api/transactions` - Spending history
  - `/api/analytics/spending` - Budget analytics
  - `/api/websocket` - Real-time budget updates

* **Detailed requirements**
  
  - Real-time budget tracking and updates
  - Spending history and analytics
  - Budget constraint enforcement
  - Automatic budget adjustments on bid wins
  - Spending projections and recommendations
  - Admin budget management tools

* **Implementation guide**

#### Database Schema
```sql
-- Budget transactions
CREATE TABLE budget_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('credit', 'debit', 'adjustment')) NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id INTEGER, -- auction_id for bid wins
    reference_type TEXT, -- 'auction', 'manual_adjustment'
    balance_after INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER, -- admin user id for manual adjustments
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Budget alerts
CREATE TABLE budget_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    alert_type TEXT CHECK(alert_type IN ('low_budget', 'overspending', 'win_notification')) NOT NULL,
    threshold_percentage INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Budget Service
```typescript
class BudgetService {
    async getBudgetSummary(userId: number) {
        const user = await db.get('SELECT budget, spent_amount FROM users WHERE id = ?', userId);
        
        const transactions = await db.all(`
            SELECT * FROM budget_transactions 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 10
        `, userId);
        
        const activeBids = await db.all(`
            SELECT ab.max_amount, a.current_bid
            FROM auto_bids ab
            JOIN auctions a ON ab.auction_id = a.id
            WHERE ab.user_id = ? AND ab.is_active = TRUE AND a.status = 'active'
        `, userId);
        
        const potentialSpending = activeBids.reduce((sum, bid) => 
            sum + Math.max(bid.max_amount - bid.current_bid, 0), 0
        );
        
        return {
            totalBudget: user.budget,
            spentAmount: user.spent_amount,
            remainingBudget: user.budget - user.spent_amount,
            potentialSpending,
            availableForBidding: user.budget - user.spent_amount - potentialSpending,
            recentTransactions: transactions,
            budgetUtilization: (user.spent_amount / user.budget) * 100
        };
    }
    
    async deductBudget(userId: number, amount: number, reason: string, referenceId?: number) {
        return await db.transaction(async (tx) => {
            const user = await tx.get('SELECT budget, spent_amount FROM users WHERE id = ?', userId);
            
            if (user.budget - user.spent_amount < amount) {
                throw new Error('Insufficient budget');
            }
            
            const newSpentAmount = user.spent_amount + amount;
            const newBalance = user.budget - newSpentAmount;
            
            await tx.run(
                'UPDATE users SET spent_amount = ? WHERE id = ?',
                newSpentAmount, userId
            );
            
            await tx.run(`
                INSERT INTO budget_transactions 
                (user_id, type, amount, reason, reference_id, reference_type, balance_after)
                VALUES (?, 'debit', ?, ?, ?, 'auction', ?)
            `, userId, amount, reason, referenceId, newBalance);
            
            // Check for budget alerts
            await this.checkBudgetAlerts(userId, newBalance, user.budget);
            
            return newBalance;
        });
    }
    
    private async checkBudgetAlerts(userId: number, currentBalance: number, totalBudget: number) {
        const utilizationPercentage = ((totalBudget - currentBalance) / totalBudget) * 100;
        
        const alerts = await db.all(`
            SELECT * FROM budget_alerts 
            WHERE user_id = ? AND is_active = TRUE AND threshold_percentage <= ?
        `, userId, utilizationPercentage);
        
        for (const alert of alerts) {
            await this.triggerBudgetAlert(alert, utilizationPercentage);
        }
    }
}
```

#### Real-time Budget Updates
```typescript
// WebSocket budget update handler
function broadcastBudgetUpdate(userId: number, budgetData: BudgetSummary) {
    const message: WebSocketMessage = {
        type: 'budget_update',
        data: budgetData,
        userId
    };
    
    // Send to specific user
    webSocketServer.sendToUser(userId, message);
    
    // Send to admin users for monitoring
    webSocketServer.sendToRole('admin', {
        type: 'user_budget_update',
        data: { userId, ...budgetData }
    });
}
```

---

### **Feature 6: Administrative Controls**

* **Goal**
  
  Provide comprehensive admin tools for system management, user oversight, and auction administration.

* **API relationships**
  
  - `/api/admin/*` - All admin endpoints
  - `/api/system/health` - System monitoring
  - `/api/backups` - Data backup operations
  - `/api/notifications/admin` - Admin notifications

* **Detailed requirements**
  
  - System health monitoring and alerts
  - User management and approval workflows
  - Auction management and emergency controls
  - Data backup and export capabilities
  - Activity logging and audit trails
  - Performance monitoring and analytics

* **Implementation guide**

#### Admin Dashboard API
```typescript
// GET /api/admin/dashboard
async function getAdminDashboard() {
    const [
        activeAuctions,
        pendingUsers,
        systemHealth,
        recentActivity
    ] = await Promise.all([
        db.all('SELECT COUNT(*) as count FROM auctions WHERE status = "active"'),
        db.all('SELECT COUNT(*) as count FROM users WHERE status = "pending"'),
        getSystemHealth(),
        getRecentActivity()
    ]);
    
    return {
        