# Family Frame Design Guidelines

## Color Palette: "The Hearth & Heritage"

The goal is to avoid "tech blue" and stark whites. Instead, we use "Paper & Wood" tones that mimic physical photo albums and home decor.

### Primary Colors

| Element | Color Name | Hex Code | Purpose |
|---------|-----------|----------|---------|
| Primary Background | Warm Parchment | #FDF8F2 | Reduces eye strain; feels like high-quality paper |
| Primary Accent | Heritage Terracotta | #C05746 | Warm, soulful red for buttons and primary actions |
| Secondary Accent | Sage Leaf | #82937A | Calming green for "online" status or active connections |
| Text/Borders | Deep Espresso | #3E2F28 | High contrast for readability without the harshness of pure black |
| Highlight | Soft Honey | #F4D06F | Used sparingly to draw attention to new notifications or "memories" |

---

## Tone & Voice: "The Digital Hug"

The "personality" of the app should behave like a thoughtful family member, not a computer interface.

### Familiar & Gentle
- **Instructional Style**: Use complete, encouraging sentences. Instead of "Syncing...", use "Gathering your family's photos..."
- **Grandma-Friendly**: Avoid icons without labels. Every icon should be accompanied by a clear, large-print word

### Low-Urgency / Slow Tech
- **The Vibe**: Unlike social media, Family Frame doesn't "ping" or "alert" aggressively. It "announces" or "displays."
- **Movement**: Animations should be slow and organic, like a page turning or a photo being placed on a table

### Tactile Language
Use words that describe physical objects when appropriate.

---

## UI Elements & Accessibility

To ensure the app feels like a "mounted home accessory," keep these hardware-inspired rules in mind:

### Matte Textures
- Avoid gradients and glass-morphism
- Use flat, matte finishes that look like wood, linen, or paper

### High Contrast, High Scale
- Buttons should be large enough to tap easily, even with reduced dexterity
- Text should be readable from a distance (for mounted display use)
- Minimum touch target: 44px × 44px for all interactive elements

### Ambient Mode
- When not in use, the app transitions to a "Full-Screen Frame" mode
- Display photos or weather in a calm, ambient state

---

## Typography System

**Font Family**: 
- Primary: Inter (Google Fonts) - Clean, highly legible at distance
- Accent: Outfit (Google Fonts) - Warm, friendly headers

**Scale** (optimized for 16:9 screens):
- App Headers: text-4xl font-semibold (36px)
- Section Titles: text-2xl font-medium (24px)
- Primary Content: text-lg (18px)
- Secondary/Labels: text-base (16px)
- Metadata: text-sm (14px)

**Hierarchy Rules**:
- Weather temperatures: text-6xl font-bold
- Calendar event titles: text-xl font-medium
- Location names: text-sm uppercase tracking-wide

---

## Layout System

**Spacing Primitives**: Tailwind units of 4, 6, 8, 12, 16 (consistent rhythm)
- Component padding: p-6 or p-8
- Section gaps: gap-6 or gap-8
- Icon-text spacing: gap-4
- Tight groupings: gap-2

**Grid Structure**:
```
[Left Nav: 64px collapsed / 240px expanded] [Main Area: Remaining width]
```

**Main Application Area**:
- Full remaining width, full viewport height
- Padding: p-8 to p-12 depending on content density
- Multi-panel layouts use CSS Grid with gap-6 or gap-8

---

## Component Guidelines

### Buttons
- Use Heritage Terracotta for primary actions
- Use Sage Leaf for secondary/success states
- Large touch targets for family-friendly interaction

### Cards
- Warm Parchment-tinted backgrounds
- Subtle borders using Deep Espresso at low opacity
- Rounded corners (0.5rem radius)
- **Never apply partial borders to rounded elements**

### Status Indicators
- Sage Leaf for "online" or "active" states
- Soft Honey for notifications or highlights
- Terracotta for important actions

### Navigation Items (Left Sidebar)
- Icon size: 24px (w-6 h-6)
- Hover state: Subtle background with rounded-lg
- Active state: Stronger background + accent indicator
- Transition: transition-all duration-200

---

## Interactions & States

**Transitions**: Minimal, slow, organic animations
- Page transitions: Gentle fades (duration-500)
- Component appearance: fade-in (opacity 0→1, duration-300)
- Image rotations: crossfade (duration-1000)
- Hover states: Subtle background change (duration-200)

**Loading States**:
- Skeleton screens for weather/calendar data
- Progress indicators for photo sync

**Empty States**:
- Centered content with icon (48px), heading, description, CTA
- Weather: "Enable location permissions"
- Photos: "Connect Google Photos to begin"
- Calendar: "Create your first event"

---

## Dark Mode: "Evening Warmth"

Dark mode uses evening warmth tones:
- Deep espresso backgrounds with warm undertones
- Muted versions of the accent colors
- Maintains the "cozy fireplace" feeling at night
- Avoids pure black - uses warm dark browns instead

---

## Accessibility

- ARIA labels for icon-only navigation items
- Keyboard navigation support for all controls
- Focus indicators: 2px accent ring with rounded corners
- High contrast ratios maintained for distance readability
