'use client';
import { useStudy } from './provider';
import { campusScheduleEvents } from '@/lib/campus-data';
import { studyInsight } from '@/lib/study-insight';

export function StudySummary({ onStart }: { onStart?: () => void }) {
  const { data, setData } = useStudy();
  const insight = studyInsight(data, [
    ...data.events,
    ...campusScheduleEvents(data.campus),
  ]);
  return (
    <section
      className="paper-panel study-summary"
      aria-label={onStart ? '今日学习状态' : '近期学习统计'}
    >
      <h2>{onStart ? '今日状态' : '近 7 天'}</h2>
      <div className="study-metrics">
        {onStart ? (
          <>
            <div>
              <span>日程压力</span>
              <strong>{insight.pressure}</strong>
              <small>
                {insight.count} 项安排 · {insight.scheduledMinutes} 分钟
              </small>
            </div>
            <div>
              <span>最近记录的精力</span>
              <strong>{insight.energyLabel}</strong>
              <small>
                {data.studyProfile?.updatedAt
                  ? new Date(data.studyProfile.updatedAt).toLocaleString(
                      'zh-CN',
                    )
                  : ''}
              </small>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>专注时长</span>
              <strong>{insight.recentMinutes} 分钟</strong>
            </div>
            <div>
              <span>完成专注</span>
              <strong>{insight.recentCount} 次</strong>
            </div>
            <div>
              <span>有记录的天数</span>
              <strong>{insight.recentDays} 天</strong>
            </div>
            <div>
              <span>当前连续专注</span>
              <strong>{insight.streak} 天</strong>
            </div>
          </>
        )}
      </div>
      {onStart ? (
        <>
          <div className="button-row" aria-label="记录精力">
            {[
              { label: '有些疲惫', energy: 1 },
              { label: '状态平稳', energy: 3 },
              { label: '精力充足', energy: 5 },
            ].map(({ label, energy }) => (
              <button
                key={energy}
                className="secondary-button"
                aria-pressed={insight.energy === energy}
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    studyProfile: {
                      energy,
                      updatedAt: new Date().toISOString(),
                    },
                  }))
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p>{insight.suggestion}</p>
          <button className="primary-button" onClick={onStart}>
            陪我开始 10 分钟
          </button>
        </>
      ) : null}
    </section>
  );
}
