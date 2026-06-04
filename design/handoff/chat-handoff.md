# Chat with УК — Claude Design handoff

**Source:** https://api.anthropic.com/v1/design/h/1VCVLNOjEqiWn32Fww2xAA?open_file=screens%2F10-chat.html
**Target file:** [`screens/10-chat.html`](./chat-10-chat.html) → React port → [`src/frontend/src/pages/chat/ResidentChatView.tsx`](../../src/frontend/src/pages/chat/ResidentChatView.tsx)
**Reference JSX:** [`kamizo-chat.jsx`](./kamizo-chat.jsx) (316 lines, the canonical spec)
**Tokens:** [`tokens-chat.css`](./tokens-chat.css) (same as the global Kamizo tokens — `--brand`, `--amber-*`, `--stone-*`, `--text*`, `--success`, `--sh-*`)

Single source of truth for the **resident**-side Chat screen. The admin /
manager / dispatcher view (a list of resident channels split-pane) is
outside the handoff and stays on the existing `ChatView` component.

---

## 1. Layout (top → bottom)

```
ResidentChatView
├── Sticky header (bg rgba(250,250,249,0.95) + backdrop-blur 14, 1px hairline bottom)
│   ├── Back arrow IArrowL 20, 36×36 round bg transparent text --text-2
│   ├── УК avatar 40×40 round, gradient #FB923C → #EA580C, white "УК" 13/700,
│   │   shadow 0 2px 6px rgba(217,119,6,0.25), green online dot 12×12
│   │   #22C55E with 2px #FAFAF9 border at bottom-right
│   ├── Title block (flex 1)
│   │   ├── "Управляющая компания" 15/650 -0.01em
│   │   └── 5×5 #22C55E dot + "На связи · отвечаем до 15 мин" 11.5/600 --success
│   └── Phone button 36×36 round bg white, 1px --border, IPhone 16 --text-2
├── Pinned active-request chip
│   - margin 10/16/4, padding 10/12, bg --amber-50, 1px --amber-200, radius 12, flex gap 10
│   - 28×28 amber-100 tile w/ IPin 14 --amber-700
│   - body: eyebrow "АКТИВНАЯ ЗАЯВКА" 11.5/600 --amber-800 uppercase 0.02em
│   - title: "#<n> · <title> · <status>" 13/600 --text -0.01em
│   - IChevronR 16 --amber-700 at right
├── Messages list (flex 1, padding 12/16/8, flex col gap 8)
│   ├── Date separator: centered stone-150 pill 11/600 --text-3 0.02em, padding 4/10
│   ├── Incoming bubble row (avatar 28 left + bubble + meta)
│   │   - avatar 28 round, same gradient as header avatar, white "УК" 10/700
│   │   - bubble: bg #FFFFFF, 1px --border, radius 18/18/18/4 (top-left tail),
│   │     padding 10/13, 14/normal/-0.01em, shadow --sh-1, text-wrap pretty
│   │   - max-width 78%, align-items flex-start
│   ├── Outgoing bubble row (mirrored)
│   │   - bubble: linear-gradient 155deg #FB923C → #EA580C, white text,
│   │     no border, radius 18/18/4/18 (bottom-right tail),
│   │     shadow 0 4px 10px -2px rgba(217,119,6,0.3)
│   │   - max-width 78%, align-items flex-end
│   ├── Attached request mini-card (inside bubble)
│   │   - margin-top 8, padding 8/10, radius 10
│   │   - incoming: bg --amber-50; outgoing: bg rgba(255,255,255,0.18)
│   │   - 28×28 tile w/ IDoc 14, two-line label "#id · status" + title
│   ├── Attached photo (inside bubble)
│   │   - margin-top 8, height 110, radius 10, dark gradient bg with bright
│   │     #FB923C centerpiece (placeholder for the actual image)
│   │   - filename caption bottom-left
│   ├── Reaction footer (under the bubble, padding 0/4, gap 6, margin-top 3)
│   │   - each: 13/normal, padding 1/7, radius 999, bg #fff, 1px --border
│   │   - then time 10.5/500 --text-3, append " · прочитано" for own messages
│   └── Typing indicator (avatar + bubble with 3 stone-400 dots, kzPulse anim
│       1.2 s infinite, 0.2 s stagger)
├── Quick replies (horizontal scroll, padding 0/16/8, gap 7)
│   - each: 7/12 padding, radius 999, bg #fff, 1px --border, 12.5/600 --text-2
├── Composer (sticky bottom, bg rgba(250,250,249,0.95) + backdrop-blur 14,
│   1px hairline top, padding 8/12/28 in handoff; we substitute the 28
│   with calc(env(safe-area-inset-bottom, 0px) + 88px) so the input sits
│   ABOVE the global floating BottomBar pill and clears the iOS home
│   indicator)
│   ├── Attach button 38×38 round, white bg, 1px --border, IPlus 18 --text-2
│   ├── Input pill (flex 1)
│   │   - bg #fff, 1px --border, radius 22, padding 8/14, min-height 38
│   │   - <input> placeholder "Сообщение для УК…" 14/normal --text
│   │   - ICamera 18 --text-3 (no-op visual only)
│   └── Send button 38×38 round, conditional:
│       - draft empty → bg --stone-200, color --stone-500
│       - draft non-empty → bg --amber-600, color #fff, shadow --sh-amber
└── (global BottomBar floats on top, no separate bar inside the chat)
```

## 2. Tokens used (from [`tokens-chat.css`](./tokens-chat.css))

| Token | Hex | Where |
|---|---|---|
| Page bg | `#FAFAF9` | chat root `<div className="kz-screen">` background |
| Brand orange | `#FB923C`/`#EA580C` | outgoing bubble gradient, avatar gradient, send button bg when active |
| Hairline | `rgba(0, 0, 0, 0.06)` | header bottom border, composer top border |
| --border | warm stone neutral | every white card's 1 px ring |
| --amber-50/100/200/700/800 | brand-tinted | pinned chip + request mini-card |
| --stone-150 | warm light | date separator pill bg |
| --stone-200 | warm neutral | send button idle bg |
| --stone-400 | warm grey | typing dots |
| --stone-500 | warm grey | send button idle icon |
| --text / --text-2 / --text-3 | warm dark scale | body, secondary, tertiary text |
| --success `#15A06E` | green | online dot + status text |
| --sh-1 | warm card shadow | incoming bubbles + quick replies |
| --sh-amber | warm orange shadow | send button + outgoing bubble |

## 3. Layout contract with the rest of the app

- The screen is rendered by `ChatPage` for `user.role ∈ { resident, tenant, commercial_owner }` (the "direct chat" roles that go straight into the УК thread).
- The global `BottomBar` (the floating pill defined in `src/components/BottomBar.tsx`) must stay visible on `/chat` — its previous self-hide rule for `/chat` + direct-chat roles is removed in this round. The chat is the same shell as Home / Vehicles / Profile.
- The chat composer reserves `calc(env(safe-area-inset-bottom, 0px) + 88 px)` of bottom padding so the input rail sits exactly above the floating pill (pill height ≈ 68 px + small gap + safe-area).
- The `kz-screen` container is sized `height: 100dvh` and uses `display: flex; flex-direction: column; overflow: hidden` so the messages region scrolls internally and the sticky header / composer stay pinned.
- iOS / Android status-bar paint stays handled by the global theme-color (now neutral light) plus the chat header's translucent backdrop sitting under `env(safe-area-inset-top)`.

## 4. Real-data integration

We do not introduce a new chat backend. The new view consumes the same
`chatApi` (already used by `ChatView`):

- `chatApi.getMessages(channelId)` — fetch on mount and every 15 s.
- `chatApi.markAsRead(channelId)` — fire-and-forget after each fetch so the
  resident's own unread counter zeroes out.
- `chatApi.sendMessage(channelId, text)` — POST, then refetch.

The pinned active-request chip resolves from `useRequestStore`:

- pick the most recent request of the current resident that's not
  `cancelled`; show `#<number> · <title> · <status>`; click navigates to
  `/?tab=requests`.

The attached-request mini-card inside a bubble is rendered only if the
backend message later starts shipping structured attachments. Until then
the chat shows plain bubbles like today; the handoff visual is preserved
for when the data arrives.

The typing indicator and reactions are visual-only for now (the API
doesn't broadcast typing / reactions yet); they're kept in the source so
the upgrade is a wiring change, not a re-port.

## 5. What's not re-implemented

- Search-in-conversation, info-popup, lightbox photo viewer, emoji
  picker, attachment menu — these live in the older `ChatView` admin
  surface and were not in the handoff. The resident screen stays
  intentionally focused per the design.
- Admin / manager / dispatcher conversation pane keeps using the
  existing `ChatView` component. The handoff is resident-only.
