'use client';

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ExternalLink,
  FileUp,
  GraduationCap,
  ListChecks,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  campusScheduleEvents,
  dateKey,
  mergeCampusCapture,
  newCampusId,
  periodSpan,
  removeCampusItem,
  upsertCourse,
  upsertExam,
  upsertTodo,
  type CampusCourse,
  type CampusDataState,
  type CampusExam,
  type CampusTodo,
} from '@/lib/campus-data';
import {
  bridgeCollectorScript,
  isCampusCaptureMessage,
  parseCampusImport,
  RUC_CAMPUS_ROUTES,
  type CampusImportTarget,
  type CampusParseResult,
} from '@/lib/campus-parser';
import { validDate } from '@/lib/sbuddy-state';
import type { ScheduleEvent } from '@/lib/schedule-parser';

type Props = {
  events: ScheduleEvent[];
  campusData: CampusDataState;
  onChange: (state: CampusDataState) => void;
  onAiImport: () => void;
};

const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function CampusCalendarWorkspace({
  events,
  campusData,
  onChange,
  onAiImport,
}: Props) {
  const [tab, setTab] = useState('calendar');
  const combinedEvents = useMemo(
    () => [...events, ...campusScheduleEvents(campusData)],
    [campusData, events],
  );

  return (
    <>
      <div>
        <p className="text-xs font-black tracking-[.18em] text-primary">
          NILU CAMPUS CALENDAR
        </p>
        <h1 className="mt-1 font-heading text-2xl font-black tracking-tight sm:text-3xl">
          校园安排，自动进入搭子的生活
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          日历、待办、个人课表和考试共用一份本地数据。课程和考试会直接驱动上课、自习与提醒状态；不读取成绩单。
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="campus-tabs">
        <TabsList className="campus-tabs-list" aria-label="校园日历功能">
          <TabsTrigger value="calendar">
            <CalendarDays />
            日历
          </TabsTrigger>
          <TabsTrigger value="courses">
            <GraduationCap />
            课程表
          </TabsTrigger>
          <TabsTrigger value="todos">
            <ListChecks />
            待办
          </TabsTrigger>
          <TabsTrigger value="exams">
            <Clipboard />
            考试
          </TabsTrigger>
          <TabsTrigger value="sync">
            <RefreshCw />
            同步
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <MonthCalendar events={combinedEvents} onAiImport={onAiImport} />
        </TabsContent>
        <TabsContent value="courses">
          <CoursesPanel
            data={campusData}
            onChange={onChange}
            onSync={() => setTab('sync')}
          />
        </TabsContent>
        <TabsContent value="todos">
          <TodosPanel data={campusData} onChange={onChange} />
        </TabsContent>
        <TabsContent value="exams">
          <ExamsPanel
            data={campusData}
            onChange={onChange}
            onSync={() => setTab('sync')}
          />
        </TabsContent>
        <TabsContent value="sync">
          <CampusSyncPanel data={campusData} onChange={onChange} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function MonthCalendar({
  events,
  onAiImport,
}: {
  events: ScheduleEvent[];
  onAiImport: () => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const today = dateKey(new Date());
  const cells = monthCells(month);
  const eventsByDate = events.reduce<Record<string, ScheduleEvent[]>>(
    (result, event) => {
      const key = event.date ?? `2026-09-${String(event.day).padStart(2, '0')}`;
      result[key] = [...(result[key] ?? []), event].sort((left, right) =>
        left.time.localeCompare(right.time),
      );
      return result;
    },
    {},
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="font-black">
              {month.getFullYear()} 年 {month.getMonth() + 1} 月
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              课程、考试、待办和 AI 日程已合并显示
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="上个月"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setMonth(
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                )
              }
            >
              今天
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="下个月"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight />
            </Button>
            <Button size="sm" onClick={onAiImport}>
              <Plus />
              AI 添加
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="calendar-grid calendar-head">
          {weekdayLabels.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((date, index) => {
            const key = date ? dateKey(date) : `empty-${index}`;
            return (
              <div
                key={key}
                className="calendar-day"
                data-today={date ? key === today : false}
                data-empty={!date}
              >
                {date && (
                  <>
                    <span className="day-number">{date.getDate()}</span>
                    <div className="mt-2 space-y-1">
                      {eventsByDate[key]?.slice(0, 4).map((event) => (
                        <div
                          key={event.id}
                          className="calendar-event"
                          data-kind={event.kind}
                          data-source={event.source}
                          title={`${event.time} ${event.title}`}
                        >
                          <span>{event.time}</span> {event.title}
                        </div>
                      ))}
                      {(eventsByDate[key]?.length ?? 0) > 4 && (
                        <p className="text-[9px] font-bold text-muted-foreground">
                          还有 {(eventsByDate[key]?.length ?? 0) - 4} 项
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function CoursesPanel({
  data,
  onChange,
  onSync,
}: {
  data: CampusDataState;
  onChange: Props['onChange'];
  onSync: () => void;
}) {
  const [form, setForm] = useState({
    courseName: '',
    teacher: '',
    location: '',
    weekday: '1',
    periods: '1-2',
    weeks: '1-16',
  });
  const sorted = [...data.courses].sort(
    (a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes,
  );

  const add = () => {
    if (!form.courseName.trim()) return;
    if (
      !numberRange(form.periods, 14).length ||
      !numberRange(form.weeks, 30).length
    ) {
      window.alert('请填写有效的节次和周次。');
      return;
    }
    const periods = numberRange(form.periods, 14);
    const weeks = numberRange(form.weeks, 30);
    const [startMinutes, endMinutes] = periodSpan(periods);
    const course: CampusCourse = {
      id: newCampusId('course'),
      semester: data.activeSemester,
      courseName: form.courseName.trim(),
      teacher: form.teacher.trim() || undefined,
      location: form.location.trim() || undefined,
      weekday: Number(form.weekday),
      periods,
      weeks,
      startMinutes,
      endMinutes,
      source: 'manual',
    };
    onChange(upsertCourse(data, course));
    setForm((current) => ({
      ...current,
      courseName: '',
      teacher: '',
      location: '',
    }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="font-black">个人课程表</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.activeSemester} · 第 1 周周一 {data.semesterStart}
              </p>
            </div>
            <Button size="sm" onClick={onSync}>
              <RefreshCw />
              同步
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length ? (
            <div className="campus-list">
              {sorted.map((course) => (
                <div className="campus-row" key={course.id}>
                  <div className="campus-date-tile">
                    <strong>{weekdayLabels[course.weekday - 1]}</strong>
                    <span>
                      {course.periods.length
                        ? `${course.periods[0]}-${course.periods.at(-1)}节`
                        : '时间待定'}
                    </span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{course.courseName}</strong>
                      <SourceBadge source={course.source} />
                    </div>
                    <p>
                      {[
                        course.teacher,
                        course.location,
                        course.weeks.length
                          ? `${course.weeks[0]}-${course.weeks.at(-1)}周`
                          : '每周',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除${course.courseName}`}
                    onClick={() =>
                      onChange(removeCampusItem(data, 'course', course.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyCampus
              title="还没有个人课表"
              note="使用同步采集，或在右侧手动添加。"
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-black">手动添加课程</CardTitle>
        </CardHeader>
        <CardContent className="campus-form">
          <Input
            placeholder="课程名称"
            value={form.courseName}
            onChange={(event) =>
              setForm({ ...form, courseName: event.target.value })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="教师"
              value={form.teacher}
              onChange={(event) =>
                setForm({ ...form, teacher: event.target.value })
              }
            />
            <Input
              placeholder="地点"
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
            />
          </div>
          <label htmlFor="course-weekday">
            星期
            <select
              id="course-weekday"
              value={form.weekday}
              onChange={(event) =>
                setForm({ ...form, weekday: event.target.value })
              }
            >
              {weekdayLabels.map((label, index) => (
                <option value={index + 1} key={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor="course-periods">
              节次
              <Input
                id="course-periods"
                value={form.periods}
                onChange={(event) =>
                  setForm({ ...form, periods: event.target.value })
                }
                placeholder="1-2"
              />
            </label>
            <label htmlFor="course-weeks">
              周次
              <Input
                id="course-weeks"
                value={form.weeks}
                onChange={(event) =>
                  setForm({ ...form, weeks: event.target.value })
                }
                placeholder="1-16"
              />
            </label>
          </div>
          <Button className="w-full" onClick={add}>
            <Plus />
            加入课程表
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function TodosPanel({
  data,
  onChange,
}: {
  data: CampusDataState;
  onChange: Props['onChange'];
}) {
  const [form, setForm] = useState({ title: '', location: '', dueAt: '' });
  const todos = [...data.todos].sort(
    (a, b) =>
      Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
      (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'),
  );

  const add = () => {
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    const todo: CampusTodo = {
      id: newCampusId('todo'),
      title: form.title.trim(),
      location: form.location.trim() || undefined,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
      reminderTimes: form.dueAt ? [new Date(form.dueAt).toISOString()] : [],
      createdAt: now,
      updatedAt: now,
    };
    onChange(upsertTodo(data, todo));
    setForm({ title: '', location: '', dueAt: '' });
  };

  const toggle = (todo: CampusTodo) =>
    onChange(
      upsertTodo(data, {
        ...todo,
        completedAt: todo.completedAt ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-black">待办清单</CardTitle>
        </CardHeader>
        <CardContent>
          {todos.length ? (
            <div className="campus-list">
              {todos.map((todo) => (
                <div
                  className="campus-row"
                  key={todo.id}
                  data-completed={Boolean(todo.completedAt)}
                >
                  <button
                    type="button"
                    className="todo-check"
                    aria-label={todo.completedAt ? '恢复待办' : '完成待办'}
                    onClick={() => toggle(todo)}
                  >
                    {todo.completedAt && <Check />}
                  </button>
                  <div>
                    <strong>{todo.title}</strong>
                    <p>
                      {[
                        todo.dueAt
                          ? formatDateTime(todo.dueAt)
                          : '未设置截止时间',
                        todo.location,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除${todo.title}`}
                    onClick={() =>
                      onChange(removeCampusItem(data, 'todo', todo.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyCampus
              title="还没有待办"
              note="把论文、作业或准备事项放进来，截止时间会同步到日历。"
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-black">新建待办</CardTitle>
        </CardHeader>
        <CardContent className="campus-form">
          <Input
            placeholder="待办标题"
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />
          <Input
            placeholder="地点（可选）"
            value={form.location}
            onChange={(event) =>
              setForm({ ...form, location: event.target.value })
            }
          />
          <label htmlFor="todo-due-at">
            截止时间
            <Input
              id="todo-due-at"
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) =>
                setForm({ ...form, dueAt: event.target.value })
              }
            />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            首版提醒时间与截止时间一致，数据仅保存在当前浏览器。
          </p>
          <Button className="w-full" onClick={add}>
            <Plus />
            添加待办
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ExamsPanel({
  data,
  onChange,
  onSync,
}: {
  data: CampusDataState;
  onChange: Props['onChange'];
  onSync: () => void;
}) {
  const [form, setForm] = useState({
    courseName: '',
    date: '',
    time: '',
    location: '',
  });
  const exams = [...data.exams].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
  );
  const add = () => {
    if (!form.courseName.trim() || !validDate(form.date)) {
      window.alert('请填写课程名称和有效考试日期。');
      return;
    }
    const exam: CampusExam = {
      id: newCampusId('exam'),
      courseName: form.courseName.trim(),
      date: form.date,
      time: form.time,
      location: form.location.trim() || undefined,
      source: 'manual',
    };
    onChange(upsertExam(data, exam));
    setForm({ courseName: '', date: '', time: '', location: '' });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-black">考试安排</CardTitle>
            <Button size="sm" onClick={onSync}>
              <RefreshCw />
              同步
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {exams.length ? (
            <div className="campus-list">
              {exams.map((exam) => (
                <div className="campus-row" key={exam.id}>
                  <div className="campus-date-tile">
                    <strong>{exam.date.slice(5).replace('-', '/')}</strong>
                    <span>{exam.time || '时间待定'}</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{exam.courseName}</strong>
                      <SourceBadge source={exam.source} />
                    </div>
                    <p>{exam.location || '考场待定'}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除${exam.courseName}考试`}
                    onClick={() =>
                      onChange(removeCampusItem(data, 'exam', exam.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyCampus
              title="还没有考试安排"
              note="同步或手动添加后，考试会进入日历和搭子的备考提醒。"
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-black">手动添加考试</CardTitle>
        </CardHeader>
        <CardContent className="campus-form">
          <Input
            placeholder="课程名称"
            value={form.courseName}
            onChange={(event) =>
              setForm({ ...form, courseName: event.target.value })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor="exam-date">
              日期
              <Input
                id="exam-date"
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </label>
            <label htmlFor="exam-time">
              时间
              <Input
                id="exam-time"
                placeholder="09:00-11:00"
                value={form.time}
                onChange={(event) =>
                  setForm({ ...form, time: event.target.value })
                }
              />
            </label>
          </div>
          <Input
            placeholder="考场（可选）"
            value={form.location}
            onChange={(event) =>
              setForm({ ...form, location: event.target.value })
            }
          />
          <Button className="w-full" onClick={add}>
            <Plus />
            添加考试
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function CampusSyncPanel({
  data,
  onChange,
}: {
  data: CampusDataState;
  onChange: Props['onChange'];
}) {
  const [target, setTarget] = useState<CampusImportTarget>('courses');
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<CampusParseResult>();
  const [status, setStatus] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== 'https://jw.ruc.edu.cn' ||
        !isCampusCaptureMessage(event.data)
      )
        return;
      const result = parseCampusImport(
        JSON.stringify(event.data),
        event.data.target ?? target,
        'shuzhi',
      );
      setTarget(result.target);
      setPreview(result);
      setStatus(
        result.warning ??
          `已自动采集 ${result.courses.length || result.exams.length} 条，确认后写入。`,
      );
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [target]);

  const parse = (source: 'manual' | 'shuzhi' = 'manual') => {
    if (!raw.trim()) return;
    const result = parseCampusImport(raw, target, source);
    setPreview(result);
    setStatus(
      result.warning ??
        `识别到 ${result.courses.length || result.exams.length} 条数据。`,
    );
  };

  const commit = () => {
    if (!preview || (!preview.courses.length && !preview.exams.length)) return;
    if (
      preview.courses.some(
        (c) => !c.courseName.trim() || !c.periods.length || !c.weeks.length,
      ) ||
      preview.exams.some((e) => !e.courseName.trim() || !validDate(e.date))
    ) {
      setStatus('请补全课程名称、周次节次或有效考试日期。');
      return;
    }
    onChange(mergeCampusCapture(data, preview));
    setStatus(
      `已写入 ${preview.courses.length ? `${preview.courses.length} 门课程` : `${preview.exams.length} 场考试`}，日历和人物状态已同步。`,
    );
    setPreview(undefined);
    setRaw('');
  };

  const copyBridge = async () => {
    try {
      await navigator.clipboard.writeText(
        bridgeCollectorScript(window.location.origin),
      );
    } catch {
      setStatus('剪贴板权限不可用，请使用手动文件或文本导入。');
      return;
    }
    setStatus('采集桥脚本已复制。第一次按下方说明保存为浏览器书签。');
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.type.startsWith('image/')) {
      setImageBusy(true);
      setStatus('正在识别截图…');
      try {
        const form = new FormData();
        const screenshot = await compactScreenshot(file);
        form.set('image', screenshot, 'campus-screenshot.jpg');
        form.set('target', target);
        const response = await fetch('/api/ai/campus-import', {
          method: 'POST',
          body: form,
        });
        const result = (await response.json()) as CampusParseResult & {
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || '截图识别失败');
        setPreview(result);
        setStatus(
          `截图识别到 ${result.courses.length || result.exams.length} 条数据。`,
        );
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : '截图识别失败，请改用网页采集桥或粘贴文本。',
        );
      } finally {
        setImageBusy(false);
      }
      return;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      setStatus('无法读取文件，请重新选择。');
      return;
    }
    setRaw(text);
    const result = parseCampusImport(text, target, 'manual');
    setPreview(result);
    setStatus(
      result.warning ??
        `文件中识别到 ${result.courses.length || result.exams.length} 条数据。`,
    );
  };

  return (
    <div className="space-y-4">
      <Card className="campus-sync-card">
        <CardHeader>
          <CardTitle className="font-black">数智人大自动采集桥</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="campus-security-note">
            <strong>账号密码不会交给本站</strong>
            <span>
              你在人大官方页面登录；采集桥只读取当前可见的课表或考试表格，再传回这个浏览器页面。
            </span>
          </div>
          <div className="campus-sync-steps">
            <div>
              <span>1</span>
              <p>
                <strong>安装一次采集桥</strong>
                点击复制，把内容新建为浏览器书签的网址。
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyBridge()}
              >
                <Clipboard />
                复制采集桥
              </Button>
            </div>
            <div>
              <span>2</span>
              <p>
                <strong>打开人大官方页面</strong>
                登录后停在目标页面，再点击刚保存的书签。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTarget('courses');
                    window.open(RUC_CAMPUS_ROUTES.courses, 'nilu-campus-sync');
                  }}
                >
                  <ExternalLink />
                  打开课表
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTarget('exams');
                    window.open(RUC_CAMPUS_ROUTES.exams, 'nilu-campus-sync');
                  }}
                >
                  <ExternalLink />
                  打开考试
                </Button>
              </div>
            </div>
            <div>
              <span>3</span>
              <p>
                <strong>回到这里确认</strong>
                数据先预览，只有你确认后才替换同来源数据。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-black">手动导入</CardTitle>
          </CardHeader>
          <CardContent className="campus-form">
            <div className="campus-target-switch">
              <button
                type="button"
                data-active={target === 'courses'}
                onClick={() => {
                  setTarget('courses');
                  setPreview(undefined);
                }}
              >
                课程表
              </button>
              <button
                type="button"
                data-active={target === 'exams'}
                onClick={() => {
                  setTarget('exams');
                  setPreview(undefined);
                }}
              >
                考试安排
              </button>
            </div>
            <Textarea
              className="min-h-44"
              placeholder="粘贴教务页面表格、复制出的采集 JSON，或 CSV/制表符文本…"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
            />
            <input
              ref={fileInput}
              type="file"
              accept=".html,.htm,.txt,.json,.csv,image/*"
              className="hidden"
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={imageBusy}
              >
                <FileUp />
                {imageBusy ? '识别中…' : '选择文件或截图'}
              </Button>
              <Button onClick={() => parse('manual')} disabled={!raw.trim()}>
                <RefreshCw />
                解析预览
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              支持 HTML、TXT、JSON、CSV
              和清晰截图；截图需要配置视觉模型。成绩表即使混在页面里也不会导入。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-black">导入预览</CardTitle>
          </CardHeader>
          <CardContent>
            {preview && (preview.courses.length || preview.exams.length) ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                  {preview.courses.length
                    ? `${preview.courses.length} 门课程`
                    : `${preview.exams.length} 场考试`}
                  {preview.semester ? ` · ${preview.semester}` : ''}
                </div>
                <div className="campus-preview-list">
                  {preview.courses.map((course, index) => (
                    <div key={course.id}>
                      <label>
                        课程名称
                        <input
                          className="preview-input"
                          value={course.courseName}
                          onChange={(event) =>
                            setPreview({
                              ...preview,
                              courses: preview.courses.map((c, i) =>
                                i === index
                                  ? { ...c, courseName: event.target.value }
                                  : c,
                              ),
                            })
                          }
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label>
                          星期
                          <select
                            value={course.weekday}
                            onChange={(event) =>
                              setPreview({
                                ...preview,
                                courses: preview.courses.map((c, i) =>
                                  i === index
                                    ? {
                                        ...c,
                                        weekday: Number(event.target.value),
                                      }
                                    : c,
                                ),
                              })
                            }
                          >
                            {weekdayLabels.map((label, i) => (
                              <option key={label} value={i + 1}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          地点
                          <input
                            className="preview-input"
                            value={course.location ?? ''}
                            onChange={(event) =>
                              setPreview({
                                ...preview,
                                courses: preview.courses.map((c, i) =>
                                  i === index
                                    ? { ...c, location: event.target.value }
                                    : c,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        节次（逗号分隔）
                        <input
                          className="preview-input"
                          defaultValue={course.periods.join(',')}
                          onBlur={(event) => {
                            const periods = numberRange(event.target.value, 14);
                            const [startMinutes, endMinutes] =
                              periodSpan(periods);
                            setPreview({
                              ...preview,
                              courses: preview.courses.map((c, i) =>
                                i === index
                                  ? { ...c, periods, startMinutes, endMinutes }
                                  : c,
                              ),
                            });
                          }}
                        />
                      </label>
                      <label>
                        周次（逗号或范围）
                        <input
                          className="preview-input"
                          defaultValue={course.weeks.join(',')}
                          onBlur={(event) =>
                            setPreview({
                              ...preview,
                              courses: preview.courses.map((c, i) =>
                                i === index
                                  ? {
                                      ...c,
                                      weeks: numberRange(
                                        event.target.value,
                                        30,
                                      ),
                                    }
                                  : c,
                              ),
                            })
                          }
                        />
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setPreview({
                            ...preview,
                            courses: preview.courses.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        移除此课程
                      </Button>
                    </div>
                  ))}
                  {preview.exams.map((exam, index) => (
                    <div key={exam.id}>
                      <label>
                        课程名称
                        <input
                          className="preview-input"
                          value={exam.courseName}
                          onChange={(event) =>
                            setPreview({
                              ...preview,
                              exams: preview.exams.map((e, i) =>
                                i === index
                                  ? { ...e, courseName: event.target.value }
                                  : e,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        考试日期
                        <input
                          className="preview-input"
                          type="date"
                          value={exam.date}
                          onChange={(event) =>
                            setPreview({
                              ...preview,
                              exams: preview.exams.map((e, i) =>
                                i === index
                                  ? { ...e, date: event.target.value }
                                  : e,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        时间
                        <input
                          className="preview-input"
                          value={exam.time}
                          placeholder="09:00-11:00"
                          onChange={(event) =>
                            setPreview({
                              ...preview,
                              exams: preview.exams.map((e, i) =>
                                i === index
                                  ? { ...e, time: event.target.value }
                                  : e,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        考场
                        <input
                          className="preview-input"
                          value={exam.location ?? ''}
                          onChange={(event) =>
                            setPreview({
                              ...preview,
                              exams: preview.exams.map((e, i) =>
                                i === index
                                  ? { ...e, location: event.target.value }
                                  : e,
                              ),
                            })
                          }
                        />
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setPreview({
                            ...preview,
                            exams: preview.exams.filter((_, i) => i !== index),
                          })
                        }
                      >
                        移除此考试
                      </Button>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={commit}>
                  <Check />
                  确认写入并同步
                </Button>
              </div>
            ) : (
              <EmptyCampus
                title="等待采集结果"
                note="自动采集和手动解析都会先显示在这里。"
              />
            )}
            {status && (
              <p className="mt-3 rounded-xl bg-muted p-3 text-xs leading-5">
                {status}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border p-3">
                <strong className="block text-lg">{data.courses.length}</strong>
                课程
              </div>
              <div className="rounded-xl border p-3">
                <strong className="block text-lg">{data.exams.length}</strong>
                考试
              </div>
            </div>
            <label
              htmlFor="semester-start"
              className="mt-4 block text-xs font-bold"
            >
              第 1 周周一
              <Input
                id="semester-start"
                className="mt-1"
                type="date"
                value={data.semesterStart}
                onChange={(event) =>
                  validDate(event.target.value) &&
                  onChange({ ...data, semesterStart: event.target.value })
                }
              />
            </label>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: 'shuzhi' | 'manual' }) {
  return (
    <Badge variant="secondary">
      {source === 'shuzhi' ? '数智人大' : '手动'}
    </Badge>
  );
}

function EmptyCampus({ title, note }: { title: string; note: string }) {
  return (
    <div className="campus-empty">
      <CalendarDays />
      <strong>{title}</strong>
      <p>{note}</p>
    </div>
  );
}

function monthCells(month: Date): Array<Date | null> {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => new Date(year, monthIndex, index + 1),
    ),
  ];
  while (cells.length % 7) cells.push(null);
  return cells;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function numberRange(value: string, maximum: number): number[] {
  const result = new Set<number>();
  for (const token of value.split(/[,，、\s]+/)) {
    const range = token.match(/(\d+)\s*[-–—至到]\s*(\d+)/);
    if (range) {
      for (
        let current = Number(range[1]);
        current <= Number(range[2]) && current <= maximum;
        current += 1
      )
        result.add(current);
    } else {
      const current = Number(token);
      if (current >= 1 && current <= maximum) result.add(current);
    }
  }
  return [...result].sort((a, b) => a - b);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待定';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function compactScreenshot(file: File): Promise<Blob> {
  if (file.size <= 850 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理截图。');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!blob) throw new Error('截图压缩失败。');
  if (blob.size <= 950 * 1024) return blob;
  const smaller = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.62),
  );
  if (!smaller || smaller.size > 950 * 1024)
    throw new Error('截图仍然过大，请先裁掉浏览器边框后重试。');
  return smaller;
}
