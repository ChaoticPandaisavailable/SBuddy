import assert from 'node:assert/strict';
import { encode, decode } from 'fast-png';
const samplePng = Buffer.from(
  encode({
    width: 1,
    height: 1,
    data: new Uint8Array([0, 0, 0, 255]),
    channels: 4,
  }),
).toString('base64');
import { createServer } from 'vite';

const keys = [
  'AI_PROVIDER',
  'AIPING_API_KEY',
  'AIPING_BASE_URL',
  'AIPING_TEXT_MODEL',
  'AIPING_VISION_MODEL',
  'AIPING_IMAGE_MODEL',
  'TRANSCRIBE_PROVIDER',
  'MOSS_API_KEY',
  'MOSS_BASE_URL',
  'MOSS_TRANSCRIBE_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
];
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { '@': process.cwd() } },
});
let count = 0;
const check = async (name, fn) => {
  await fn();
  count++;
  console.log('PASS ' + name);
};
try {
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, {
    AI_PROVIDER: 'aiping',
    AIPING_API_KEY: 'fake-aiping-key',
    TRANSCRIBE_PROVIDER: 'moss',
    MOSS_API_KEY: 'fake-moss-key',
  });
  const api = await server.ssrLoadModule('/lib/openai-server.ts');
  const speech = await server.ssrLoadModule('/app/api/ai/transcribe/route.ts');
  const options = {
    name: 'test',
    instructions: 'Return JSON',
    input: '安排学习',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string', minLength: 1, maxLength: 10 } },
      required: ['text'],
    },
  };
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: '{"text":"一起学习"}' } },
      ],
    });
  };
  await check(
    'Aiping uses chat completions and its own server key',
    async () => {
      assert.deepEqual(await api.createStructuredResponse(options), {
        text: '一起学习',
      });
      assert.equal(captured.url, 'https://aiping.cn/api/v1/chat/completions');
      assert.equal(
        captured.init.headers.Authorization,
        'Bearer fake-aiping-key',
      );
      const body = JSON.parse(captured.init.body);
      assert.equal(body.model, 'Qwen3-Next-80B-A3B-Instruct');
      assert.equal(body.response_format.type, 'json_object');
      assert.match(body.messages[0].content, /"required"/);
      assert.ok(captured.init.signal);
      assert.equal(captured.init.redirect, 'manual');
    },
  );
  await check(
    'Vision transforms Responses image parts into Chat image_url objects',
    async () => {
      await api.createStructuredResponse({
        ...options,
        purpose: 'vision',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: '识别' },
              {
                type: 'input_image',
                image_url: 'data:image/png;base64,AA==',
                detail: 'high',
              },
            ],
          },
        ],
      });
      const body = JSON.parse(captured.init.body);
      assert.equal(body.model, 'Qwen3-VL-30B-A3B-Instruct');
      assert.deepEqual(body.messages[1].content, [
        { type: 'text', text: '识别' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,AA==', detail: 'high' },
        },
      ]);
    },
  );
  await check(
    'JSON mode rejects missing, wrong-type, oversized and extra fields',
    async () => {
      for (const value of [
        {},
        { text: 123 },
        { text: 'abcdefghijkl' },
        { text: '正常', unexpected: true },
        null,
      ]) {
        globalThis.fetch = async () =>
          Response.json({
            choices: [{ message: { content: JSON.stringify(value) } }],
          });
        await assert.rejects(api.createStructuredResponse(options), /schema/);
      }
      for (const content of ['not json', '{"text":']) {
        globalThis.fetch = async () =>
          Response.json({ choices: [{ message: { content } }] });
        await assert.rejects(api.createStructuredResponse(options));
      }
    },
  );
  await check(
    'Truncated completions are not accepted as successful structured results',
    async () => {
      globalThis.fetch = async () =>
        Response.json({
          choices: [
            {
              finish_reason: 'length',
              message: { content: '{"text":"正常"}' },
            },
          ],
        });
      await assert.rejects(api.createStructuredResponse(options), /truncated/);
    },
  );
  await check(
    'MOSS works without a text key and sends supported multipart parameters',
    async () => {
      delete process.env.AIPING_API_KEY;
      assert.equal(api.isOpenAIConfigured(), false);
      assert.equal(api.isTranscriptionConfigured(), true);
      globalThis.fetch = async (url, init) => {
        captured = { url, init };
        return Response.json({ text: ' 明天下午开会。 ' });
      };
      const form = new FormData();
      form.set(
        'audio',
        new File(['test-audio'], 'meeting.webm', { type: 'audio/webm' }),
      );
      const response = await speech.POST(
        new Request('https://local/api/ai/transcribe', {
          method: 'POST',
          body: form,
        }),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).transcript, '明天下午开会。');
      assert.equal(captured.url, 'https://api.mosi.cn/v1/audio/transcriptions');
      assert.equal(captured.init.headers.Authorization, 'Bearer fake-moss-key');
      assert.equal(captured.init.body.get('file').name, 'meeting.webm');
      assert.equal(captured.init.body.get('model'), 'moss-transcribe-1.0');
      assert.equal(captured.init.body.get('response_format'), 'json');
      assert.equal(captured.init.body.has('prompt'), false);
      assert.equal(captured.init.body.has('language'), false);
      process.env.AIPING_API_KEY = 'fake-aiping-key';
    },
  );
  await check(
    'MOSS missing configuration never silently borrows another service key',
    async () => {
      delete process.env.MOSS_API_KEY;
      process.env.OPENAI_API_KEY = 'fake-openai-key';
      assert.equal(api.isTranscriptionConfigured(), false);
      assert.equal(
        (await speech.POST(new Request('https://local'))).status,
        503,
      );
      process.env.MOSS_API_KEY = 'fake-moss-key';
    },
  );
  await check(
    'Authentication errors explain configuration without echoing upstream bodies',
    async () => {
      globalThis.fetch = async () =>
        Response.json(
          { error: { message: 'sensitive upstream payload fake-moss-key' } },
          { status: 401 },
        );
      const form = new FormData();
      form.set('audio', new File(['audio'], 'meeting.wav'));
      const response = await speech.POST(
        new Request('https://local', { method: 'POST', body: form }),
      );
      const text = await response.text();
      assert.equal(response.status, 502);
      assert.match(text, /密钥/);
      assert.doesNotMatch(text, /fake-|sensitive/);
    },
  );
  await check(
    'Empty speech output is rejected rather than reported as successful',
    async () => {
      globalThis.fetch = async () => Response.json({ text: '' });
      await assert.rejects(
        api.transcribeAudio(new File(['a'], 'a.wav')),
        /empty/,
      );
    },
  );
  await check(
    'Seedream uses JSON generations, two references and valid minimum dimensions',
    async () => {
      globalThis.fetch = async (url, init) => {
        captured = { url, init };
        return Response.json({ data: [{ b64_json: samplePng }] });
      };
      const image = await api.generatePixelAvatar(
        new File(['photo'], 'a.png', { type: 'image/png' }),
        '1536x2048 uniform 256x256 cells',
        new File(['pose'], 'pose.png', { type: 'image/png' }),
      );
      assert.equal(image, 'data:image/png;base64,' + samplePng);
      assert.equal(captured.url, 'https://aiping.cn/api/v1/images/generations');
      const body = JSON.parse(captured.init.body);
      assert.equal(body.model, 'Doubao-Seedream-5.0-lite');
      assert.equal(body.image.length, 2);
      assert.match(body.image[0], /^data:image\/png;base64,/);
      assert.equal(body.size, '1920x2560');
      assert.match(body.prompt, /320x320/);
      assert.equal(body.background, undefined);
      assert.equal(body.sequential_image_generation, 'disabled');
      assert.equal(body.extra_body.provider.enable_image_base64, true);
    },
  );
  await check(
    'URL-only image output is rejected without fetching untrusted locations',
    async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return Response.json({ data: [{ url: 'http://127.0.0.1/private' }] });
      };
      await assert.rejects(
        api.generatePixelAvatar(new File(['p'], 'p.png'), 'test'),
        /base64/,
      );
      assert.equal(calls, 1);
    },
  );
  await check(
    'Legacy OpenAI remains supported explicitly for existing installations',
    async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.TRANSCRIBE_PROVIDER = 'openai';
      globalThis.fetch = async (url, init) => {
        captured = { url, init };
        return Response.json({ output_text: '{"text":"旧接口"}' });
      };
      assert.deepEqual(await api.createStructuredResponse(options), {
        text: '旧接口',
      });
      assert.equal(captured.url, 'https://api.openai.com/v1/responses');
      assert.equal(
        captured.init.headers.Authorization,
        'Bearer fake-openai-key',
      );
      assert.equal(
        JSON.parse(captured.init.body).text.format.type,
        'json_schema',
      );
    },
  );
  await check(
    'Seedream matte conversion keeps white clothes and enclosed magenta details',
    async () => {
      const { removeSeedreamMatte } = await server.ssrLoadModule(
        '/lib/seedream-image.ts',
      );
      const pixels = new Uint8Array(7 * 7 * 4);
      for (let i = 0; i < 49; i++) pixels.set([255, 0, 255, 255], i * 4);
      for (let y = 1; y < 6; y++)
        for (let x = 1; x < 6; x++)
          pixels.set([255, 255, 255, 255], (y * 7 + x) * 4);
      pixels.set([255, 0, 255, 255], (3 * 7 + 3) * 4);
      const url =
        'data:image/png;base64,' +
        Buffer.from(
          encode({ width: 7, height: 7, data: pixels, channels: 4 }),
        ).toString('base64');
      const out = decode(
        Buffer.from(removeSeedreamMatte(url).split(',')[1], 'base64'),
      );
      assert.equal(out.data[3], 0);
      assert.deepEqual(
        Array.from(out.data.slice((1 * 7 + 1) * 4, (1 * 7 + 1) * 4 + 4)),
        [255, 255, 255, 255],
      );
      assert.equal(out.data[(3 * 7 + 3) * 4 + 3], 255);
      assert.throws(
        () => removeSeedreamMatte('data:image/png;base64,bm90cG5n'),
        /Invalid/,
      );
    },
  );
  console.log(count + ' provider checks passed.');
} finally {
  globalThis.fetch = originalFetch;
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await server.close();
}
