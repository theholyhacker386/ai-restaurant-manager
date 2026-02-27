# AI-Powered Onboarding Questionnaire

**Feature ID**: ONBOARD-AI
**Owner**: Architect → Builder D
**Created**: 2026-02-23
**Status**: Planning
**Priority**: 🔴 HIGH (5 customers ready)

## Purpose

Create a standalone web-based questionnaire that uses AI to interactively collect all data needed to set up Porch Manager for new restaurant/coffee shop customers.

**Business value**: Instead of Jennifer manually entering data for each customer (20+ hours per customer), customers self-serve onboard in 2-4 hours.

## Problem Statement

Jennifer has 5 customers ready to sign up, but:
- Each customer needs: 50-100 menu items, 100-200 ingredients, supplier info, overhead expenses
- Manually entering this takes 20+ hours per customer
- Customers have the data in various formats (PDFs, spreadsheets, receipts)
- Need a way for customers to INPUT their own data

## Solution

**AI-powered conversational questionnaire** that:
1. Asks questions one at a time (like a chatbot)
2. User types answers OR uploads documents (menu PDFs, invoices, spreadsheets)
3. AI parses uploaded documents and extracts data automatically
4. Shows progress ("60% complete")
5. Review screen at end before submitting
6. Outputs JSON file that Jennifer imports into Porch Manager

## User Flow

### Step 1: Welcome & Business Type

```
AI: "Hi! I'm here to help you set up Porch Manager. This will take about 30-45 minutes.
     Let's start with the basics - what type of business do you run?"

Options:
☐ Coffee shop
☐ Restaurant (quick service)
☐ Restaurant (full service)
☐ Food truck
☐ Bakery
☐ Other: _______

AI: "Great! And what's your business name?"

User: "Sunshine Cafe"

AI: "Perfect! And where are you located?"

User: "Miami, FL"
```

### Step 2: POS System

```
AI: "What POS (point-of-sale) system do you use? This is how you track sales."

Options:
☐ Square
☐ Toast
☐ Clover
☐ Shopify
☐ Other: _______
☐ We don't have one yet

[If Square selected]
AI: "Awesome! I can automatically sync your sales data from Square.
     I'll need your Square credentials later. For now, let's continue."
```

### Step 3: Menu Items

```
AI: "Now let's add your menu items. You can either:
     1. Upload your menu (PDF, image, or spreadsheet)
     2. Type them in one by one
     3. Tell me verbally and I'll create them

     Which would you prefer?"

[If Option 1 - Upload]
User: [uploads menu.pdf]

AI: "Great! I'm reading your menu now..."
     [AI uses GPT-4 Vision to parse PDF]

     "I found 47 menu items! Here are the first few:

     - Cappuccino - $4.50
     - Latte - $5.00
     - Mocha - $5.50
     - Acai Bowl - $12.00

     Does this look right?"

User: "Yes!"

AI: "Perfect! I'll add all 47 items. You can edit them later if needed."

[If Option 2 - Type]
AI: "Let's add them one by one. What's your first menu item?"

User: "Cappuccino"

AI: "How much do you charge for a Cappuccino?"

User: "$4.50"

AI: "Got it! Cappuccino - $4.50. What's your next item? (or type 'done' if finished)"

[If Option 3 - Verbal]
AI: "Go ahead and tell me your menu items. For example:
     'We sell cappuccino for $4.50, latte for $5, mocha for $5.50'"

User: "We have cappuccino $4.50, latte $5, mocha $5.50, acai bowl $12, ..."

AI: "Got it! I heard:
     - Cappuccino - $4.50
     - Latte - $5.00
     - Mocha - $5.50
     - Acai Bowl - $12.00

     Is that correct?"
```

### Step 4: Ingredients & Suppliers

```
AI: "Now let's add your ingredients. What ingredients do you buy regularly?"

[Option A: Upload invoices]
AI: "You can upload recent invoices from your suppliers. I'll extract:
     - What you bought
     - Package sizes
     - Prices
     - Supplier names"

User: [uploads Walmart invoice PDF, Quantum invoice PDF]

AI: "Great! I found:

     From Walmart:
     - Milk (1 gallon) - $3.99
     - Strawberries (16oz) - $4.99
     - Blueberries (6oz) - $3.49

     From Quantum:
     - Frozen Mango (30 lb box) - $81.81
     - Acai Puree (10 lb box) - $65.00

     I'll add these to your ingredient list."

[Option B: Manual entry]
AI: "What's your first ingredient?"

User: "Milk"

AI: "Where do you buy milk from?"

User: "Walmart"

AI: "What size do you buy?"

User: "1 gallon"

AI: "How much does it cost?"

User: "$3.99"

AI: "Got it! Milk from Walmart, 1 gallon, $3.99. Next ingredient?"
```

### Step 5: Overhead Expenses

```
AI: "Let's add your monthly overhead expenses. These are fixed costs like rent, utilities, insurance.

     What's your monthly rent?"

User: "$2,500"

AI: "What's your average electric bill?"

User: "$350"

AI: "And insurance (liability, workers comp)?"

User: "$400"

AI: "Do you have any other recurring expenses? (Software subscriptions, equipment leases, etc.)"

User: "Square fees about $200/month"

AI: "Perfect! I've got:
     - Rent: $2,500
     - Electric: $350
     - Insurance: $400
     - Square fees: $200

     Total overhead: $3,450/month"
```

### Step 6: Historical Sales Data (Optional)

```
AI: "Do you have historical sales data you'd like to import? This helps with projections.

     You can upload:
     - Square sales report (CSV)
     - Excel/Google Sheets with daily sales
     - Or skip this for now"

[If uploaded]
AI: "Great! I'm importing your last 90 days of sales data..."
     [Parses CSV, extracts revenue by day]

     "Done! I imported 90 days of sales. Your average daily revenue is $843."
```

### Step 7: Review & Confirm

```
AI: "You're all set! Here's what I collected:

     ✅ Business: Sunshine Cafe (Miami, FL)
     ✅ POS: Square
     ✅ Menu: 47 items
     ✅ Ingredients: 34 items from 5 suppliers
     ✅ Overhead: $3,450/month
     ✅ Historical sales: 90 days

     Progress: 100% ✅

     Does everything look correct?"

User: "Yes!"

AI: "Perfect! I'm generating your setup file now...

     ✅ Done! Your Porch Manager account is ready.

     Next steps:
     1. Jennifer will import your data into the system
     2. You'll receive login credentials
     3. You can start using Porch Manager immediately

     Questions? Text Jennifer at [phone]"
```

## Technical Design

### Architecture

```
┌─────────────────────────────────────┐
│  Standalone Next.js Website         │
│  (onboard.porchmanager.com)         │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  Frontend (React + TypeScript)      │
│  - Chat UI (message bubbles)        │
│  - File upload component            │
│  - Progress tracker                 │
│  - Review screen                    │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  API Routes (Next.js)               │
│  /api/chat - Send message to AI     │
│  /api/upload - Upload documents     │
│  /api/parse - Parse with Vision API │
│  /api/export - Generate JSON        │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  OpenAI API                         │
│  - GPT-4 (conversational logic)     │
│  - GPT-4 Vision (parse PDFs/images) │
│  - Structured outputs (JSON mode)   │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│  Output: JSON File                  │
│  {                                  │
│    "business": {...},               │
│    "menu_items": [...],             │
│    "ingredients": [...],            │
│    "suppliers": [...],              │
│    "expenses": [...]                │
│  }                                  │
└─────────────────────────────────────┘
```

### Data Flow

1. **User sends message** → Frontend captures text/file
2. **Frontend calls `/api/chat`** → Sends to OpenAI
3. **OpenAI responds** → AI-generated next question
4. **User uploads document** → Frontend calls `/api/upload`
5. **Backend parses document** → GPT-4 Vision extracts data
6. **Data stored in session** → React state (client-side)
7. **User reaches end** → Frontend calls `/api/export`
8. **Generate JSON file** → User downloads
9. **Jennifer imports** → Into Porch Manager database

### Tech Stack

**Frontend**:
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- React state management (useState, useReducer)

**Backend**:
- Next.js API routes
- OpenAI SDK (`openai` npm package)
- File upload handling (multipart/form-data)
- PDF parsing (pdf-parse or direct to Vision API)

**AI**:
- OpenAI GPT-4 (text generation)
- OpenAI GPT-4 Vision (document parsing)
- Structured outputs (JSON mode for data extraction)

**Storage**:
- Client-side only (React state)
- No database needed (export JSON at end)
- Session data in localStorage (persist across page refresh)

**Deployment**:
- Vercel (separate project from main Porch app)
- Custom subdomain: onboard.porchmanager.com

### Key API Calls

**Chat Message**:
```typescript
// /api/chat/route.ts
export async function POST(req: Request) {
  const { message, conversationHistory } = await req.json()

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: ONBOARDING_PROMPT },
      ...conversationHistory,
      { role: 'user', content: message }
    ]
  })

  return Response.json({ reply: response.choices[0].message.content })
}
```

**Document Parsing**:
```typescript
// /api/parse/route.ts
export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file')
  const base64 = await fileToBase64(file)

  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Extract menu items with names and prices from this menu' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
      ]
    }],
    response_format: { type: 'json_object' }
  })

  return Response.json({ data: JSON.parse(response.choices[0].message.content) })
}
```

**Export JSON**:
```typescript
// /api/export/route.ts
export async function POST(req: Request) {
  const sessionData = await req.json()

  const output = {
    business: sessionData.business,
    pos_system: sessionData.pos,
    menu_items: sessionData.menuItems.map(item => ({
      name: item.name,
      price: item.price,
      description: item.description
    })),
    ingredients: sessionData.ingredients.map(ing => ({
      name: ing.name,
      supplier: ing.supplier,
      package_size: ing.packageSize,
      package_unit: ing.packageUnit,
      cost: ing.cost
    })),
    overhead_expenses: sessionData.expenses
  }

  return Response.json(output)
}
```

### System Prompt (AI Instructions)

```
You are an onboarding assistant for Porch Manager, a restaurant financial management platform.

Your job is to collect the following information from new customers:
1. Business info (name, type, location, POS system)
2. Menu items (names, prices)
3. Ingredients (name, supplier, package size, cost)
4. Overhead expenses (rent, utilities, insurance, etc.)
5. Historical sales data (optional)

Guidelines:
- Ask ONE question at a time
- Be conversational and friendly
- Accept answers in any format (typed, uploaded docs, verbal lists)
- When user uploads a document, parse it and confirm what you extracted
- Show progress throughout ("You're 40% complete")
- If user gets stuck, offer to skip and come back later
- At the end, summarize everything and ask for confirmation

Document parsing:
- PDFs: Use Vision API to extract text and data
- CSVs: Parse directly
- Images: Use Vision API
- Spreadsheets: Ask user to export as CSV

Output format:
Store all data in structured JSON that can be imported into Porch Manager database.
```

## UI Design

**Chat Interface**:
```
┌─────────────────────────────────────────┐
│  Porch Manager - Onboarding       [60%]│
├─────────────────────────────────────────┤
│                                          │
│  🤖 Hi! I'm here to help set up your    │
│     Porch Manager account. Let's start  │
│     with the basics - what type of      │
│     business do you run?                │
│                                          │
│  ☐ Coffee shop                          │
│  ☐ Restaurant (quick service)           │
│  ☐ Restaurant (full service)            │
│  ☐ Food truck                           │
│  ☐ Other: _______                       │
│                                          │
│                     [Coffee shop] 👤    │
│                                          │
│  🤖 Great! And what's your business     │
│     name?                               │
│                                          │
│                 [Sunshine Cafe] 👤      │
│                                          │
│  🤖 Perfect! Now let's add your menu... │
│                                          │
├─────────────────────────────────────────┤
│  [Type message or upload file...]  [📎] │
└─────────────────────────────────────────┘
```

**Progress Tracker**:
```
Business Info ✅ → Menu Items ✅ → Ingredients ⏳ → Expenses ☐ → Review ☐
```

**Review Screen**:
```
┌─────────────────────────────────────────┐
│  Review Your Setup                   ✅ │
├─────────────────────────────────────────┤
│  BUSINESS INFO                          │
│  Name: Sunshine Cafe                    │
│  Type: Coffee shop                      │
│  Location: Miami, FL                    │
│  POS: Square                            │
│                                    [Edit]│
│  ─────────────────────────────────────  │
│  MENU ITEMS (47)                        │
│  • Cappuccino - $4.50                   │
│  • Latte - $5.00                        │
│  • Mocha - $5.50                        │
│  • ... (44 more)                        │
│                           [View all][Edit]│
│  ─────────────────────────────────────  │
│  INGREDIENTS (34)                       │
│  • Milk (Walmart, 1 gal) - $3.99        │
│  • Frozen Mango (Quantum, 30lb) - $81.81│
│  • ... (32 more)                        │
│                           [View all][Edit]│
│  ─────────────────────────────────────  │
│  OVERHEAD ($3,450/month)                │
│  • Rent - $2,500                        │
│  • Electric - $350                      │
│  • Insurance - $400                     │
│  • Square fees - $200                   │
│                                    [Edit]│
│                                          │
│  [Download JSON] [Start Over] [Submit] │
└─────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] Standalone Next.js website deployed (onboard.porchmanager.com)
- [ ] Chat interface displays messages and collects responses
- [ ] User can upload documents (PDFs, images, CSVs)
- [ ] AI parses uploaded menus and extracts items
- [ ] AI parses uploaded invoices and extracts ingredients
- [ ] Progress tracker shows % complete
- [ ] Review screen displays all collected data
- [ ] User can edit any section before submitting
- [ ] Export JSON button downloads structured data file
- [ ] JSON file can be imported into Porch Manager
- [ ] Mobile responsive (works on phone)
- [ ] Session persists (localStorage) if user refreshes page

## Questions to Collect

**Business Info**:
1. Business name
2. Business type (coffee shop, restaurant, etc.)
3. Location (city, state)
4. POS system (Square, Toast, Clover, etc.)
5. Owner name
6. Contact email/phone

**Menu Items** (for each):
7. Item name
8. Price
9. Description (optional)
10. Category (drinks, food, etc.)

**Ingredients** (for each):
11. Ingredient name
12. Supplier
13. Package size (e.g., "30 lb")
14. Package unit (lb, oz, gallon, etc.)
15. Cost per package
16. How often purchased (weekly, monthly)

**Overhead Expenses**:
17. Rent ($/month)
18. Utilities - Electric ($/month)
19. Utilities - Water ($/month)
20. Utilities - Gas ($/month)
21. Internet/Phone ($/month)
22. Insurance - Liability ($/month)
23. Insurance - Workers Comp ($/month)
24. POS fees ($/month)
25. Other subscriptions (software, etc.)

**Labor** (optional):
26. Number of employees
27. Average hourly wage
28. Weekly hours per employee

**Historical Data** (optional):
29. Upload sales report (CSV)
30. Past 90 days revenue
31. Past expenses

## Output JSON Format

```json
{
  "business": {
    "name": "Sunshine Cafe",
    "type": "coffee_shop",
    "location": "Miami, FL",
    "pos_system": "square",
    "owner_name": "John Doe",
    "contact_email": "john@sunshinecafe.com"
  },
  "menu_items": [
    {
      "name": "Cappuccino",
      "price": 4.50,
      "category": "drinks",
      "description": "Espresso with steamed milk"
    }
  ],
  "ingredients": [
    {
      "name": "Milk",
      "supplier": "Walmart",
      "package_size": 1,
      "package_unit": "gallon",
      "cost_per_package": 3.99,
      "purchase_frequency": "weekly"
    }
  ],
  "suppliers": [
    {
      "name": "Walmart",
      "contact_method": "manual"
    },
    {
      "name": "Quantum",
      "contact_method": "email",
      "email": "orders@quantum.com"
    }
  ],
  "overhead_expenses": [
    {
      "category": "Rent",
      "amount": 2500,
      "frequency": "monthly"
    }
  ],
  "historical_sales": [
    {
      "date": "2026-01-01",
      "revenue": 850
    }
  ]
}
```

## Estimated Effort

**8-12 hours** for experienced builder:
- 2 hours: Set up Next.js project + chat UI
- 3 hours: OpenAI integration (chat + vision)
- 2 hours: File upload + parsing logic
- 2 hours: Progress tracker + review screen
- 2 hours: JSON export + testing
- 1 hour: Deploy to Vercel

## Next Steps After Build

1. Jennifer tests with dummy data
2. Send link to 5 customers waiting
3. Customers complete questionnaire (2-4 hours each)
4. Jennifer imports JSON files into Porch Manager
5. Customers get login credentials
6. Start using Porch Manager!

**Timeline**: If built this week, customers can start onboarding next week!
