// Server-only configuration. Never import this module into a client component.
export function aiConfig() {
  const provider =
    process.env.AI_PROVIDER?.trim() ||
    (process.env.AIPING_API_KEY?.trim() ? 'aiping' : 'openai');
  if (provider !== 'aiping' && provider !== 'openai')
    throw new Error('Unsupported AI_PROVIDER');
  const aiping = provider === 'aiping';
  return {
    provider,
    apiKey:
      (aiping
        ? process.env.AIPING_API_KEY
        : process.env.OPENAI_API_KEY
      )?.trim() || '',
    baseUrl: (
      (aiping
        ? process.env.AIPING_BASE_URL
        : process.env.OPENAI_BASE_URL
      )?.trim() ||
      (aiping ? 'https://aiping.cn/api/v1' : 'https://api.openai.com/v1')
    ).replace(/\/+$/, ''),
    textModel:
      (aiping
        ? process.env.AIPING_TEXT_MODEL
        : process.env.OPENAI_TEXT_MODEL
      )?.trim() || (aiping ? 'Qwen3-Next-80B-A3B-Instruct' : 'gpt-5.4-mini'),
    visionModel:
      (aiping
        ? process.env.AIPING_VISION_MODEL
        : process.env.OPENAI_VISION_MODEL
      )?.trim() ||
      (aiping
        ? 'Qwen3-VL-30B-A3B-Instruct'
        : process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-5.4-mini'),
    imageModel:
      (aiping
        ? process.env.AIPING_IMAGE_MODEL
        : process.env.OPENAI_IMAGE_MODEL
      )?.trim() || (aiping ? 'Doubao-Seedream-5.0-lite' : 'gpt-image-2'),
  };
}
export function transcriptionConfig() {
  const provider =
    process.env.TRANSCRIBE_PROVIDER?.trim() ||
    (process.env.MOSS_API_KEY?.trim() ? 'moss' : 'openai');
  if (provider !== 'moss' && provider !== 'openai')
    throw new Error('Unsupported TRANSCRIBE_PROVIDER');
  const moss = provider === 'moss';
  return {
    provider,
    apiKey:
      (moss ? process.env.MOSS_API_KEY : process.env.OPENAI_API_KEY)?.trim() ||
      '',
    baseUrl: (
      (moss
        ? process.env.MOSS_BASE_URL
        : process.env.OPENAI_BASE_URL
      )?.trim() ||
      (moss ? 'https://api.mosi.cn/v1' : 'https://api.openai.com/v1')
    ).replace(/\/+$/, ''),
    model:
      (moss
        ? process.env.MOSS_TRANSCRIBE_MODEL
        : process.env.OPENAI_TRANSCRIBE_MODEL
      )?.trim() || (moss ? 'moss-transcribe-1.0' : 'gpt-4o-mini-transcribe'),
  };
}
