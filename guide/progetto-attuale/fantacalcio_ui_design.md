\<goal\>  
You are an industry-veteran SaaS product designer. You've built high-touch UIs for FANG-style companies.

Your goal is to take the context below, the guidelines, and the user inspiration, and turn it into a functional UI design  
\</goal\>

\<inspirations\>  
The attached images serve as the user's inspiration. You don't need to take it literally in any way, but let it serve as an understanding of what the user likes aesthetically   
\</inspirations\>

\<guidelines\>  
\<aesthetics\>

- Bold simplicity with intuitive navigation creating frictionless experiences  
- Breathable whitespace complemented by strategic color accents for visual hierarchy  
- Strategic negative space calibrated for cognitive breathing room and content prioritization  
- Systematic color theory applied through subtle gradients and purposeful accent placement  
- Typography hierarchy utilizing weight variance and proportional scaling for information architecture  
- Visual density optimization balancing information availability with cognitive load management  
- Motion choreography implementing physics-based transitions for spatial continuity  
- Accessibility-driven contrast ratios paired with intuitive navigation patterns ensuring universal usability  
- Feedback responsiveness via state transitions communicating system status with minimal latency  
- Content-first layouts prioritizing user objectives over decorative elements for task efficiency

\</aesthetics\>

\<practicalities\>

- Create responsive layouts that work across desktop, tablet, and mobile devices
- Use lucide react icons for all iconography
- Use Tailwind CSS for styling with modern design patterns
- This is a web application that must be fully functional across PC, tablet, and phone form factors
- Ensure touch-friendly interfaces for mobile while maintaining desktop usability
- No scroll bars should be visible - use custom scrolling or hidden overflow

\</practicalities\>  

\<project-specific-guidelines\>  
- **Fantasy Football Context**: This is a high-stakes fantasy football auction system where managers bid on players with real money/credits
- **Real-time Urgency**: 24-hour countdown timers create urgency - use visual cues like color transitions and animations
- **Budget Management**: Always show remaining budget prominently - this is critical information users need constantly
- **Auction Status**: Clear visual hierarchy showing current bid, time remaining, and next bid requirements. The page should be an empty list of players divided in 3 portieri, 8 difensori,8 centrocampisti e 6 attaccanti. Quando clicco su uno slot vuoto depo poter sceglier il giocatore che desidero comprare e a dx, sulla stessa linea dello sloto , inserire il prezzo. Dopo aver cliccato il pulsanti verde 'compra' , acora una volta a destra sulla stessa linea devp opoter visualizzare un countdounn di 24 ore (in ore minuti)
- **Professional Aesthetic**: This handles real money transactions, so maintain a trustworthy, professional appearance
- **Multi-device Usage**: Managers will switch between devices during long auctions - ensure consistency
- **Notification Priority**: New bids and auction endings are critical events requiring prominent visual feedback
\</project-specific-guidelines\>  
\</guidelines\>

\<context\>  
\<app-overview\>  
A sophisticated fantasy football auction platform where up to 20 managers participate in extended 24-hour auctions, bidding on players with real credits while managing budgets and competing in real-time.
\</app-overview\>  

\<task\>  
Follow the guidelines above precisely to ensure correctness. Your output should be a responsive web application showcasing the three core screens specified below, with proper breakpoints for desktop (1200px+), tablet (768px-1199px), and mobile (320px-767px):

**1. Active Auction Screen** - The main auction interface showing current player, bidding controls, timer, and bid history
**2. Dashboard/Budget Management** - User's portfolio showing remaining budget, acquired players, and active bids  
**3. Player Search/Free Agents** - Searchable list of available players with filtering and quick bid options

Each screen should demonstrate:
- Responsive breakpoints with appropriate layout changes
- Real-time elements (timers, live updates, notifications)
- Touch-friendly mobile interfaces with gesture hints
- Professional color scheme suitable for financial transactions
- Clear information hierarchy prioritizing critical auction data
- Smooth transitions and micro-interactions that enhance usability
\</task\>  

\<output\>  
Create a complete React component with proper responsive design, demonstrating all three screens in a functional interface. Use modern CSS techniques with Tailwind classes and ensure the design works seamlessly across all device sizes.
\</output\>  
\</context\>