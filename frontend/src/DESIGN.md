# OrangeBrew Design System

This document outlines the visual language and core UI components for the redesigned OrangeBrew web application, inspired by the responsive "Glassmorphism" layout created for `RecipeConstructor_V2.jsx`.

## 1. Visual Language & Tokens

### Color Palette

- **Background Base**: `#030303` (Deep, almost black, used for the main body background to contrast with glowing elements).
- **Brand Primary**: `#ff9800` (Vibrant Orange, used for accent text, primary actions, icon highlights, and glowing background orbs).
- **Danger/Alert**: `#f44336` (Bright Red, used for destructive actions like deleting ingredients).
- **Text Primary**: `#ffffff` (Pure white for main body text, headers, numbers).
- **Text Muted**: `rgba(255, 255, 255, 0.5)` (Semi-transparent white for labels, units, secondary info text).

### Glassmorphism (Surfaces)

The core aesthetic relies on dark, translucent "glass" panels hovering over a glowing, animated background.

- **Panel Background**: `rgba(20, 20, 20, 0.75)`
- **Panel Backdrop Filter**: `blur(20px)`
- **Panel Border**: `1px solid rgba(255, 152, 0, 0.2)` (Subtle orange-tinted border line)
- **Panel Shadow**: `0 10px 40px -10px rgba(0, 0, 0, 0.8)` (Deep drop shadow to separate panels from glowing background)
- **Panel Border Radius**: `24px` (Mobile) / `32px` (Desktop)

### Inputs & Controls

Inputs use a completely flat, slightly transparent dark background to contrast with the glass panels.

- **Input Background**: `rgba(30, 30, 30, 0.9)`
- **Input Border**: `1px solid rgba(255, 255, 255, 0.1)`
- **Input Border Radius**: `16px`
- **Input Inner Shadow**: `inset 0 4px 12px rgba(0,0,0,0.15)`
- **Input Padding**: `0.9rem 1rem` (Mobile) / `1.2rem` (Desktop)

### Typography

- Main headings use heavy weights (`950`) and negative letter spacing (`-1px`) for a solid, modern feel.
- Section headers use `900` weight, `-0.8px` letter spacing, and a subtle white text-shadow (`0 0 20px rgba(255,255,255,0.1)`).
- Labels are small (`0.75rem`), uppercase, heavily weighted (`800`), and spaced out (`letter-spacing: 1px`).

---

## 2. Core Structure & Layout

The typical page structure should follow this hierarchy:

1. **Root Container**: Full viewport height, `overflow-x: hidden`, background color is `#030303`.
2. **Background Orbs Container**: Fixed `inset: 0`, contains animated, heavily blurred `radial-gradient` circles using the Brand Primary color (`#ff9800` with varying opacity). Needs a top/bottom blackout gradient mask (`linear-gradient(to bottom, #030303 0%, transparent 15%, transparent 70%, rgba(0,0,0,0.95) 100%)`) to hide sharp overspill boundaries.
3. **Main Content Wrapper**: Max-width `1000px`, centered, relative positioning with `z-index: 1` to sit on top of the blurred orbs.
4. **Header Section**: Flexbox layout with a back button, large page title (using the Brand Primary color for accented words with a matching text-shadow glow), and an optional graphic/logo on the right.
5. **Content Stack**: A vertical flex column with gap `1.5rem` (Mobile) / `2.5rem` (Desktop) containing the `GlassCards`.

---

## 3. UI Components

### BackgroundDecor

An animated background component acting as the foundation of the aesthetic. It uses Framer Motion to slowly translate and scale large blurred circles.

### GlassCard

The primary container for organizing groups of content.
*Features*: Blurred backdrop, dark semi-transparent fill, subtle orange border, and heavy drop shadow.

### Inputs (Text, Number, Select)

Used for all user data entry.
*States & Behaviors*:
- The caret (cursor) styling should default to white.
- `type="number"` inputs must strip native browser UI spinners (arrows).
- Dropdowns (`<select>`) must style the scrollbars (thin width with orange thumb on hover).

### Action Buttons

**Primary Button** (eg., "НАЧАТЬ ВАРКУ")
- Background: `#ff9800`
- Text Color: `#000000` (Max contrast)
- Font Weight: `950`
- Border Radius: `16px`
- Glow: `box-shadow: 0 0 30px rgba(255, 152, 0, 0.55)`
- Animation: Gentle scale reduction on tap/click (`whileTap={{ scale: 0.95 }}`).

**Secondary Button** (eg., "СОХРАНИТЬ")
- Background: `rgba(255,255,255,0.05)`
- Border: `1px solid rgba(255,255,255,0.1)`
- Text Color: `#ffffff`
- Border Radius: `16px`

**Contextual Action Button (Add)** (eg., "+ ШАГ", "+ ДОБАВИТЬ")
- Background: `rgba(255,152,0,0.08)`
- Border: `1px solid rgba(255, 152, 0, 0.27)`
- Text Color: `#ff9800`
- Feature: Smaller padding and font size relative to main action buttons.

**Destructive Button** (eg., "Отменить", or Delete icon)
- Background: `rgba(244, 67, 54, 0.1)`
- Border: `1px solid rgba(244, 67, 54, 0.2)`
- Text Color: `#f44336`

### StatItem (Data Display)

Used for displaying read-only metrics and calculated results visually.
- Stacks an Icon (colored), a small uppercase Label, and a large bold Value with a small Unit.
- Wrapped in a subtle dark card (`rgba(255,255,255,0.02)`) with a very faint border to group the information without distracting from the main layout.
