const OPENAI_API_ROOT = 'https://api.openai.com/v1';

type StructuredResponseOptions = {
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: unknown;
  maxOutputTokens?: number;
  purpose?: 'text' | 'vision';
};

type OpenAIResponseContent = {
  type?: string;
  text?: string;
};

type OpenAIResponseItem = {
  type?: string;
  content?: OpenAIResponseContent[];
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: OpenAIResponseItem[];
  error?: { message?: string };
};

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function createStructuredResponse<T>({
  name,
  schema,
  instructions,
  input,
  maxOutputTokens = 2400,
  purpose = 'text',
}: StructuredResponseOptions): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch(`${OPENAI_API_ROOT}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: resolveStructuredModel(purpose),
      store: false,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema,
        },
      },
    }),
  });

  const body = (await response.json()) as OpenAIResponseBody;
  if (!response.ok) {
    throw new Error(body.error?.message || `OpenAI request failed (${response.status})`);
  }

  const outputText = extractOutputText(body);
  if (!outputText) throw new Error('OpenAI response did not contain structured text');
  return JSON.parse(outputText) as T;
}

function resolveStructuredModel(purpose: 'text' | 'vision'): string {
  if (purpose === 'vision') {
    return (
      process.env.OPENAI_VISION_MODEL?.trim()
      || process.env.OPENAI_TEXT_MODEL?.trim()
      || 'gpt-5.4-mini'
    );
  }
  return process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-5.4-mini';
}

export async function transcribeAudio(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const form = new FormData();
  form.set('file', file, file.name || 'recording.wav');
  form.set('model', process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-transcribe');
  form.set('language', 'zh');
  form.set('prompt', '这是一段中文课堂或会议录音。请准确保留课程名、项目名、人名、地点、时间和行动项。');

  const response = await fetch(`${OPENAI_API_ROOT}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = (await response.json()) as { text?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message || `Transcription failed (${response.status})`);
  }
  const transcript = body.text?.trim();
  if (!transcript) throw new Error('Transcription response was empty');
  return transcript;
}

export async function generatePixelAvatar(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const form = new FormData();
  form.set('model', process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2');
  form.set('image[]', file, file.name || 'portrait.png');
  form.set(
    'prompt',
    'Transform the person in this reference photo into a charming full-body 16-bit pixel-art study companion sprite. Preserve their recognizable hairstyle, face shape, glasses, skin tone, and main clothing colors. Front-facing neutral standing pose, friendly expression, centered composition, crisp deliberate square pixels, limited harmonious palette, simple transparent-looking plain background, no text, no frame, no extra people, no photorealism. The character must remain easy to read on a small 320x480 desktop display.',
  );
  form.set('size', '1024x1024');
  form.set('quality', 'medium');

  const response = await fetch(`${OPENAI_API_ROOT}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message || `Image edit failed (${response.status})`);
  const base64 = body.data?.[0]?.b64_json;
  if (!base64) throw new Error('Image edit response was empty');
  return `data:image/png;base64,${base64}`;
}

function extractOutputText(body: OpenAIResponseBody): string | undefined {
  if (body.output_text?.trim()) return body.output_text.trim();
  for (const item of body.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text?.trim()) return content.text.trim();
    }
  }
  return undefined;
}
