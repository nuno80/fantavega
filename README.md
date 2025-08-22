# Fantavega - Fantasy Sports Auction Platform

A comprehensive fantasy sports auction application built with Next.js 15, featuring real-time bidding, league management, player roster compliance, and advanced auction mechanics.

## 🚀 Quickstart Guide

Get your fantasy sports auction platform up and running quickly:

1. **Clone & Navigate:**

   ```bash
   git clone https://github.com/nuno80/fantavega.git
   cd fantavega
   ```

2. **Set Up Node.js (v20.x Recommended):**

   ```bash
   # Using nvm:
   nvm install 20
   nvm use 20
   ```

3. **Install Dependencies:**

   ```bash
   pnpm install
   ```

4. **Configure Environment Variables:**
   Create `.env.local` and add your Clerk API keys:

   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY
   CLERK_SECRET_KEY=sk_test_YOUR_KEY
   ```

5. **Database Setup:**

   ```bash
   pnpm run db:migrate
   ```

6. **Run Development Server:**

   ```bash
   pnpm run dev
   ```

   Access at `http://localhost:3000`.

---

## 🎯 Project Purpose

Fantavega is a feature-rich fantasy sports auction platform that enables:

- **Real-time Auction System**: Live bidding with Socket.io integration
- **League Management**: Create and manage fantasy sports leagues
- **Player Roster Management**: Advanced player search and roster compliance
- **Automated Bidding**: Auto-bid functionality for hands-off participation
- **Role-based Access Control**: Admin, manager, and player roles
- **Penalty System**: Automatic compliance checking and penalty enforcement
- **Budget Tracking**: Real-time budget management during auctions

## 🛠 Technology Stack

### Core Framework

- **Next.js 15** (App Router)
- **TypeScript**
- **React 19**

### Real-time Features

- **Socket.io** for live auction updates
- **WebSocket server** for real-time bidding

### Authentication & Security

- **Clerk** for user authentication and session management
- **Role-based middleware** with admin/manager/player access levels

### Database & Data Management

- **SQLite** via BetterSQLite3
- **Manual schema migrations** with backup system
- **Database services** for penalty system and compliance checking

### UI & Styling

- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **Lucide React** icons
- **Dark/Light mode** support

### Development Tools

- **pnpm** for package management
- **ESLint & Prettier** for code quality
- **Docker** for containerized development
- **Excel import/export** functionality

## ⭐ Key Features

### Auction System

- **Real-time bidding** with live updates
- **Auto-bid functionality** for automated bidding
- **Auction timer** with response tracking
- **Bid history** and transaction logging
- **Budget management** with real-time updates

### League Management

- **League creation and configuration**
- **Participant management** with role assignment
- **League status tracking** (active, paused, completed)
- **Team naming and roster management**

### Player Management

- **Advanced player search** with filters
- **Player import** via Excel files
- **Player statistics** and performance data
- **Roster compliance** checking

### Penalty System

- **Automated compliance checking**
- **Penalty enforcement** for rule violations
- **Session-based validation** (only active users penalized)
- **Visual penalty indicators** in the UI

### Admin Dashboard

- **User management** with role assignment
- **Database management** tools
- **System monitoring** and statistics
- **League oversight** capabilities

## 📁 Directory Structure

```
fantavega/
├── database/                 # Database files and migrations
│   ├── schema.sql           # Main database schema
│   ├── adhoc_changes.sql    # Temporary schema changes
│   ├── migrations/          # Migration files
│   └── backups/             # Automatic database backups
├── public/                  # Static assets
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── admin/           # Admin dashboard pages
│   │   ├── api/             # API routes
│   │   ├── auctions/        # Auction pages
│   │   └── dashboard/       # User dashboard
│   ├── components/          # React components
│   │   ├── admin/           # Admin-specific components
│   │   ├── auction/         # Auction components
│   │   ├── players/         # Player management components
│   │   └── ui/              # UI library components
│   ├── lib/                 # Core utilities
│   │   ├── db/              # Database connection and services
│   │   ├── actions/         # Server actions
│   │   └── validators/      # Data validation
│   ├── contexts/            # React contexts
│   ├── hooks/               # Custom React hooks
│   └── types/               # TypeScript definitions
├── socket-server.ts         # WebSocket server for real-time features
├── Docker/                  # Docker configuration
└── guide/                   # Documentation and guides
```

## 🚀 Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v20.x
- [pnpm](https://pnpm.io/installation)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (optional)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/nuno80/fantavega.git
   cd fantavega
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your Clerk keys
   ```

4. **Initialize database:**

   ```bash
   pnpm run db:migrate
   ```

### Running the Application

#### Local Development

```bash
pnpm run dev
```

This starts both the Next.js app and Socket.io server concurrently.

#### Docker Development

```bash
cd Docker
docker compose build --no-cache app
docker compose up
```

#### Individual Services

```bash
# Next.js only
pnpm run dev:next

# Socket server only
pnpm run socket:dev
```

## 🗄️ Database Management

Fantavega uses SQLite with a comprehensive database management system:

### Core Database Files

- **`database/schema.sql`**: Complete database schema definition
- **`database/adhoc_changes.sql`**: Temporary changes and migrations
- **`database/backups/`**: Automatic timestamped backups

### Available Scripts

```bash
pnpm run db:migrate      # Apply schema changes
pnpm run db:backup       # Create database backup
pnpm run db:apply-changes # Apply adhoc changes with backup
pnpm run db:reset        # Reset database (with backup)
pnpm run db:seed         # Seed with sample data
```

### Database Services

- **Penalty Service**: Manages compliance and penalty enforcement
- **League Actions**: League creation and management
- **Player Management**: Player data operations

## 🔐 Authentication (Clerk)

User authentication is handled by Clerk with role-based access control:

### User Roles

- **Admin**: Full system access, user management
- **Manager**: League management, participant oversight
- **Player**: Auction participation, roster management

### Protected Routes

- **Public**: `/`, `/about`, `/pricing`
- **Authenticated**: `/features`, `/user-dashboard`
- **Admin Only**: `/admin/*`, `/dashboard`, `/api/admin/*`

## 🎯 Real-time Features

### WebSocket Integration

- **Live auction updates** during bidding
- **Real-time budget tracking**
- **Bid notifications** and status updates
- **Auction timer** synchronization

### Socket Events

- `bid_placed`: New bid notification
- `auction_update`: Auction state changes
- `timer_update`: Timer synchronization
- `budget_update`: Budget changes

## 📊 Admin Features

### User Management

- **Role assignment** and management
- **User activity monitoring**
- **Account status control**

### League Oversight

- **League creation and configuration**
- **Participant management**
- **Compliance monitoring**

### Database Tools

- **Direct database access** and management
- **Backup and restore** functionality
- **Schema migration** tools

## 🔧 Code Quality & Development

### Code Standards

- **ESLint** for linting
- **Prettier** for code formatting
- **TypeScript** for type safety
- **File naming conventions** enforced

### Development Scripts

```bash
pnpm run lint           # Run ESLint
pnpm run format         # Format code with Prettier
pnpm run type-check     # TypeScript type checking
pnpm run build          # Production build
```

## 🚀 Deployment

### Docker Production

```bash
cd Docker
docker compose -f docker-compose.prod.yml up -d
```

### Environment Configuration

Ensure all environment variables are set for production:

```env
NODE_ENV=production
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_prod_key
CLERK_SECRET_KEY=your_prod_secret
```

## 📚 Documentation

Additional documentation is available in the `guide/` directory:

- `guide/progetto-attuale/logica-app.json` - Application logic documentation
- `guide/gestione-db.md` - Database management guide
- `guide/role-based-auth.md` - Authentication guide
- `guide/UI-design.md` - UI/UX guidelines

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is private and proprietary.

## 🆘 Support

For support and questions:

- Check the `guide/` directory for detailed documentation
- Review existing issues and documentation
- Contact the development team for technical support

---

**Fantavega** - Where Fantasy Sports Meet Real-time Action! ⚽🏀🏈
