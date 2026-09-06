'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  Minimize,
  Pause,
  Play,
  Settings,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { StudyProvider, useStudy } from './provider';
import { PixelCompanionCanvas } from '@/components/pixel-companion-canvas';
import { Characters } from './characters';
import { DailyActivities } from './daily';
import { Tools } from './tools';
import { ScheduleTool } from './schedule-tool';
import { GameAgenda, GameTools } from './game-panels';
import {
  parseNavigation,
  type Page,
  type Tool,
  type Subpage,
} from '@/lib/app-navigation';
import { SettingsPage } from './settings';
import { campusScheduleEvents } from '@/lib/campus-data';
import { eventsForDays } from '@/lib/calendar-layout';
import { getScheduleSnapshot } from '@/lib/schedule-engine';
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
import { needsGreeting } from '@/lib/companion-behavior';
import { useCompanionBehavior } from './use-companion-behavior';
import { SHOWCASE_URL } from '@/lib/showcase';
import { AnimationPreview } from './animation-preview';
import { InteractionGuide } from './interaction-guide';

export type { Page, Tool } from '@/lib/app-navigation';
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
  const { data, notice, notify, ready, recoveryVersion, showcase } = useStudy();
  const [page, setPage] = useState<Page>('home');
  const [tool, setTool] = useState<Subpage>();
  const [drawer, setDrawer] = useState(false);
  const returnTarget = useRef<{ page: Page; sub?: Subpage }>({ page: 'home' });
  useEffect(() => {
    if (page !== 'animation-preview' && page !== 'interaction-guide')
      returnTarget.current = { page, sub: tool };
  }, [page, tool]);
  const buddy = data.buddies.find((b) => b.id === data.activeBuddyId)!;
  useEffect(() => {
    const sync = () => {
      const next = parseNavigation(location.hash);
      setPage(next.page);
      setTool(next.sub);
      setDrawer(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (location.hash === '#tools/schedule')
        window.history.replaceState(null, '', '#daily/schedule');
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);
  const navigate = (next: Page, sub?: Subpage) => {
    setPage(next);
    setTool(sub);
    setDrawer(false);
    window.history.pushState(null, '', '#' + next + (sub ? '/' + sub : ''));
    window.scrollTo({ top: 0, behavior: 'instant' });
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
    <div className={'sbuddy-app' + (showcase ? ' showcase-app' : '')}>
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
          <span>SBuddy</span>
        </button>
        <span className="header-project-name">完蛋！我被学习搭子包围了</span>
        <nav className="header-resource-links" aria-label="展示与说明">
          <a
            className="header-animation-link"
            href="#animation-preview"
            aria-current={page === 'animation-preview' ? 'page' : undefined}
          >
            动画预览
          </a>
          <a
            className="header-animation-link"
            href="#interaction-guide"
            aria-current={page === 'interaction-guide' ? 'page' : undefined}
          >
            互动说明
          </a>
        </nav>
      </header>
      <aside className="desktop-nav">
        <nav aria-label="主导航">{nav}</nav>
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
        {!ready && page !== 'home' && (
          <div className="inline-message">
            正在读取本地数据；如读取失败，请前往设置恢复备份。
          </div>
        )}
        {data.demo && !showcase && page !== 'home' && (
          <div className="demo-banner">当前包含演示数据，可在设置中清空。</div>
        )}
        {page === 'home' && <Landing navigate={navigate} />}
        {page === 'animation-preview' && (
          <AnimationPreview
            onBack={() =>
              navigate(returnTarget.current.page, returnTarget.current.sub)
            }
          />
        )}
        {page === 'interaction-guide' && (
          <InteractionGuide
            onBack={() =>
              navigate(returnTarget.current.page, returnTarget.current.sub)
            }
          />
        )}
        {page === 'play' && (
          <Game
            key={buddy.id + recoveryVersion}
            buddy={buddy}
            navigate={navigate}
          />
        )}
        {page === 'characters' && <Characters />}
        <div hidden={page !== 'daily'} key={'daily-' + recoveryVersion}>
          <div hidden={tool === 'schedule'}>
            <DailyActivities
              onImport={() => navigate('daily', 'schedule')}
              onFocus={() => navigate('tools', 'focus')}
            />
          </div>
          <div hidden={tool !== 'schedule'}>
            <ScheduleTool onCalendar={() => navigate('daily')} />
          </div>
        </div>
        <div hidden={page !== 'tools'} key={'tools-' + recoveryVersion}>
          <Tools
            active={page === 'tools'}
            tool={tool === 'schedule' ? undefined : tool}
            onSelect={(next) => navigate('tools', next)}
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
  navigate,
}: {
  navigate: (page: Page, tool?: Tool) => void;
}) {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-project-name">SBuddy</div>
          <h1>
            完蛋！
            <br />
            我被学习搭子
            <br />
            <em>包围了</em>
          </h1>
          <div className="button-row">
            <a className="primary-button" href={SHOWCASE_URL}>
              开始体验
              <ArrowRight size={18} />
            </a>
          </div>
        </div>
        <div
          className="hero-scene showcase-hero-scene"
          aria-label="像素图书馆里的学习搭子"
        >
          <PixelCompanionCanvas
            state="study"
            appearance={{ preset: 'female' }}
            fullRoom
            scene
          />
        </div>
      </section>
      <section className="showcase-features" aria-label="项目亮点">
        <button onClick={() => navigate('characters')}>
          <Heart />
          <div>
            <h2>陪伴，有回应</h2>
            <p>两位搭子，独立记忆与成长。</p>
          </div>
          <ArrowRight size={18} />
        </button>
        <button onClick={() => navigate('daily')}>
          <CalendarDays />
          <div>
            <h2>计划，能行动</h2>
            <p>日程、待办与桌面活动相连。</p>
          </div>
          <ArrowRight size={18} />
        </button>
        <button onClick={() => navigate('tools')}>
          <BookOpen />
          <div>
            <h2>学习，有条理</h2>
            <p>课件、纪要和专注放在一起。</p>
          </div>
          <ArrowRight size={18} />
        </button>
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
  scene = true,
  children,
}: {
  buddy: Buddy;
  animation?: AnimationState;
  scene?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="buddy-stage">
      <PixelCompanionCanvas
        state={animation}
        avatarStyle={buddy.style}
        appearance={buddy.appearance}
        scene={scene}
      />
      <div className="stage-ground" />
      {children}
    </div>
  );
}
export function FocusControls({ minutes }: { minutes?: number } = {}) {
  const { data, startFocus, toggleFocus, finishFocus } = useStudy();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const focus = data.focus;
  const seconds =
    focus && focus.status !== 'complete'
      ? remainingSeconds(focus)
      : (minutes ?? data.settings.focusMinutes) * 60;
  return (
    <div className="mini-focus">
      <span className="timer-digits">
        {Math.floor(seconds / 60)
          .toString()
          .padStart(2, '0')}
        :{(seconds % 60).toString().padStart(2, '0')}
      </span>
      {!focus || focus.status === 'complete' ? (
        <button className="primary-button" onClick={() => startFocus(minutes)}>
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
  const { data, setData, notify, showcase } = useStudy();
  const [immersive, setImmersive] = useState(false);
  const [panel, setPanel] = useState<'focus' | 'notes'>();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const [opening, setOpening] = useState(false);
  const [dialogueStep, setDialogueStep] = useState<'line' | 'choices'>('line');
  const [conversation, setConversation] = useState<{
    buddyId: string;
    prompt: DialoguePrompt;
    response?: string;
  }>();
  const container = useRef<HTMLElement>(null);
  const dialogueRef = useRef<HTMLDivElement>(null);
  const currentId = useRef(buddy.id);
  useEffect(() => {
    currentId.current = buddy.id;
  }, [buddy.id]);
  const schedule = getScheduleSnapshot(
    [
      ...eventsForDays(data.events, [now]),
      ...campusScheduleEvents(data.campus),
    ],
    now,
  );
  const active = conversation?.buddyId === buddy.id ? conversation : undefined;
  const showingResponse = !!active?.response;
  useEffect(() => {
    dialogueRef.current
      ?.querySelector<HTMLButtonElement>(
        '.dialogue-line, .dialogue-choices button',
      )
      ?.focus({ preventScroll: true });
  }, [opening, dialogueStep, active?.prompt.id, showingResponse]);
  const behavior = useCompanionBehavior(
    buddy,
    schedule.todayEvents,
    modeToAnimation(schedule.mode),
    now,
    !!active && !active.response,
  );
  const closeDialogue = () => {
    behavior.touch();
    setOpening(false);
    setConversation(undefined);
    setDialogueStep('line');
  };
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
  const talk = useCallback(() => {
    behavior.touch();
    setOpening(false);
    setDialogueStep('line');
    const prompt =
      selectPrompt(buddy.relationship, 'demo', new Date(), false) ??
      dialoguePrompts.find(
        (p) =>
          !buddy.relationship.answeredPromptIds.includes(p.id) &&
          (!p.minimumLevel ||
            ['初识', '熟悉', '默契', '知心'].indexOf(
              buddy.relationship.bondLevel,
            ) >= ['初识', '熟悉', '默契', '知心'].indexOf(p.minimumLevel)),
      ) ??
      dialoguePrompts.find(
        (p) =>
          p.id !== buddy.relationship.dialogueHistory.at(-1)?.promptId &&
          !p.minimumLevel,
      );
    if (!prompt) {
      notify('我在这里，稍后再聊聊。');
      return;
    }
    setData((d) =>
      updateBuddy(d, buddy.id, (b) => ({
        ...b,
        relationship: markPromptShown(b.relationship, prompt, new Date()),
      })),
    );
    setConversation({ buddyId: buddy.id, prompt });
  }, [behavior, buddy, notify, setData]);
  const clickCharacter = useCallback(() => {
    if (behavior.travel || behavior.paused) return;
    const greet = needsGreeting(
      behavior.behavior.lastInteractionAt,
      Date.now(),
    );
    behavior.touch();
    if (active || opening) return;
    if (greet) {
      setOpening(true);
      setDialogueStep('line');
      behavior.greet();
    } else talk();
  }, [behavior, active, opening, talk]);
  return (
    <section
      ref={container}
      className={'game-room ' + (immersive ? 'immersive' : '')}
    >
      <PixelCompanionCanvas
        key={buddy.id}
        state={behavior.animation}
        actionToken={behavior.actionToken}
        activeActivity={behavior.activity}
        onActivityClick={(activity) => {
          if (behavior.travel) return;
          const targetPanel = activity === 'study' ? 'focus' : 'notes';
          if (
            behavior.behavior.mode === 'manual' &&
            behavior.behavior.activity === activity &&
            panel !== targetPanel
          ) {
            setPanel(targetPanel);
            return;
          }
          const completing =
            !behavior.paused &&
            behavior.behavior.mode === 'manual' &&
            behavior.behavior.activity === activity;
          behavior.selectActivity(activity);
          const keepFocus =
            activity === 'study' &&
            !!data.focus &&
            data.focus.status !== 'complete';
          setPanel(completing && !keepFocus ? undefined : targetPanel);
        }}
        onCharacterClick={clickCharacter}
        onTravelChange={behavior.setTravel}
        onActionComplete={behavior.finishShort}
        appearance={buddy.appearance}
        fullRoom
        room={data.settings.room ?? 'library'}
      />
      <div className="game-top">
        <div className="game-command">
          <fieldset className="instruction-switch" aria-label="人物指令">
            <button
              aria-pressed={behavior.behavior.mode === 'schedule'}
              disabled={behavior.travel || behavior.paused}
              onClick={() => {
                behavior.selectMode('schedule');
                setPanel(undefined);
              }}
            >
              按日程活动
            </button>
            <button
              aria-pressed={behavior.behavior.mode === 'manual'}
              disabled={behavior.travel || behavior.paused}
              onClick={() => {
                behavior.selectMode('manual');
                setPanel(undefined);
              }}
            >
              等你出发
            </button>
          </fieldset>
          <div
            className="bond-heart"
            aria-label={`默契值 ${buddy.relationship.bond}`}
            title={`默契值 ${buddy.relationship.bond}`}
          >
            <Heart aria-hidden="true" />
            <span
              style={{
                fontSize: `${Math.max(10, 24 - Math.max(0, String(buddy.relationship.bond).length - 2) * 2)}px`,
              }}
            >
              {buddy.relationship.bond}
            </span>
          </div>
        </div>
        <div className="game-status">
          <select
            aria-label="学习场景"
            value={data.settings.room ?? 'library'}
            onChange={(e) => {
              const room =
                e.target.value === 'classroom' ? 'classroom' : 'library';
              behavior.setTravel(true);
              setData((d) => ({ ...d, settings: { ...d.settings, room } }));
            }}
          >
            <option value="library">图书馆</option>
            <option value="classroom">教室</option>
          </select>
          <button
            className="immersion-toggle"
            onClick={() => void (immersive ? leave() : enter())}
          >
            {immersive ? <Minimize size={17} /> : <Maximize size={17} />}
            {immersive ? '退出纯享' : '纯享模式'}
          </button>
        </div>
      </div>
      <div className="game-layout">
        <GameAgenda events={schedule.todayEvents} navigate={navigate} />
        <div className="game-center" aria-hidden="true" />
        <GameTools panel={panel} onClose={() => setPanel(undefined)} />
      </div>
      {(opening || active) && (
        <div className="game-interaction" ref={dialogueRef}>
          <div
            className="dialogue-box dialogue-scene-page"
            aria-label="搭子对话"
            data-dialogue-step={active?.response ? 'response' : dialogueStep}
          >
            <div className="dialogue-heading">
              {(active || opening) && (
                <button
                  className="icon-button"
                  aria-label="收起对话"
                  onClick={closeDialogue}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {dialogueStep === 'line' || active?.response ? (
              <button
                className="dialogue-line"
                aria-label={active?.response ? '结束对话' : '继续对话'}
                aria-describedby="scene-dialogue-line"
                onClick={() => {
                  behavior.touch();
                  if (active?.response) closeDialogue();
                  else setDialogueStep('choices');
                }}
              >
                <span id="scene-dialogue-line" aria-live="polite">
                  {opening
                    ? 'Hello，想聊聊吗？'
                    : (active?.response ?? active?.prompt.text)}
                </span>
                <ChevronRight
                  className="dialogue-advance"
                  size={20}
                  aria-hidden="true"
                />
              </button>
            ) : opening ? (
              <div className="dialogue-choices">
                <button className="secondary-button" onClick={talk}>
                  聊聊
                </button>
                <button className="secondary-button" onClick={closeDialogue}>
                  先忙
                </button>
              </div>
            ) : active ? (
              <div className="dialogue-choices">
                {active.prompt.choices.map((choice) => (
                  <button
                    className="secondary-button"
                    key={choice.id}
                    onClick={() => {
                      behavior.touch();
                      setDialogueStep('line');
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
                      setConversation({
                        ...active,
                        response: choice.reaction,
                      });
                      playCompanionSound('select', data.settings.muted);
                      if (!showcase)
                        void fetch('/api/ai/dialogue', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            text: choice.reaction,
                            context: active.prompt.id,
                            buddyName: buddy.name,
                            personality: buddy.personality,
                            preferences: {
                              ...buddy.relationship.preferences,
                              ...(choice.preference
                                ? {
                                    [choice.preference.key]:
                                      choice.preference.value,
                                  }
                                : {}),
                            },
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
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
function Gallery({ buddy }: { buddy: Buddy }) {
  const [selected, setSelected] = useState<number>();
  return (
    <>
      <PageTitle title="鉴赏">
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
                    appearance={buddy.appearance}
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
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className={'app-dialog ' + className}
      aria-label={title}
      ref={ref}
      onCancel={onClose}
    >
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
