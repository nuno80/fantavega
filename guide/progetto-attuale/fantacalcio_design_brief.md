# Fantacalcio Auction System - Design Brief

## Overview
A sophisticated fantasy football auction platform designed for extended 24-hour auctions supporting up to 20 managers. The system emphasizes real-time interactions, intuitive budget management, and seamless auction experiences across all devices.

---

## Feature 1: Extended Auction System

### Screen 1: Auction Dashboard (Main Auction View)
#### State 1: Active Auction with Current Bid
* **Primary Layout**: Split-screen desktop design with auction item (65%) and sidebar controls (35%)
* **Player Card**: Large featured card displaying player photo, name, position, team, and key stats with subtle drop shadow and rounded corners
* **Current Bid Display**: Prominent price ticker with animated counter showing current bid amount in bold typography
* **Timer Component**: Circular progress indicator showing remaining time (24 hours countdown) with color transitions from green→yellow→red as time decreases
* **Bid History**: Collapsible timeline showing last 5 bids with manager names, amounts, and timestamps
* **Action Area**: Three distinct CTA buttons arranged horizontally:
  - Quick +1 credit bid (primary blue, one-click action)
  - Custom amount input field with stepper controls
  - Auto-bid toggle with maximum amount slider
* **Animation**: Smooth pulse effect on new bids, timer breathing animation, card elevation changes on hover
* **Mobile Adaptation**: Stacked layout with swipe gestures for player navigation, sticky bottom action bar

#### State 2: Bidding in Progress (User Just Placed Bid)
* **Confirmation Animation**: Success checkmark overlay with green accent color
* **Updated Display**: Bid amount updates with slide-up animation
* **Timer Reset**: Visual reset animation of countdown circle with brief highlight
* **User Feedback**: Toast notification confirming bid placement
* **Button States**: Temporary disabled state with loading spinner, then re-enabled with updated minimum bid amounts
* **Real-time Updates**: Other users' screens show incoming bid with subtle notification badge

#### State 3: Final Countdown (Last 30 Minutes)
* **Urgency Indicators**: Timer turns red, adds pulsing animation
* **Enhanced Notifications**: Browser notifications for any new bids
* **Bid Activity**: Expanded bid history showing all recent activity
* **Sound Alerts**: Optional audio cues for new bids (user-configurable)
* **Mobile Optimization**: Push notifications for bid updates

#### State 4: Auction Complete
* **Winner Announcement**: Full-screen celebration overlay with confetti animation
* **Final Details**: Winner name, final amount, auction duration displayed prominently
* **Transition**: Smooth fade to next auction item or completion summary
* **Budget Update**: Real-time budget adjustment with animation

### Screen 2: Auction Setup (Admin)
#### State 1: Pre-Auction Configuration
* **Manager Grid**: Visual cards showing all registered managers with avatar, name, and budget
* **Player Pool**: Searchable, filterable list with drag-and-drop organization
* **Settings Panel**: Clean form layout with:
  - Number of managers (slider input)
  - Starting credits (number input with validation)
  - Auction timer settings (dropdown + custom input)
  - Notification preferences (toggle switches)
* **Preview Mode**: Live preview of auction interface with sample data
* **Validation**: Real-time form validation with inline error messages

#### State 2: Auction In Progress (Admin View)
* **Control Dashboard**: Enhanced admin controls overlaying standard auction view
* **Manager Overview**: Sidebar showing all managers' current budgets and acquired players
* **System Controls**: Pause/resume auction, extend timer, manual bid entry for technical issues
* **Activity Monitor**: Real-time log of all system events and user actions
* **Quick Actions**: Emergency controls with confirmation dialogs

---

## Feature 2: User Management

### Screen 1: Authentication Flow
#### State 1: Login Interface
* **Minimal Design**: Centered card layout with clean typography
* **Clark Integration**: Single sign-on button with branded styling
* **Form Elements**: Email/password fields with floating labels
* **Progressive Enhancement**: Loading states, error handling, success animations
* **Responsive**: Mobile-first design with touch-optimized inputs

#### State 2: Registration Process
* **Multi-step Flow**: Progress indicator showing steps (Account → Profile → Preferences)
* **Form Validation**: Real-time validation with helpful error messages
* **Avatar Upload**: Drag-and-drop image upload with crop functionality
* **Role Assignment**: Admin approval workflow for manager roles

### Screen 2: User Dashboard
#### State 1: Manager Profile View
* **Personal Overview**: Avatar, name, statistics, and current season performance
* **Budget Tracker**: Visual progress bar showing remaining credits vs. spent
* **Team Roster**: Grid layout of acquired players with quick stats
* **Activity Feed**: Recent auction activity, notifications, and system updates
* **Settings Access**: Gear icon leading to preferences panel

#### State 2: Admin Dashboard
* **System Overview**: Key metrics cards showing active auctions, registered users, system health
* **User Management**: Table view with search, filter, and bulk actions
* **Quick Controls**: Direct access to common admin functions
* **Analytics**: Basic charts showing auction activity and user engagement

---

## Feature 3: Bidding Interface

### Screen 1: Bid Controls
#### State 1: Default Bidding State
* **Three-Option Layout**: Horizontally arranged bidding methods
* **Visual Hierarchy**: Primary action (quick bid) prominently styled, secondary options clearly distinguished
* **Input Validation**: Real-time validation for custom amounts with helpful constraints messaging
* **Budget Awareness**: Remaining budget displayed prominently with color-coded warnings
* **Accessibility**: High contrast ratios, keyboard navigation, screen reader support

#### State 2: Auto-Bid Configuration
* **Modal Overlay**: Clean popup with auto-bid settings
* **Slider Control**: Intuitive range slider for maximum bid amount
* **Preview Calculation**: Shows potential bidding sequence
* **Safety Checks**: Confirmation dialog for high auto-bid amounts
* **Status Indicator**: Clear visual indication when auto-bid is active

#### State 3: Insufficient Funds
* **Error Prevention**: Grayed-out bid options, clear messaging
* **Alternative Actions**: Suggest removing auto-bids or reviewing budget
* **Visual Feedback**: Red accent colors, warning icons
* **Recovery Path**: Direct links to budget management or auction settings

---

## Feature 4: Real-Time Updates

### Screen 1: Notification System
#### State 1: In-App Notifications
* **Toast Messages**: Non-intrusive notifications sliding from top-right
* **Notification Center**: Collapsible sidebar with full activity history
* **Category Filtering**: Separate channels for bids, system updates, personal alerts
* **Animation**: Smooth slide-in/out transitions, subtle attention-getting pulses

#### State 2: Critical Updates
* **Full-Screen Overlays**: For auction wins, major system announcements
* **Progressive Disclosure**: Summary first, expandable details
* **Action Items**: Clear next steps with prominent CTAs
* **Dismissal Controls**: Easy close options, "Don't show again" for recurring notifications

---

## Feature 5: Free Agent Management

### Screen 1: Available Players List
#### State 1: Default Grid View
* **Card Layout**: Responsive grid showing player cards with photos, names, positions, teams
* **Filter Bar**: Sticky top navigation with role, team, and search filters
* **Sort Options**: Dropdown for various sorting methods (alphabetical, position, team, etc.)
* **Pagination**: Load more on scroll with performance optimization
* **Quick Actions**: Hover states revealing "Quick Bid" or "Add to Watchlist" options

#### State 2: Detailed Player View
* **Modal Overlay**: Expanded player information without losing list context
* **Statistics Display**: Clean charts and tables showing performance data
* **Auction History**: Previous auction results for similar players
* **Direct Actions**: Bid placement directly from detailed view
* **Navigation**: Previous/next player arrows for quick browsing

### Screen 2: Export Interface
#### State 1: Export Configuration
* **Format Selection**: Toggle buttons for CSV vs JSON
* **Data Filtering**: Checkboxes for including specific data fields
* **Preview Panel**: Sample of export format with actual data
* **Download Trigger**: Prominent download button with progress indication

---

## Feature 6: Budget Management

### Screen 1: Budget Dashboard
#### State 1: Overview Display
* **Visual Budget Meter**: Circular progress chart showing spent vs. remaining credits
* **Spending Breakdown**: Donut chart categorizing spending by position or acquisition date
* **Transaction History**: Chronological list of all budget changes
* **Projection Tools**: Estimated budget impact of current auto-bids

#### State 2: Budget Alerts
* **Warning Thresholds**: Configurable alerts at 75%, 90%, 95% budget usage
* **Visual Indicators**: Color-coded budget displays throughout the interface
* **Recommendation Engine**: Suggested bidding strategies based on remaining budget

---

## Responsive Design Considerations

### Mobile Optimizations
* **Touch-First Interactions**: Large tap targets, swipe gestures for navigation
* **Simplified Layouts**: Stacked components, collapsible sections
* **Progressive Web App**: Offline functionality, home screen installation
* **Push Notifications**: Native mobile notifications for critical updates

### Tablet Adaptations
* **Hybrid Layouts**: Blend of desktop and mobile approaches
* **Touch and Cursor Support**: Adaptive interface based on input method
* **Split-Screen Support**: Multi-app usage scenarios

---

## Animation Guidelines

### Micro-Interactions
* **Hover States**: Subtle elevation changes, color transitions
* **Button Interactions**: Press animations, loading states
* **Form Feedback**: Validation animations, success confirmations

### Page Transitions
* **Route Changes**: Smooth fade or slide transitions
* **Modal Appearances**: Scale and fade animations
* **Loading States**: Skeleton screens, progressive loading

### Real-Time Updates
* **Bid Animations**: Smooth counter updates, highlight flashes
* **Timer Transitions**: Fluid countdown animations
* **Status Changes**: Color morphing, icon animations

---

## Accessibility Standards

### Visual Accessibility
* **Color Contrast**: WCAG AA compliance minimum
* **Text Scaling**: Support for 200% zoom without horizontal scrolling
* **Focus Indicators**: High-contrast focus rings on all interactive elements

### Motor Accessibility
* **Keyboard Navigation**: Full functionality without mouse
* **Touch Targets**: Minimum 44px tap targets
* **Gesture Alternatives**: Alternative navigation methods

### Cognitive Accessibility
* **Clear Language**: Simple, jargon-free interface copy
* **Consistent Patterns**: Reusable interaction patterns throughout
* **Error Prevention**: Clear form validation and confirmation dialogs

---

## Performance Considerations

### Loading States
* **Skeleton Screens**: Content placeholder animations
* **Progressive Loading**: Priority content first, secondary features after
* **Cached Content**: Aggressive caching for static elements

### Real-Time Performance
* **WebSocket Optimization**: Efficient message handling
* **Update Batching**: Grouped updates to prevent interface flickering
* **Offline Resilience**: Graceful degradation when connectivity is poor