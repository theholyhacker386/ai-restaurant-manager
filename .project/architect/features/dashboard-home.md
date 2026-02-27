# Dashboard Home Page

## Purpose
The main landing page Jennifer sees when she opens the app on her phone. Shows a quick snapshot of her business health and provides easy navigation to all features.

## Design Approach

### Layout (Mobile-First)
- **Header**: "The Porch Health Park" with a simple logo area
- **Quick Stats Row**: 3 cards showing key numbers
  - Total Menu Items entered
  - Items in "danger" zone (red — need price increases)
  - Average food cost % across all items
- **Menu Health Overview**: Visual summary — pie chart or bar showing green/yellow/red items
- **Quick Actions**: Big buttons for common tasks
  - "Add Menu Item"
  - "Add Ingredient"
  - "View All Items"
- **Bottom Tab Bar**: Dashboard | Menu | Ingredients | Expenses

### Color Scheme
- Clean, professional, warm (café-appropriate)
- Primary: Warm brown/earth tones
- Accent: Teal/green for positive numbers
- Warning: Amber/yellow
- Danger: Coral/red
- Background: Warm off-white

### Responsive Design
- Mobile: Single column, large touch targets
- Tablet: Two-column layout
- Desktop: Three-column layout with sidebar nav

## Key Implementation Details
- Server-side rendering for fast initial load
- Client-side state for interactive elements
- Bottom navigation bar fixed to screen bottom on mobile
- Pull-to-refresh capability

## Acceptance Criteria
- [ ] Shows summary stats for menu item health
- [ ] Color-coded visual indicator of overall menu health
- [ ] Quick action buttons for common tasks
- [ ] Bottom tab navigation works on mobile
- [ ] Loads quickly on mobile connection
- [ ] Professional, warm café-appropriate design
- [ ] Works on iPhone Safari and Android Chrome
