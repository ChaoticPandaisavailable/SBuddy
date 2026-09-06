import { createStructuredResponse, isOpenAIConfigured } from '@/lib/openai-server';

export const runtime = 'edge';

const dialogueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 180 },
  },
  required: ['text'],
};

export async function POST(request: Request): Promise<Response> {
  let text = '';
  let context = '';
  let buddyName = '';
  let personality = '';
  try {
    const body = (await request.json()) as { text?: unknown; context?: unknown; buddyName?: unknown; personality?: unknown };
    text = typeof body.text === 'string' ? body.text.trim() : '';
    buddyName = typeof body.buddyName === 'string' ? body.buddyName.slice(0, 24) : '';
    personality = typeof body.personality === 'string' ? body.personality.slice(0, 60) : '';
    context = typeof body.context === 'string' ? body.context.trim().slice(0, 80) : '';
  } catch {
    return Response.json({ error: '请求内容不是有效的 JSON。' }, { status: 400 });
  }
  if (!text || text.length > 300) return Response.json({ error: '台词长度无效。' }, { status: 400 });
  if (!isOpenAIConfigured()) return Response.json({ source: 'fallback', text });

  try {
    const result = await createStructuredResponse<{ text: string }>({
      name: 'study_buddy_dialogue_polish',
      schema: dialogueSchema,
      instructions:
        '你是温柔吐槽型的像素学习搭子。润色给定中文台词，使它自然、简短、有陪伴感和一点轻松吐槽。保持原意，不新增问题、选项、承诺或事实；不恋爱化、不说教、不羞辱用户，不涉及敏感隐私。只返回润色后的单句或两句台词。',
      input: `角色名称：${buddyName}，语气：${personality}\n情境：${context || '学习陪伴'}\n原台词：${text}`,
      maxOutputTokens: 180,
    });
    return Response.json({ source: 'ai', text: result.text.trim() || text });
  } catch {
    return Response.json({ source: 'fallback', text });
  }
}
