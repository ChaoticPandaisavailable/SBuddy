import { createStructuredResponse, isOpenAIConfigured } from '@/lib/openai-server';

export const runtime = 'edge';

type SummaryResult = {
  summary: string;
  highlights: string[];
  actionItems: string[];
};

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    highlights: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 160 } },
    actionItems: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 160 } },
  },
  required: ['summary', 'highlights', 'actionItems'],
};

export async function POST(request: Request): Promise<Response> {
  let title = '';
  let transcript = '';
  try {
    const body = (await request.json()) as { title?: unknown; transcript?: unknown };
    title = typeof body.title === 'string' ? body.title.trim() : '';
    transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  } catch {
    return Response.json({ error: '请求内容不是有效的 JSON。' }, { status: 400 });
  }

  if (!transcript) return Response.json({ error: '没有可整理的听写内容。' }, { status: 400 });
  if (transcript.length > 50_000) return Response.json({ error: '听写内容过长，请分段整理。' }, { status: 413 });

  if (isOpenAIConfigured()) {
    try {
      const result = await createStructuredResponse<SummaryResult>({
        name: 'study_buddy_meeting_notes',
        schema: summarySchema,
        instructions:
          '你是中文课堂与会议纪要助手。忠实依据听写文本输出简洁摘要、关键要点和明确行动项。不要补充听写中没有的信息；没有行动项时返回空数组。行动项用可执行的动词开头。',
        input: `标题：${title || '未命名记录'}\n\n听写：\n${transcript}`,
      });
      return Response.json({ source: 'ai', ...result });
    } catch {
      return Response.json({ source: 'fallback', warning: 'AI 服务暂时不可用，已生成本地速记摘要。', ...fallbackSummary(transcript) });
    }
  }

  return Response.json({ source: 'fallback', warning: '尚未配置 AI 密钥，当前显示本地速记摘要。', ...fallbackSummary(transcript) });
}

function fallbackSummary(transcript: string): SummaryResult {
  const sentences = transcript
    .split(/(?<=[。！？!?])/) 
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const highlights = sentences.slice(0, 3).map((sentence) => sentence.replace(/[。！？!?]+$/, ''));
  const actionItems = sentences
    .filter((sentence) => /需要|要做|完成|准备|负责|截止|下一步|行动/.test(sentence))
    .slice(0, 5)
    .map((sentence) => sentence.replace(/[。！？!?]+$/, ''));
  return {
    summary: (sentences.slice(0, 2).join('') || transcript).slice(0, 500),
    highlights,
    actionItems,
  };
}
