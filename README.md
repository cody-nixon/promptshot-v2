# PromptShot v2

Compare AI model responses side-by-side. Pick up to 10 models, type a prompt, see how they all respond — with timing, token counts, and cost tracking.

**Live:** https://v2.appdeploy.ai/app/c3dab34749ba422a94/

## What It Does

- **Side-by-side comparison** of up to 10 LLMs in parallel
- **300+ models** from OpenAI, Anthropic, Google, Meta, Mistral, DeepSeek, and dozens more via OpenRouter
- **Free models included** — compare without spending a cent
- **Credit-based payments** for premium models ($5 / $10 / $20 packs via Stripe)
- **Real auth** — email/password signup + Google OAuth ("Sign in with Google")
- **Usage tracking** — per-user token counts, spend, and query history
- **Mobile-friendly** — tabbed result view on small screens, responsive grid on desktop

## Business Model

- Free models: always free, no credits needed
- Paid models: 2x OpenRouter token pricing (50% gross margin)
- Credit packs: $5 / $10 / $20 via Stripe Checkout
- Usage is transparent — users see tokens used, total spend, and balance in real-time

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS |
| Backend | TypeScript (AppDeploy serverless) |
| Database | AppDeploy DB (managed) |
| LLM Gateway | OpenRouter API (300+ models) |
| Payments | Stripe Checkout (test mode) |
| Auth | Email/password (PBKDF2) + Google OAuth 2.0 |
| Hosting | AppDeploy v2 |

## Auth

Two auth methods, both producing Bearer tokens for API access:

1. **Email/password** — PBKDF2 hashing (100K iterations, SHA-256), signup/login/logout
2. **Google OAuth** — via Google Cloud project `promptshot-486910`. Client-side redirect flow (AppDeploy CDN serves GET routes as HTML, so the callback is POST-based)

All protected routes use `Authorization: Bearer <token>` headers.

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/signup` | Create account (email + password) |
| POST | `/api/auth/login` | Login, returns auth token |
| POST | `/api/auth/logout` | Invalidate token |
| GET | `/api/auth/me` | Current user info + usage stats |
| POST | `/api/auth/google` | Get Google OAuth consent URL |
| POST | `/api/auth/google/callback` | Exchange Google auth code for session |
| GET | `/api/models` | List all available models (cached 1hr) |
| POST | `/api/chat` | Compare models (Bearer auth required) |
| POST | `/api/checkout` | Create Stripe checkout session |
| POST | `/api/checkout/verify` | Verify payment and add credits |
| GET | `/api/usage` | User's detailed usage history |
| POST | `/api/admin/config` | Set API keys (admin only) |

## Security

- Passwords hashed with PBKDF2 (100K iterations, SHA-256, random salt)
- Bearer token auth on all protected routes
- CSRF protection on Google OAuth via random state parameter
- Rate limiting: 10 req/min (free), 30 req/min (paid)
- Input validation: prompt length, model ID format, max models
- API keys stored in DB config, never in source code
- Credit deduction is atomic: estimate → deduct → call → refund difference

## Project Structure

```
├── backend/
│   ├── index.ts          # All API routes
│   └── realtime.ts       # WebSocket handling
├── src/
│   ├── App.tsx           # Main app + auth flow
│   ├── components/
│   │   ├── AuthModal.tsx     # Login/signup + Google OAuth
│   │   ├── Header.tsx        # Nav bar + usage stats panel
│   │   ├── PromptArea.tsx    # Prompt input
│   │   ├── ModelPicker.tsx   # Model browser with search
│   │   ├── ResultsGrid.tsx   # Comparison results (tabbed mobile / grid desktop)
│   │   ├── CreditDialog.tsx  # Buy credits modal
│   │   └── UpgradeDialog.tsx # Paid model upgrade prompt
│   ├── types.ts
│   ├── main.tsx
│   └── index.css
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Development

This app runs on AppDeploy. There's no local dev server — deploy changes via the AppDeploy MCP API.

```bash
# Config keys (set via POST /api/admin/config with admin secret)
OPENROUTER_API_KEY    # OpenRouter API key
STRIPE_SECRET_KEY     # Stripe secret key (test mode)
GOOGLE_CLIENT_ID      # Google OAuth client ID
GOOGLE_CLIENT_SECRET  # Google OAuth client secret
```

## License

MIT
