import { isOpenAIConfigured, transcribeAudio } from '@/lib/openai-server';

export const runtime = 'edge';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isOpenAIConfigured()) {
    return Response.json(
      { error: '尚未配置 AI 语音转写密钥。可以粘贴文字稿，继续整理纪要。' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: '无法读取上传的录音。' }, { status: 400 });
  }
  const audio = form.get('audio');
  if (!(audio instanceof File))
    return Response.json({ error: '请选择录音文件。' }, { status: 400 });
  if (audio.size === 0)
    return Response.json({ error: '录音文件为空。' }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES)
    return Response.json(
      { error: '录音超过 20MB，请缩短后再上传。' },
      { status: 413 },
    );

  try {
    const transcript = await transcribeAudio(audio);
    return Response.json({ source: 'ai', transcript });
  } catch {
    return Response.json(
      { error: '录音转写失败，请检查网络或稍后重试。' },
      { status: 502 },
    );
  }
}
