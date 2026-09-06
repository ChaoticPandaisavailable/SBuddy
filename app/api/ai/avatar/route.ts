import {
  generatePixelAvatar,
  isOpenAIConfigured,
  aiServiceMessage,
} from '@/lib/openai-server';
import {
  analyzePerson,
  imageDataUrl,
  spriteGenerationPrompt,
  portraitGenerationPrompt,
  validateSpriteSemantics,
} from '@/lib/avatar-generation';
import { SPRITE_MANIFEST } from '@/lib/sprite-animation';

export const runtime = 'edge';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isOpenAIConfigured()) {
    return Response.json(
      {
        error:
          '暂时无法生成：照片生成人物服务尚未配置。你仍可使用两位默认搭子。',
        code: 'service_not_configured',
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: '无法读取上传的照片。' }, { status: 400 });
  }
  const image = form.get('image');
  if (!(image instanceof File))
    return Response.json({ error: '请选择一张人物照片。' }, { status: 400 });
  if (!image.type.startsWith('image/'))
    return Response.json({ error: '上传的文件不是图片。' }, { status: 415 });
  if (image.size === 0)
    return Response.json({ error: '照片文件为空。' }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES)
    return Response.json(
      { error: '照片超过 8MB，请压缩后再上传。' },
      { status: 413 },
    );

  try {
    const analysis = await analyzePerson(await imageDataUrl(image));
    if (
      analysis.personCount !== 1 ||
      !analysis.usable ||
      analysis.framing === 'none'
    ) {
      return Response.json(
        {
          error:
            analysis.personCount > 1
              ? '无法生成：照片里有多个人，请裁剪为单人照片。'
              : '无法生成：没有识别到清晰的人物或人头，请换一张照片。',
          code: 'person_not_detected',
        },
        { status: 422 },
      );
    }
    const preset = form.get('preset') === 'male' ? 'male' : 'female';
    if (form.get('mode') === 'portrait') {
      const imageUrl = await generatePixelAvatar(
        image,
        portraitGenerationPrompt(analysis, preset),
      );
      return Response.json({
        source: 'ai',
        imageUrl,
        rigVersion: 4,
        displayMode: 'static',
        photoMode: analysis.framing === 'full-body' ? 'full-body' : 'head-only',
      });
    }
    const referenceResponse = await fetch(
      new URL('/characters/' + preset + '-sprite-v3.png', request.url),
      { signal: AbortSignal.timeout(10000) },
    );
    if (!referenceResponse.ok) throw new Error('Pose reference unavailable');
    const reference = new File(
      [await referenceResponse.arrayBuffer()],
      'pose-reference.png',
      { type: 'image/png' },
    );
    const imageUrl = await generatePixelAvatar(
      image,
      spriteGenerationPrompt(analysis, preset),
      reference,
    );
    if (!(await validateSpriteSemantics(imageUrl)))
      return Response.json(
        {
          error:
            '无法生成：动作帧或人物外观未能保持一致，原人物已保留，请重试。',
          code: 'invalid_rig',
        },
        { status: 422 },
      );
    return Response.json({
      source: 'ai',
      imageUrl,
      rigVersion: 3,
      spriteManifest: SPRITE_MANIFEST,
      photoMode: analysis.framing === 'full-body' ? 'full-body' : 'head-only',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          '无法生成：' +
          aiServiceMessage(
            error,
            '人物生成服务未能完成请求或未返回可用图片，请稍后重试。',
          ) +
          ' 原人物未被替换。',
        code: 'generation_failed',
      },
      { status: 502 },
    );
  }
}
