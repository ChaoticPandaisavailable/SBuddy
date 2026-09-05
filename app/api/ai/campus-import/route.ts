import { newCampusId, periodSpan, type CampusCourse, type CampusExam } from '@/lib/campus-data';
import { createStructuredResponse, isOpenAIConfigured } from '@/lib/openai-server';

export const runtime = 'edge';

const MAX_IMAGE_BYTES = 950 * 1024;

const campusImportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    semester: { type: 'string' },
    courses: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseName: { type: 'string' }, teacher: { type: 'string' }, location: { type: 'string' },
          weekday: { type: 'integer', minimum: 1, maximum: 7 },
          periods: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 14 } },
          weeks: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 30 } },
        },
        required: ['courseName', 'teacher', 'location', 'weekday', 'periods', 'weeks'],
      },
    },
    exams: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseName: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, location: { type: 'string' },
        },
        required: ['courseName', 'date', 'time', 'location'],
      },
    },
  },
  required: ['semester', 'courses', 'exams'],
};

type VisionResult = {
  semester: string;
  courses: Array<Omit<CampusCourse, 'id' | 'semester' | 'source' | 'startMinutes' | 'endMinutes'>>;
  exams: Array<Omit<CampusExam, 'id' | 'source'>>;
};

export async function POST(request: Request): Promise<Response> {
  if (!isOpenAIConfigured()) {
    return Response.json({ error: '截图识别需要先配置视觉模型；也可以直接粘贴表格或使用采集桥。' }, { status: 503 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: '无法读取上传内容。' }, { status: 400 });
  }
  const image = form.get('image');
  const target = form.get('target') === 'exams' ? 'exams' : 'courses';
  if (!(image instanceof File) || !image.type.startsWith('image/')) {
    return Response.json({ error: '请选择课表或考试页面截图。' }, { status: 400 });
  }
  if (!image.size || image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: '截图上传后需小于 950KB，请先裁掉浏览器边框。' }, { status: 413 });
  }

  try {
    const result = await createStructuredResponse<VisionResult>({
      name: 'ruc_campus_import',
      schema: campusImportSchema,
      purpose: 'vision',
      maxOutputTokens: 2600,
      instructions:
        '你是中国人民大学个人校园安排识别器。只读取截图里明确可见的个人课表或考试日程，不推断缺失课程，不处理或返回成绩。semester 统一为 YYYY-YYYY-1/2；weekday 以 1=周一、7=周日；periods 和 weeks 必须展开为整数数组；考试日期统一为 YYYY-MM-DD。截图不是目标页面或没有数据时返回空数组。',
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: target === 'courses' ? '识别这张个人课表截图，只返回课程表。' : '识别这张考试日程截图，只返回考试安排。' },
          { type: 'input_image', image_url: await fileToDataUrl(image), detail: 'high' },
        ],
      }],
    });
    const semester = result.semester.trim();
    const courses: CampusCourse[] = target === 'courses' ? result.courses.map((course) => {
      const [startMinutes, endMinutes] = periodSpan(course.periods);
      return {
        ...course, id: newCampusId('course'), semester,
        teacher: course.teacher || undefined, location: course.location || undefined,
        startMinutes, endMinutes, source: 'manual',
      };
    }) : [];
    const exams: CampusExam[] = target === 'exams' ? result.exams.map((exam) => ({
      ...exam, id: newCampusId('exam'), location: exam.location || undefined, source: 'manual',
    })) : [];
    return Response.json({ target, semester, courses, exams });
  } catch {
    return Response.json({ error: '截图识别失败，请换清晰完整截图，或改用网页采集桥。' }, { status: 502 });
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
