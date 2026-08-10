# Paperclip-2 — Satirical AI News Channel

A YouTube news comedy channel parodying the AI industry through a fictional
news team where each character represents a major AI company. Tonal targets:
Anchorman + The Daily Show with Jon Stewart + Family Guy.

The channel is also a marketing surface: in-show "commercials" are real
AVIntelligence ads. The joke is that the news team's sponsor is the same
fictional company they keep accidentally exposing.

**Channel:** https://www.youtube.com/channel/UCYF8-6-c58m0NskmcK8CGWg

## Content Cadence

| Format | Length | Frequency | Purpose |
|---|---|---|---|
| Daily Short | 30–60 sec | Mon–Fri | Algorithm feed, one-joke unit per day |
| Weekly Show | 3–8 min | Friday | Anchor narrative + multi-segment, ad-included |
| Special / Hot Take | 60–180 sec | Reactive | Real AI-industry news (model launch, lawsuit, scandal) |

Daily shorts are reusable: the best beats from the weekly show get re-cut
into shorts the following week.

## Cast Hierarchy

The full character bible lives in `shared/cast.md`. Roster summary:

| Character | Represents | Role |
|---|---|---|
| **Chloe Antropova** | Anthropic | Lead Anchor — composed, thoughtful, slightly preachy |
| **Cody Aperti** | OpenAI | Co-Anchor — slick, evangelistic, brand-conscious |
| **Gem Bardelli** | Google Gemini | Field Reporter — bubbly, accidentally helpful |
| **Grock Maskovich** | xAI / Musk-coded | Tech Correspondent — chaotic, conspiracy-tinged |
| **Mistral Lafleur** | Mistral AI | International Desk — French, gravitas |
| **Llama Metaxa** | Meta Llama | Weather — vibey, philosophical, "open-source" framed |
| **Deep Xian** | DeepSeek | Investigative — quiet, undermines claims with footnotes |
| **Perp Plexovsky** | Perplexity | Junior Reporter — eager, overly-cited questions |
| **Sakura Fukuya** | Fugaku LLM + Sakana AI | Asia-Pacific Desk & Research — quietly brilliant, cheerfully devastating |
| **Cole Office** | Microsoft Copilot | Senior Producer (off-camera) — corporate hand of god |

All names are proposed — easy to swap, edit `shared/cast.md`.

## Agent Team (11 agents)

| # | Agent | Cadence | Model / Tool | Outputs |
|---|---|---|---|---|
| 1 | Showrunner | Weekly Mon | Opus 4.7 | Week's show arc, segment plan, recurring-bit calendar |
| 2 | News Scout | Daily 04:00 UTC | Haiku 4.5 | Topic candidates ranked by comedy potential |
| 3 | Script Writer | Daily | Sonnet 4.6 | Scripted segments per character |
| 4 | Joke Doctor | Daily | Sonnet 4.6 | Punch-up pass: tighten jokes, kill duds, add callbacks |
| 5 | Storyboard Artist | Daily | Sonnet 4.6 | Shot-by-shot with character expressions, scene staging |
| 6 | Animation Engineer | Per video | Codex + Remotion + Cartoon Animator pipeline | Rendered video segments |
| 7 | Voice Director | Per video | TTS (ElevenLabs / Cartesia) | Per-character voice tracks |
| 8 | Editor / Assembler | Per video | Codex (FFmpeg / Premiere automation) | Final cut |
| 9 | Thumbnail / Titler | Per video | Sonnet + image gen | Thumbnail PNG + title + chapters |
| 10 | Publisher | Per video | YouTube API | Upload, metadata, schedule |
| 11 | Ad Writer | Per show | Sonnet 4.6 | In-show AVInt commercial scripts |

## Production Pipeline

```
Mon: Showrunner → week arc + segment plan
Daily: News Scout → topic candidates
       Script Writer → segment drafts
       Joke Doctor → punch-up
       Storyboard Artist → shot list
Per video:
  Voice Director → renders all character voices
  Animation Engineer → renders all character + B-roll segments
  Editor / Assembler → final video
  Thumbnail / Titler → assets
  Ad Writer → drops in commercial
  Publisher → uploads + schedules

Founder: reviews script before voiceover, reviews final cut before publish.
         Two checkpoints, ~30 min/day.
```

## Cost Envelope (monthly)

**Lean / starter (free-tier-heavy):** ~$50–100/mo
- LLM API (Haiku-heavy): ~$30–60
- TTS (OpenAI basic): ~$10
- YouTube Audio Library music: $0
- Free stock footage: $0
- Cartoon Animator one-time: ~$300 (amortized)

**Production-quality (sustainable cadence):** ~$250–500/mo
- LLM API (Opus + Sonnet for show, Haiku for shorts): ~$80–120
- ElevenLabs Creator (per-character voice clones): ~$22
- Cartoon Animator pipelines (rigged characters): one-time
- Remotion (programmatic video): $0 (open source)
- Epidemic Sound music: ~$15
- Midjourney for backgrounds: ~$30
- Optional AI video (Runway / Veo) for B-roll: ~$30–95

**Reality check:** YouTube monetization requires 1,000 subs + 4,000 watch
hours / 12 months. Realistic timeline to monetization: **6–12 months of
consistent shipping.** The AVInt-ad revenue loop kicks in earlier (any view
is a brand impression).

## Why This Could Work

1. **Zeitgeist:** AI industry is the dominant tech story of 2026. Audience
   exists and is growing.
2. **Underserved tone:** AI commentary is mostly serious or hostile. Comedy
   is a wide-open lane.
3. **Built-in CTA:** AVInt commercials are the show's joke. Conversion =
   funny bit.
4. **Compounding asset:** Each video is a permanent shopfront. Back catalog
   keeps working.
5. **Scalable production:** Once character pipelines are built, daily shorts
   become near-zero-marginal-cost.

## Why This Could Fail (be honest)

1. **Animation quality is the existential variable.** AI-generated comedy
   that *looks* AI-generated dies in the algorithm. We need the production
   to feel handmade, even though it isn't.
2. **Comedy by AI is mostly bad.** Joke Doctor pass + founder review must
   be ruthless. Better to skip a day than ship an unfunny one.
3. **Legal exposure exists.** Parody is protected, but trademark + defamation
   risks need active management. See `shared/legal-and-parody-guardrails.md`.
4. **Slow burn.** This is a 6–12 month bet. Not a Q2 revenue play.
5. **Founder bandwidth.** Daily shorts + weekly show is real production
   workload. Two 30-min checkpoints/day minimum.

## What This Channel Is NOT

- ❌ Not a real news source. Disclaimers in bio + show.
- ❌ Not impersonating real executives. Characters are clearly fictional.
- ❌ Not making defamatory claims about real companies.
- ❌ Not using real company logos. Fictional brand marks only.
- ❌ Not a side hobby. If it can't justify time, kill it.

## Kill Criteria

If by **Day 90:**
- Subs <500
- Avg watch time <15s on shorts / <60s on long-form
- Zero traceable AVInt conversions from channel
- Production time per video >2 founder-hours

…then the production model is broken and we either retool drastically
or shut it down.

## Open Decisions Before Build

1. **Cast names** — proposed in `shared/cast.md`. Edit / swap at will.
2. **Voice provider** — ElevenLabs (best, $22/mo) vs OpenAI TTS (cheap, less
   character) vs Cartesia (newer, very good).
3. **Animation pipeline** — Cartoon Animator + rigged puppets (recommended)
   vs full AI video generation (lower quality, easier) vs hybrid.
4. **Music budget** — Epidemic Sound ($15/mo, license-clean) vs YouTube Audio
   Library (free, limited).
5. **Free-tier lean vs production-quality** — production quality recommended;
   the channel lives or dies on perceived production value.
