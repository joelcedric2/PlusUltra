# PlusUltra

**One AI model gets it wrong sometimes. Five models debating each other almost never do.**

PlusUltra is a 4-dimensional temporal intelligence council where multiple LLMs argue, challenge, and converge on the best possible answer -- then the system remembers what it learned for next time.

## Why This Exists

You ask ChatGPT a hard question. It hallucinates. You ask Claude. Different hallucination. You ask Gemini. Wrong in a third way. Each model has blind spots -- but they're *different* blind spots.

PlusUltra puts 4-5 LLMs in a room and makes them debate. They challenge each other's reasoning, catch each other's mistakes, and converge on answers that no single model could reach alone. The system tracks what works across sessions, so it gets smarter over time.

## How It Works

```
You ask a question
     |
     v
4-5 LLMs generate independent responses
     |
     v
Temporal reasoning framework scores and ranks them
     |
     v
Models debate -- challenging weak points, defending strong ones
     |
     v
Council converges on optimal answer
     |
     v
System learns from the outcome for next time
```

### The 4D Temporal Framework

This isn't just "ask multiple models and pick the best." PlusUltra reasons across four dimensions:

- **Depth** -- How thoroughly does each model explore the problem?
- **Breadth** -- What range of perspectives does each model consider?
- **Temporal** -- How do the models' positions evolve through debate rounds?
- **Convergence** -- Where do independent reasoning paths naturally agree?

When three models independently arrive at the same conclusion through different reasoning chains, that answer is almost certainly correct.

## Key Capabilities

- **Multi-LLM Council** -- Orchestrates 4-5 models (GPT-4, Claude, Gemini, Llama, Mistral) in structured debate
- **Temporal Reasoning** -- Tracks how answers evolve across debate rounds, not just final outputs
- **Convergence Detection** -- Identifies when models independently agree, signaling high-confidence answers
- **Session Memory** -- System retains what it learns. Query 1,000 is smarter than query 1
- **Confidence Scoring** -- Every answer comes with a convergence score so you know how much the council agreed

## Architecture

Full-stack TypeScript application:

- **Backend** -- Fastify + Prisma + PostgreSQL
- **Frontend** -- React + TypeScript
- **LLM Integration** -- Multi-provider orchestration layer
- **Memory** -- Persistent learning across sessions
- **45,000+ lines** of production code across 65+ features

## Current Status

**Prototype** -- Core council and temporal reasoning framework implemented. The debate engine works. Multi-provider LLM orchestration is functional. Active development.

## Getting Started

```bash
# Clone
git clone https://github.com/joelcedric2/PlusUltra.git
cd PlusUltra

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your API keys for each LLM provider

# Database
npx prisma migrate dev

# Run
npm run dev
```

## Use Cases

- **Research questions** where accuracy matters more than speed
- **Technical decisions** where you want multiple expert perspectives
- **Complex analysis** where single-model blind spots are dangerous
- **High-stakes queries** where "probably right" isn't good enough

## How It Compares

| Approach | Models | Debate | Learns | Confidence Score |
|----------|--------|--------|--------|-----------------|
| Single LLM | 1 | No | No | No |
| RAG Pipeline | 1 | No | No | No |
| Mixture of Experts | Multiple (internal) | No | No | No |
| **PlusUltra** | **4-5 independent** | **Yes** | **Yes** | **Yes** |

## License

MIT
