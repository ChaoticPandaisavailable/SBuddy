import { generatePixelAvatar, isOpenAIConfigured } from '@/lib/openai-server';

export const runtime = 'edge';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isOpenAIConfigured()) {
    return Response.json({ error: '尚未配置 AI 图片生成密钥。' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: '无法读取上传的照片。' }, { status: 400 });
  }
  const image = form.get('image');
  if (!(image instanceof File)) return Response.json({ error: '请选择一张人物照片。' }, { status: 400 });
  if (!image.type.startsWith('image/')) return Response.json({ error: '上传的文件不是图片。' }, { status: 415 });
  if (image.size === 0) return Response.json({ error: '照片文件为空。' }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return Response.json({ error: '照片超过 8MB，请压缩后再上传。' }, { status: 413 });

  try {
    const imageUrl = await generatePixelAvatar(image);
    return Response.json({ source: 'ai', imageUrl });
  } catch {
    return Response.json({ error: 'AI 像素人生成失败，已切换到本地像素效果。' }, { status: 502 });
  }
}
