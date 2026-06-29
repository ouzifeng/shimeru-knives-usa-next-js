# Shimeru Knives Affiliate Agreement (US)

**This is a draft template, not legal advice.** Have it reviewed by a US attorney before use, in particular Section 8 (Content License) and Section 11 (Compliance), and set the governing state.

The full, current wording is rendered from `src/components/affiliate-agreement-body.tsx` (shared by the preview at `/affiliate/agreement` and the per-affiliate signing page at `/affiliate/agreement/[token]`). This file is a human-readable mirror / checklist.

## Key terms (same economics as UK)
- Non-exclusive appointment; independent contractor.
- 20% of Net Product Value (after discount, excl. **sales tax** and shipping).
- 30-day last-click attribution.
- 14-day refund hold, then approved; monthly payout, no minimum; clawback on refund/chargeback/fraud.
- **Perpetual**, worldwide, royalty-free content license including paid ads (Section 8).
- FTC Endorsement Guides disclosure required (Section 4.2).
- Knife/age compliance: adults only, no marketing to minors, lawful culinary context, subject to age/delivery checks and federal/state/local knife law (Section 11).
- W-9 / 1099 tax handling (Section 7.4).

## Placeholders to fill before sending
- **US legal entity name and address** — the component currently shows "Shimeru Knives (US)" only. Update `COMPANY` in `affiliate-agreement-body.tsx`.
- **Governing state** — Section 18 reads "State of [US STATE]" and "[US STATE / COUNTY]". Set to the state where the US entity sits.

## Acceptance
Affiliate types their name to sign at `/affiliate/agreement/[token]`; the signature (name, time, IP, user-agent) is recorded on the affiliate row and both admin and affiliate are emailed.
