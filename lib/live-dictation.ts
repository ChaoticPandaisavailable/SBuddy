type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
export interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<SpeechResult>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
export type SpeechConstructor = new () => SpeechRecognizer;
export function beginDictation(
  Constructor: SpeechConstructor,
  callbacks: {
    onFinal: (text: string) => void;
    onInterim: (text: string) => void;
    onEnd: (message: string) => void;
  },
) {
  const recognizer = new Constructor();
  recognizer.lang = 'zh-CN';
  recognizer.continuous = true;
  recognizer.interimResults = true;
  let closed = false;
  const committed = new Set<number>();
  const finish = (message: string) => {
    if (closed) return;
    closed = true;
    recognizer.onresult = null;
    recognizer.onerror = null;
    recognizer.onend = null;
    callbacks.onInterim('');
    callbacks.onEnd(message);
  };
  recognizer.onresult = (event) => {
    if (closed) return;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal && !committed.has(i)) {
        committed.add(i);
        const text = result[0].transcript.trim();
        if (text) callbacks.onFinal(text);
      } else if (!result.isFinal) interim += result[0].transcript;
    }
    callbacks.onInterim(interim);
  };
  recognizer.onerror = ({ error }) => {
    const message =
      error === 'not-allowed' || error === 'service-not-allowed'
        ? '听写权限被拒绝，你仍可输入或粘贴文字。'
        : error === 'network'
          ? '浏览器听写服务无法连接，请改用文字或录音转写。'
          : '听写已停止，已识别的文字仍保留，可以继续编辑。';
    finish(message);
    recognizer.abort();
  };
  recognizer.onend = () => finish('听写已结束，已识别的文字已保留。');
  try {
    recognizer.start();
  } catch (error) {
    finish('听写无法启动，请使用文字输入或录音转写。');
    recognizer.abort();
    throw error;
  }
  return () => {
    finish('听写已停止，已识别的文字已保留。');
    recognizer.abort();
  };
}
