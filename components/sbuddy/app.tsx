'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Heart,
  Home,
  Images,
  Maximize,
  Menu,
  MessageCircle,
  Minimize,
  Pause,
  Play,
  Settings,
  Sparkles,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { StudyProvider, useStudy } from './provider';
import { PixelCompanionCanvas } from '@/components/pixel-companion-canvas';
import { Characters } from './characters';
import { DailyActivities } from './daily';
import { Tools } from './tools';
import { SettingsPage } from './settings';
import { campusScheduleEvents } from '@/lib/campus-data';
import { formatEventLine, getScheduleSnapshot } from '@/lib/schedule-engine';
import {
  modeToAnimation,
  type AnimationState,
} from '@/lib/companion-animation';
import {
  applyDialogueChoice,
  dialoguePrompts,
  markPromptShown,
  selectPrompt,
  type DialoguePrompt,
} from '@/lib/relationship';
import {
  remainingSeconds,
  rewards,
  updateBuddy,
  type Buddy,
} from '@/lib/sbuddy-state';
import { playCompanionSound } from '@/lib/companion-sound';

export type Page =
  | 'home'
  | 'play'
  | 'characters'
  | 'daily'
  | 'tools'
  | 'gallery'
  | 'settings';
export type Tool = 'schedule' | 'notes' | 'gesture' | 'focus' | undefined;
const navigation = [
  { id: 'home', label: '主页', icon: Home },
  { id: 'play', label: '开始游戏', icon: Play },
  { id: 'characters', label: '角色', icon: Users },
  { id: 'daily', label: '日常活动', icon: CalendarDays },
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'gallery', label: '鉴赏', icon: Images },
  { id: 'settings', label: '设置', icon: Settings },
] as const;
export function SBuddyApp() {
  return (
    <StudyProvider>
      <AppShell />
    </StudyProvider>
  );
}
function AppShell() {
  const { data, notice, notify, ready } = useStudy();
  const [page, setPage] = useState<Page>('home');
  const [tool, setTool] = useState<Tool>();
  const [drawer, setDrawer] = useState(false);
  const buddy = data.buddies.find((b) => b.id === data.activeBuddyId)!;
  useEffect(() => {
    const sync = () => {
      const [next, sub] = location.hash.slice(1).split('/');
      if (navigation.some((n) => n.id === next)) {
        setPage(next as Page);
        setTool(
          ['schedule', 'notes', 'gesture', 'focus'].includes(sub)
            ? (sub as Tool)
            : undefined,
        );
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  const navigate = (next: Page, sub?: Tool) => {
    setPage(next);
    setTool(sub);
    setDrawer(false);
    window.history.pushState(null, '', '#' + next + (sub ? '/' + sub : ''));
  };
  const menuRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (drawer) menuRef.current?.showModal();
    else menuRef.current?.close();
  }, [drawer]);
  const nav = (
    <>
      {navigation.map((item) => (
        <button
          key={item.id}
          className={'nav-item ' + (page === item.id ? 'active' : '')}
          aria-current={page === item.id ? 'page' : undefined}
          onClick={() => navigate(item.id)}
        >
          <item.icon size={19} />
          <span>{item.label}</span>
          {page === item.id && <span className="nav-dot" />}
        </button>
      ))}
    </>
  );
  return (
    <div className="sbuddy-app">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="brand-header">
        <button
          className="mobile-menu icon-button"
          aria-label="打开导航"
          onClick={() => setDrawer(true)}
        >
          <Menu />
        </button>
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-symbol">
            <BookOpen size={23} />
          </span>
          <span>
            SBuddy
            <span className="brand-caption">完蛋！我被学习搭子包围了</span>
          </span>
        </button>
        <div className="header-note">把学习的日常，过成我们的故事。</div>
        <button
          className="current-buddy"
          onClick={() => navigate('characters')}
        >
          <span className="online-dot" />
          {buddy.name}
          <ChevronRight size={15} />
        </button>
      </header>
      <aside className="desktop-nav">
        <nav aria-label="主导航">{nav}</nav>
        <div className="sidebar-bottom">
          <span className="small-leaf">
            <BookOpen size={22} />
          </span>
          <p>
            一起开始，
            <br />
            就已经很棒了。
          </p>
          <span>YOUR STUDY COMPANION</span>
        </div>
      </aside>
      <dialog
        ref={menuRef}
        className="nav-drawer"
        onCancel={() => setDrawer(false)}
      >
        <button
          className="icon-button"
          aria-label="关闭导航"
          onClick={() => setDrawer(false)}
        >
          <X />
        </button>
        <nav aria-label="移动端导航">{nav}</nav>
      </dialog>
      <main
        id="main-content"
        className={'main-content page-' + page}
        tabIndex={-1}
      >
        {!ready && (
          <div className="inline-message">
            正在读取本地数据；如读取失败，请前往设置恢复备份。
          </div>
        )}
        {data.demo && (
          <div className="demo-banner">当前包含演示数据，可在设置中清空。</div>
        )}
        {page === 'home' && <Landing buddy={buddy} navigate={navigate} />}
        {page === 'play' && <Game buddy={buddy} navigate={navigate} />}
        {page === 'characters' && <Characters />}
        {page === 'daily' && (
          <DailyActivities onImport={() => navigate('tools', 'schedule')} />
        )}
        <div hidden={page !== 'tools'}>
          <Tools
            active={page === 'tools'}
            tool={tool}
            onSelect={(next) => navigate('tools', next)}
            onCalendar={() => navigate('daily')}
          />
        </div>
        {page === 'gallery' && <Gallery buddy={buddy} />}
        {page === 'settings' && <SettingsPage />}
      </main>
      {notice && (
        <div className="notice" aria-live="polite">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => notify('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
function Landing({
  buddy,
  navigate,
}: {
  buddy: Buddy;
  navigate: (page: Page, tool?: Tool) => void;
}) {
  const { data } = useStudy();
  const today = getScheduleSnapshot(
    [...data.events, ...campusScheduleEvents(data.campus)],
    new Date(),
  );
  return (
    <div className="landing">
      <div className="landing-top">
        <span>欢迎来到你的小小学习宇宙</span>
        <span>
          {new Date().toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </span>
      </div>
      <section className="landing-hero">
        <div className="hero-copy">
          <h1>
            完蛋！
            <br />
            我被学习搭子
            <br />
            <em>包围了。</em>
          </h1>
          <p>
            课很多，计划很满，偶尔也不想开始。
            <br />
            没关系，找个搭子，陪你迈出今天的第一小步。
          </p>
          <button className="primary-button" onClick={() => navigate('play')}>
            和 {buddy.name} 开始今天
            <ArrowRight size={18} />
          </button>
          <button
            className="text-button"
            onClick={() => navigate('characters')}
          >
            先认识一下我的搭子们
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="hero-scene">
          <span className="scene-label">
            <span className="online-dot" />
            {buddy.name} 正在等你
          </span>
          <PixelCompanionCanvas
            state="greet"
            avatarStyle={buddy.style}
            className="hero-character"
          />
          <div className="character-caption">
            <span>「不用一下子做到最好。</span>
            <br />
            <strong>我们先一起开始，好吗？」</strong>
          </div>
          <span className="scene-footer">课间、图书馆、每一个想努力的瞬间</span>
        </div>
      </section>
      <section className="home-bottom">
        <div>
          <BookOpen size={24} />
          <div>
            <h2>今天，从一件小事开始</h2>
            <p>
              {today.todayEvents.length
                ? formatEventLine(
                    today.currentEvent ??
                      today.nextEvent ??
                      today.todayEvents[0],
                  )
                : '还没有安排。把第一件小事放进日历吧。'}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="查看日常活动"
            onClick={() => navigate('daily')}
          >
            <ArrowRight />
          </button>
        </div>
        <div>
          <Heart size={24} />
          <div>
            <h2>相处，会被好好记住</h2>
            <p>
              {buddy.name} · {buddy.relationship.bondLevel} · 默契{' '}
              {buddy.relationship.bond}/100
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="查看成长鉴赏"
            onClick={() => navigate('gallery')}
          >
            <ArrowRight />
          </button>
        </div>
      </section>
    </div>
  );
}
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function BuddyStage({
  buddy,
  animation = 'idle',
  children,
}: {
  buddy: Buddy;
  animation?: AnimationState;
  children?: ReactNode;
}) {
  return (
    <div className="buddy-stage">
      <PixelCompanionCanvas state={animation} avatarStyle={buddy.style} />
      <div className="stage-ground" />
      {children}
    </div>
  );
}
export function FocusControls() {
  const { data, startFocus, toggleFocus, finishFocus } = useStudy();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const focus = data.focus;
  const seconds = focus
    ? remainingSeconds(focus)
    : data.settings.focusMinutes * 60;
  return (
    <div className="mini-focus">
      <span className="timer-digits">
        {Math.floor(seconds / 60)
          .toString()
          .padStart(2, '0')}
        :{(seconds % 60).toString().padStart(2, '0')}
      </span>
      {!focus || focus.status === 'complete' ? (
        <button className="primary-button" onClick={() => startFocus()}>
          <Play size={16} />
          开始专注
        </button>
      ) : (
        <>
          <button className="secondary-button" onClick={toggleFocus}>
            {focus.status === 'running' ? (
              <Pause size={16} />
            ) : (
              <Play size={16} />
            )}
            {focus.status === 'running' ? '暂停' : '继续'}
          </button>
          <button className="text-button" onClick={finishFocus}>
            <Check size={16} />
            结束本轮
          </button>
        </>
      )}
    </div>
  );
}
function Game({
  buddy,
  navigate,
}: {
  buddy: Buddy;
  navigate: (page: Page, tool?: Tool) => void;
}) {
  const { data, setData, notify } = useStudy();
  const [immersive, setImmersive] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  const [manual, setManual] = useState<AnimationState>();
  const [conversation, setConversation] = useState<{
    buddyId: string;
    prompt: DialoguePrompt;
    response?: string;
  }>();
  const container = useRef<HTMLElement>(null);
  const currentId = useRef(buddy.id);
  useEffect(() => {
    currentId.current = buddy.id;
  }, [buddy.id]);
  const schedule = getScheduleSnapshot(
    [...data.events, ...campusScheduleEvents(data.campus)],
    now,
  );
  const active = conversation?.buddyId === buddy.id ? conversation : undefined;
  const animation = active?.response
    ? 'cheer'
    : active
      ? active.prompt.animation
      : (manual ??
        (data.focus?.status === 'running'
          ? 'study'
          : modeToAnimation(schedule.mode)));
  useEffect(() => {
    const exit = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void document.exitFullscreen?.().catch(() => {});
        setImmersive(false);
      }
    };
    document.addEventListener('fullscreenchange', exit);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('fullscreenchange', exit);
      document.removeEventListener('keydown', key);
    };
  }, []);
  const enter = async () => {
    setImmersive(true);
    try {
      await container.current?.requestFullscreen?.();
    } catch {
      /* CSS immersion remains usable. */
    }
  };
  const leave = async () => {
    try {
      await document.exitFullscreen?.();
    } catch {
      /* Already outside native fullscreen. */
    }
    setImmersive(false);
  };
  const talk = () => {
    const prompt =
      selectPrompt(buddy.relationship, 'demo', new Date(), false) ??
      dialoguePrompts.find(
        (p) =>
          !buddy.relationship.answeredPromptIds.includes(p.id) &&
          (!p.minimumLevel ||
            ['初识', '熟悉', '默契', '知心'].indexOf(
              buddy.relationship.bondLevel,
            ) >= ['初识', '熟悉', '默契', '知心'].indexOf(p.minimumLevel)),
      );
    if (!prompt) {
      notify('今天的话题都聊过啦。一起专注，还能积累新的默契。');
      return;
    }
    setData((d) =>
      updateBuddy(d, buddy.id, (b) => ({
        ...b,
        relationship: markPromptShown(b.relationship, prompt, new Date()),
      })),
    );
    setConversation({ buddyId: buddy.id, prompt });
  };
  return (
    <section
      ref={container}
      className={'game-room ' + (immersive ? 'immersive' : '')}
    >
      <div className="game-top">
        <div>
          <span className="soft-label">与 {buddy.name} 的默契</span>
          <div className="bond-value">
            <Heart size={20} />
            {buddy.relationship.bond}
            <small>/ 100 · {buddy.relationship.bondLevel}</small>
          </div>
          <progress
            value={buddy.relationship.bond}
            max={100}
            aria-label="默契值"
          />
        </div>
        <div className="game-status">
          <span className="online-dot" />
          {schedule.currentEvent?.title ?? '现在，是我们的时间'}
          <small>
            {schedule.currentEvent
              ? formatEventLine(schedule.currentEvent)
              : '慢慢来，今天也有我陪你。'}
          </small>
        </div>
      </div>
      <BuddyStage buddy={buddy} animation={animation}>
        <span className="stage-name">
          {buddy.name}
          <small>{buddy.personality}</small>
        </span>
      </BuddyStage>
      <div className="game-interaction">
        {active ? (
          <div className="dialogue-box">
            <strong>{buddy.name}</strong>
            <p>{active.response ?? active.prompt.text}</p>
            {active.response ? (
              <button
                className="primary-button"
                onClick={() => setConversation(undefined)}
              >
                记住啦
                <Check size={16} />
              </button>
            ) : (
              <div className="dialogue-choices">
                {active.prompt.choices.map((choice) => (
                  <button
                    className="secondary-button"
                    key={choice.id}
                    onClick={() => {
                      const id = buddy.id;
                      setData((d) =>
                        updateBuddy(d, id, (b) =>
                          b.relationship.answeredPromptIds.includes(
                            active.prompt.id,
                          )
                            ? b
                            : {
                                ...b,
                                relationship: applyDialogueChoice(
                                  b.relationship,
                                  active.prompt,
                                  choice,
                                  new Date(),
                                ).state,
                              },
                        ),
                      );
                      setConversation({ ...active, response: choice.reaction });
                      playCompanionSound('select', data.settings.muted);
                      void fetch('/api/ai/dialogue', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          text: choice.reaction,
                          context: active.prompt.id,
                          buddyName: buddy.name,
                          personality: buddy.personality,
                        }),
                      })
                        .then((r) => r.json() as Promise<{ text?: string }>)
                        .then((result) => {
                          if (
                            currentId.current === id &&
                            typeof result.text === 'string'
                          )
                            setConversation((c) =>
                              c?.buddyId === id &&
                              c.prompt.id === active.prompt.id
                                ? { ...c, response: result.text }
                                : c,
                            );
                        })
                        .catch(() => undefined);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="game-quote">
              “
              {buddy.personality === '理性规划'
                ? '把任务拆小，我们先完成第一项。'
                : buddy.personality === '活力陪伴'
                  ? '准备好了吗？一起出发，今天也会很棒！'
                  : '不着急。你愿意开始的这一刻，就已经很棒了。'}
              ”
            </div>
            <div className="button-row centered">
              <button className="primary-button" onClick={talk}>
                <MessageCircle size={18} />和 {buddy.name} 聊聊
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  setManual(manual === 'greet' ? undefined : 'greet')
                }
              >
                <Sparkles size={18} />
                打个招呼
              </button>
              <button
                className="text-button"
                onClick={() => navigate('tools', 'focus')}
              >
                一起专注
                <ArrowRight size={17} />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="game-footer">
        <span>一点一滴，都是我们的默契。</span>
        <button
          className="text-button"
          onClick={() => void (immersive ? leave() : enter())}
        >
          {immersive ? <Minimize size={18} /> : <Maximize size={18} />}
          {immersive ? '退出纯享 · Esc' : '纯享模式'}
        </button>
      </div>
    </section>
  );
}
function Gallery({ buddy }: { buddy: Buddy }) {
  const [selected, setSelected] = useState<number>();
  return (
    <>
      <PageTitle
        title="属于我们的收藏"
        description={'和 ' + buddy.name + ' 一起走过的每一步，都值得被记住。'}
      >
        <span className="pill">
          {
            rewards.filter((r) => buddy.relationship.unlocked.includes(r.id))
              .length
          }{' '}
          / 6 已解锁
        </span>
      </PageTitle>
      <div className="gallery-grid">
        {rewards.map((reward, i) => {
          const unlocked = buddy.relationship.unlocked.includes(reward.id);
          return (
            <button
              className={'gallery-item ' + (unlocked ? 'unlocked' : '')}
              key={reward.id}
              onClick={() => setSelected(i)}
            >
              <div className="gallery-art">
                {unlocked ? (
                  <PixelCompanionCanvas
                    state={reward.animation}
                    avatarStyle={buddy.style}
                    compact
                  />
                ) : (
                  <>
                    <span className="lock-shape">
                      <Heart size={25} />
                    </span>
                    <span>故事，还在慢慢发生</span>
                  </>
                )}
              </div>
              <div className="gallery-info">
                <strong>{reward.title}</strong>
                <span>
                  {unlocked ? '点击回看' : '默契 ' + reward.threshold + ' 解锁'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {selected !== undefined && (
        <Dialog
          title={rewards[selected].title}
          onClose={() => setSelected(undefined)}
        >
          {buddy.relationship.unlocked.includes(rewards[selected].id) ? (
            <>
              <BuddyStage
                buddy={buddy}
                animation={rewards[selected].animation}
              />
              <p className="gallery-line">“{rewards[selected].text}”</p>
            </>
          ) : (
            <p>
              与 {buddy.name} 的默契达到 {rewards[selected].threshold}{' '}
              后，就能解锁这段回忆。一起专注、认真回应对话，都会让彼此更熟悉。
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="app-dialog" ref={ref} onCancel={onClose}>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="关闭对话框"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
