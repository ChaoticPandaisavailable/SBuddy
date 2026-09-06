import { normalizeAvatarStyle, type AvatarStyle } from '@/lib/avatar-style';
import { createStructuredResponse, isOpenAIConfigured } from '@/lib/openai-server';

export const runtime = 'edge';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const avatarStyleSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hairStyleId: { type: 'string', enum: ['short', 'medium', 'long', 'curly'] },
    hairColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    skinTone: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    topColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    bottomColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    accessory: { type: 'string', enum: ['none', 'glasses'] },
  },
  required: ['hairStyleId', 'hairColor', 'skinTone', 'topColor', 'bottomColor', 'accessory'],
};

export async function POST(request: Request): Promise<Response> {
  if (!isOpenAIConfigured()) {
    return Response.json({ error: '尚未配置 AI 造型分析，已使用浏览器本地匹配。' }, { status: 503 });
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
  if (!image.size || image.size > MAX_IMAGE_BYTES) return Response.json({ error: '照片需小于 8MB。' }, { status: 413 });

  try {
    const dataUrl = await fileToDataUrl(image);
    const result = await createStructuredResponse<AvatarStyle>({
      name: 'study_buddy_avatar_style',
      schema: avatarStyleSchema,
      instructions:
        '你是像素角色造型分析器。只观察照片中主要人物，返回最接近的受限造型参数。颜色用清晰、适合像素画的六位十六进制色；topColor 是上衣主色，bottomColor 是裤子或裙子主色。不要描述身份、年龄、性别、种族或其他敏感属性。',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: '请把这张照片映射到固定骨架像素人的造型参数。' },
          { type: 'input_image', image_url: dataUrl, detail: 'low' },
        ],
      }],
      maxOutputTokens: 350,
      purpose: 'vision',
    });
    return Response.json({ source: 'ai', style: normalizeAvatarStyle(result) });
  } catch {
    return Response.json({ error: 'AI 造型分析暂时不可用，已切换到本地匹配。' }, { status: 502 });
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}
