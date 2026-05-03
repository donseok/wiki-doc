import 'server-only';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return apiKey;
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL || 'gpt-5.5';
}

export function getOpenAIEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
}

export function getOpenAIEmbeddingDimensions() {
  return Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);
}

export async function generateText(prompt: string) {
  const apiKey = requireApiKey();
  const model = getOpenAIModel();

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI request failed: ${res.status} ${body}`.trim());
  }

  const data = (await res.json()) as {
    output_text?: string;
  };

  if (!data.output_text) {
    throw new Error('OpenAI response did not include output_text');
  }

  return {
    model,
    text: data.output_text,
  };
}

export async function generateEmbedding(input: string) {
  const result = await generateEmbeddings([input]);
  return result.embeddings[0];
}

export async function generateEmbeddings(inputs: string[]) {
  const apiKey = requireApiKey();
  const model = getOpenAIEmbeddingModel();
  const dimensions = getOpenAIEmbeddingDimensions();

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: inputs,
      dimensions,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI embeddings request failed: ${res.status} ${body}`.trim());
  }

  const data = (await res.json()) as {
    data?: { index: number; embedding: number[] }[];
  };

  const embeddings = (data.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  if (embeddings.length !== inputs.length || embeddings.some((item) => !Array.isArray(item))) {
    throw new Error('OpenAI embeddings response did not include all embeddings');
  }

  return {
    model,
    dimensions,
    embeddings,
  };
}
