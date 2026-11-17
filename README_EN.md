# Agent101

[简体中文](README.md) | [English](README_EN.md)

**Learn, build, and document AI agents—from core mechanisms to engineering and real applications.**

This repository captures my learning, experiments, and reflections on agent systems: understanding key concepts, studying open-source projects, reproducing common approaches, and documenting engineering tradeoffs and failures. The goal is a body of knowledge that is easy to navigate, verify, and reuse.

> Work in progress: the repository overview and content plan are in place. Articles and code experiments will follow. The topics and directories below are planned; they do not indicate existing implementations.

## Contents

- [What this repository covers](#what-this-repository-covers)
- [Knowledge map](#knowledge-map)
- [Learning and practice roadmap](#learning-and-practice-roadmap)
- [Repository organization](#repository-organization)
- [Documenting a study or experiment](#documenting-a-study-or-experiment)
- [Reference tutorials](#reference-tutorials)
- [Next steps](#next-steps)

## What this repository covers

One question guides this work: **How can we make agents complete real tasks reliably and controllably within explicit boundaries?**

- **Principles and architecture**: agent loops, tool calling, planning, state management, and task orchestration.
- **Context and knowledge**: context engineering, memory, RAG, and how information enters and leaves context.
- **Engineering and operations**: evaluation, tracing, persistence, recovery, permissions, cost, and latency.
- **Projects and practice**: source code studies, minimal reproductions, approach comparisons, and lessons from real scenarios.

The overview is available in Chinese and English. Translations of topic notes and experiments will be added over time, retaining relevant English terminology. Content explains mechanisms and tradeoffs before discussing specific frameworks, with links to original sources, experiments, or execution evidence wherever possible.

## Knowledge map

| Topic | Key questions | Planned outputs |
| --- | --- | --- |
| Foundations and boundaries | How do agents differ from workflows and ordinary LLM applications? When is an agent useful? | Concept notes, use-case analysis |
| Agent loop | How does a model cycle through observation, decision, and action? When should it stop? | Minimal implementation, execution traces |
| Tools and protocols | How should tool interfaces, argument validation, and errors be handled? What does MCP solve? | Tool examples, protocol notes |
| Planning and orchestration | How can tasks be decomposed, routed, run in parallel, and replanned? | Pattern implementations, comparisons |
| Context engineering | How should context be selected, organized, and compressed? How are long tasks handled? | Context strategies, controlled experiments |
| Memory and retrieval | What roles do session state, long-term memory, and RAG play? | Storage designs, retrieval experiments |
| Multi-agent systems | When should roles be split? How should agents share state, hand off tasks, and control coordination costs? | Collaboration patterns, failure cases |
| Evaluation and observability | How is task success measured? How can a failed step be diagnosed? | Evaluation sets, trace analysis |
| Reliability and security | How should retries, idempotency, recovery, sandboxing, and human approval work? | Failure experiments, boundary designs |
| Production and optimization | How should deployment, regression checks, and versioning work? How do quality, latency, and cost trade off? | Engineering checklists, performance records |
| Applications and source code | How do coding, research, and browser agents organize a complete system? | Project breakdowns, end-to-end cases |

## Learning and practice roadmap

Each stage aims to produce three things: an explanation, a runnable example, and validation results.

| Stage | Practical goal | Acceptance criteria |
| --- | --- | --- |
| 01 · Build a minimal loop | Implement a single agent with model calls, tool execution, and stopping conditions | Completes predefined tasks; terminates on tool failure or step-limit exhaustion |
| 02 · Add knowledge and state | Introduce retrieval, session persistence, and context management | Uses information across turns; explains how retrieved evidence relates to the answer |
| 03 · Establish an evaluation baseline | Fix a task set and record success rate, call count, cost, and latency | Runs are reproducible enough to compare changes on the same task set |
| 04 · Improve reliability | Add retries, timeouts, recovery, and permission controls for actions with side effects | Fails or recovers as expected under simulated tool errors |
| 05 · Explore orchestration | Compare a single agent, fixed workflows, and multiple agents | Shows benefits, additional costs, and applicability using the same task set |
| 06 · Build a real application | Complete a research, coding, or browser task as an end-to-end project | Includes usage instructions, execution records, evaluation results, and known limitations |

## Repository organization

The planned structure below will be created as content is added:

```text
Agent101/
├── README.md               # Chinese overview, navigation, and progress
├── README_EN.md            # English overview
├── notes/                  # Concepts, mechanisms, and topic notes
├── labs/                   # Independently runnable minimal experiments
├── projects/               # End-to-end projects
├── readings/               # Paper, tutorial, and source code reading notes
├── evaluations/            # Evaluation tasks, metrics, and result analysis
└── assets/                 # Illustrations and other static resources
```

Topics use descriptive English directory names, such as `agent-loop` and `context-engineering`. Each experiment documents its environment, dependencies, run instructions, expected results, and limitations, without relying on undocumented local configuration.

## Documenting a study or experiment

Start with this template and adapt it to the topic:

```markdown
# Topic title

## Problem and background
What problem does this address? What are the use cases and boundaries?

## Core mechanisms
What are the key concepts, execution flow, state, and interfaces?

## Implementation and reproduction
Models, dependency versions, configuration, data, and run commands.

## Results and evidence
Was the task completed? Include success and failure examples, traces, cost, and latency.
For comparisons, describe the baseline, sample size, and evaluation method.

## Tradeoffs and limitations
Which conclusions come from experiments? Which are hypotheses? What remains unverified?

## References
Original links, reading dates, and sources of quoted or adapted material.
```

Follow these conventions:

- **Separate facts from interpretation**: distinguish source claims, personal understanding, and experimental results.
- **Keep failure cases**: document triggers, symptoms, diagnosis, and fixes.
- **Use a baseline for comparisons**: keep tasks, models, and configuration consistent where possible.
- **Record dates and versions**: models, frameworks, and protocols change; conclusions need a stated scope.
- **Respect sources and privacy**: credit quoted or adapted work and follow its license; sanitize example data and supply secrets through environment variables.

## Reference tutorials

These first-party tutorials and open-source projects informed the repository plan. The emphasis below describes how I intend to study them; reading notes will be added over time.

| Tutorial / project | Focus | Inspiration for this repository |
| --- | --- | --- |
| [Microsoft · AI Agents for Beginners](https://github.com/microsoft/ai-agents-for-beginners) | Agent fundamentals, design patterns, tools, memory, and production practices organized by topic | Build a knowledge map spanning fundamentals and engineering |
| [Hugging Face · Agents Course](https://github.com/huggingface/agents-course) | Core concepts, framework practice, agentic RAG, and benchmark tasks | Connect conceptual learning, implementation, and evaluation |
| [LangChain · Agents From Scratch](https://github.com/langchain-ai/agents-from-scratch) | An email assistant that progressively adds evaluation, human involvement, and memory | Use one complete application to validate system evolution |
| [Datawhale · Hello-Agents](https://github.com/datawhalechina/hello-agents) | A systematic Chinese tutorial covering principles, frameworks, context, protocols, and integrated projects | Combine structured knowledge notes with implementations from scratch |

Reference links checked on 2026-11-18. Refer to each project's current documentation for course content and runtime requirements. Individual notes and experiments will credit their specific sources.

## Next steps

- [x] Initialize the README with the repository purpose, knowledge map, roadmap, and reference tutorials.
- [ ] Write the first note: boundaries between agents, workflows, and LLM applications.
- [ ] Build the first experiment: a minimal agent loop with tool calling, stopping conditions, and execution logs.
- [ ] Create a task set and failure examples for the minimal agent to establish an evaluation baseline.
- [ ] Complete a source code study and map the implementation back to the knowledge map.

Use Issues to discuss questions, suggest resources, or report errors. Content will evolve through continued learning and practice.
