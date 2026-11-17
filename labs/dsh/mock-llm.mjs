// Adapted from DeepSeek Harness cli-mock-llm.ts, commit 38a6a5c.
// Copyright (c) 2026 DeepSeek. MIT; see UPSTREAM_LICENSE_DSH.txt.
// This adapter emits fixed responses. It does not interpret arbitrary prompts.
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm';

class TutorialAdapter extends LlmAdapter {
  requests = 0;

  async resolveModel(provider, model) {
    return { provider, id: model, name: model };
  }

  async *stream(options) {
    const last = options.messages.at(-1);
    this.requests += 1;
    console.error(`agent101-mock: request=${this.requests}; lastRole=${last?.role}`);
    if (last?.role !== 'tool') {
      const windows = process.platform === 'win32';
      const args = JSON.stringify({
        command: windows ? 'Get-Content README.md,package.json' : 'cat README.md package.json',
        description: 'Read the two tutorial fixture files.',
      });
      yield { type: 'block-start', index: 0, blockType: 'tool-call' };
      yield {
        type: 'tool-call-delta', index: 0, id: ToolCallId('tutorial-read-files'),
        name: windows ? 'pwsh' : 'bash', argumentsDelta: args,
      };
      yield {
        type: 'block-end', index: 0,
        block: {
          type: 'tool-call', id: ToolCallId('tutorial-read-files'),
          name: windows ? 'pwsh' : 'bash', arguments: args,
        },
      };
      yield { type: 'finish', reason: { kind: 'tool-calls' } };
      return;
    }
    const result = last.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
    const text = `Observed workspace files:\n${result.trim()}`;
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

export const name = 'agent101-mock-llm';
export const inject = ['llm', 'tools'];
export function apply(ctx) {
  ctx.llm.registerAdapter(['agent101-mock'], new TutorialAdapter());
}
