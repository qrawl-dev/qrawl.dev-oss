# @qrawl-dev/openai-tools

[qrawl](https://qrawl.dev) tools for the OpenAI Agents SDK, the Assistants API, and raw function calling — give your models live web access: `qrawl_scrape`, `qrawl_search`, `qrawl_crawl`, `qrawl_map`, and `qrawl_batch_scrape`.

## Install

```bash
npm install @qrawl-dev/openai-tools
# peer dep
npm install openai
```

## Usage

### Chat Completions / function calling

```ts
import OpenAI from 'openai'
import { qrawlFunctions, executeQrawlFunction } from '@qrawl-dev/openai-tools'

const openai = new OpenAI()
const apiKey = process.env.QRAWL_API_KEY!

const res = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Summarize the qrawl.dev homepage' }],
  tools: qrawlFunctions(),
})

const call = res.choices[0].message.tool_calls?.[0]
if (call) {
  const output = await executeQrawlFunction(apiKey, call.function.name, JSON.parse(call.function.arguments))
  // feed `output` back to the model as a tool message
}
```

### Agents SDK (tools with an executor)

```ts
import { qrawlTools } from '@qrawl-dev/openai-tools'

const tools = qrawlTools({ apiKey: process.env.QRAWL_API_KEY!, searchLimit: 5, crawlMaxPages: 20 })
// hand `tools` to your Agent — each tool's `execute()` calls qrawl for you
```

### Assistants API

```ts
import { qrawlAssistantTools } from '@qrawl-dev/openai-tools'

const assistant = await openai.beta.assistants.create({
  model: 'gpt-4o',
  tools: qrawlAssistantTools(),
})
```

Individual schemas are also exported: `QRAWL_SCRAPE_TOOL`, `QRAWL_SEARCH_TOOL`, `QRAWL_CRAWL_TOOL`, `QRAWL_MAP_TOOL`, `QRAWL_BATCH_SCRAPE_TOOL`. Get an API key at [qrawl.dev/dashboard](https://qrawl.dev/dashboard).

## License

MIT © Abdul Qayyum
