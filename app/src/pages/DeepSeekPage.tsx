import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  streamDeepSeekChat,
  testDeepSeekConnection,
} from "../services/deepseek";
import type { DeepSeekMessage } from "../services/deepseek";
import "./DeepSeekPage.css";

const SETTINGS_KEY = "autumn-deepseek-settings";
const REMEMBERED_KEY_KEY = "autumn-deepseek-api-key";
const SESSION_KEY = "autumn-deepseek-session-api-key";
const SYSTEM_PROMPT = "你是秋功里的 DeepSeek 学习助手。请用简洁、准确的中文回答大学生的学习、课程和校园生活问题；不确定的信息要明确说明。";

interface SavedSettings {
  baseUrl: string;
  model: string;
  rememberKey: boolean;
}

interface ChatMessage extends DeepSeekMessage {
  id: string;
  status?: "streaming" | "error";
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { baseUrl: DEFAULT_DEEPSEEK_BASE_URL, model: DEFAULT_DEEPSEEK_MODEL, rememberKey: false };
    const saved = JSON.parse(raw) as Partial<SavedSettings>;
    return {
      baseUrl: typeof saved.baseUrl === "string" && saved.baseUrl.trim() ? saved.baseUrl : DEFAULT_DEEPSEEK_BASE_URL,
      model: typeof saved.model === "string" && saved.model.trim() ? saved.model : DEFAULT_DEEPSEEK_MODEL,
      rememberKey: saved.rememberKey === true,
    };
  } catch {
    return { baseUrl: DEFAULT_DEEPSEEK_BASE_URL, model: DEFAULT_DEEPSEEK_MODEL, rememberKey: false };
  }
}

function loadSavedKey(settings: SavedSettings): string {
  try {
    if (settings.rememberKey) return localStorage.getItem(REMEMBERED_KEY_KEY) ?? "";
    return sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistSettings(settings: SavedSettings, apiKey: string) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (settings.rememberKey) {
      localStorage.setItem(REMEMBERED_KEY_KEY, apiKey);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      localStorage.removeItem(REMEMBERED_KEY_KEY);
      if (apiKey) sessionStorage.setItem(SESSION_KEY, apiKey);
    }
  } catch {
    // 隐私存储不可用时仍允许本次会话继续使用。
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DeepSeekPage() {
  const [settings, setSettings] = useState(loadSettings);
  const [apiKey, setApiKey] = useState(() => loadSavedKey(loadSettings()));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "秋功-DeepSeek 对话"; }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const visibleMessages = useMemo(() => messages.filter((message) => message.role !== "system"), [messages]);

  function updateSettings(patch: Partial<SavedSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persistSettings(next, apiKey);
      return next;
    });
  }

  function updateKey(value: string) {
    setApiKey(value);
    if (settings.rememberKey) persistSettings(settings, value);
    else {
      try { if (value) sessionStorage.setItem(SESSION_KEY, value); else sessionStorage.removeItem(SESSION_KEY); } catch { /* 忽略 */ }
    }
  }

  async function checkConnection() {
    setError("");
    setStatus("正在测试连接…");
    try {
      await testDeepSeekConnection({ baseUrl: settings.baseUrl, apiKey, model: settings.model });
      setStatus("连接成功。 ");
    } catch (reason) {
      setStatus("");
      setError(reason instanceof Error ? reason.message : "连接失败，请检查地址、Key、模型和跨域设置。");
    }
  }

  async function sendMessage(text = draft) {
    const content = text.trim();
    if (!content || busy) return;
    setDraft("");
    setError("");
    setStatus("");
    const userMessage: ChatMessage = { id: newId(), role: "user", content };
    const assistantId = newId();
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", status: "streaming" };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantMessage]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamDeepSeekChat({
        baseUrl: settings.baseUrl,
        apiKey,
        model: settings.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...nextMessages.map(({ role, content }) => ({ role, content }))],
        signal: controller.signal,
        onDelta: (delta) => setMessages((prev) => prev.map((message) => message.id === assistantId ? { ...message, content: message.content + delta } : message)),
      });
      setMessages((prev) => prev.map((message) => message.id === assistantId ? { ...message, status: undefined } : message));
    } catch (reason) {
      if (controller.signal.aborted) {
        setMessages((prev) => prev.map((message) => message.id === assistantId ? { ...message, status: undefined, content: message.content || "已停止生成。" } : message));
      } else {
        const message = reason instanceof Error ? reason.message : "请求失败，请稍后重试。";
        setError(message);
        setMessages((prev) => prev.map((item) => item.id === assistantId ? { ...item, status: "error", content: item.content || "本次请求未生成内容。" } : item));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stopMessage() { abortRef.current?.abort(); }

  function clearMessages() {
    if (busy) stopMessage();
    setMessages([]);
    setError("");
    setStatus("");
  }

  return <>
    <div className="deepseek-page">
      <header className="deepseek-header"><div className="deepseek-container deepseek-header-inner">
        <Link to="/" className="deepseek-brand">秋功<span>农大工具站</span></Link>
        <nav aria-label="工具导航"><Link to="/">首页</Link><Link to="/ca">排课表</Link><Link to="/gpa">绩点计算</Link><Link to="/deepseek" aria-current="page">DeepSeek</Link></nav>
      </div></header>

      <main className="deepseek-container deepseek-main">
        <div className="deepseek-intro"><div><p className="deepseek-eyebrow">学习助手</p><h1>DeepSeek 学习助手</h1><p>使用你的模型服务开始对话。</p></div><span className="deepseek-local-badge">Key 仅用于本页</span></div>
        <div className="deepseek-layout">
          <section className="deepseek-card deepseek-chat-card" aria-labelledby="deepseek-chat-title">
            <div className="deepseek-card-head"><div><h2 id="deepseek-chat-title">开始对话</h2><p>重要信息请结合课程要求和可靠来源核对。</p></div><button type="button" className="deepseek-quiet-btn" onClick={clearMessages}>清空对话</button></div>
            <div className="deepseek-messages" aria-live="polite">
              {!visibleMessages.length && <div className="deepseek-welcome"><strong>可以问我：</strong><div className="deepseek-prompts"><button type="button" onClick={() => sendMessage("帮我制定一份本周复习计划")}>制定复习计划</button><button type="button" onClick={() => sendMessage("如何安排大学生的时间和课程？")}>安排学习时间</button><button type="button" onClick={() => sendMessage("帮我把一个课程项目拆成可执行任务")}>拆解课程项目</button></div><p>请先在右侧填写 API Key，再发送问题。</p></div>}
              {visibleMessages.map((message) => <article className={`deepseek-message is-${message.role}`} key={message.id}><span className="deepseek-message-role">{message.role === "user" ? "我" : "DeepSeek"}</span><div className="deepseek-message-content">{message.content || (message.status === "streaming" ? "正在思考…" : "")}{message.status === "streaming" && <span className="deepseek-cursor" />}</div></article>)}
              <div ref={endRef} />
            </div>
            {error && <div className="deepseek-error" role="alert">{error}</div>}
            {status && <div className="deepseek-status" role="status">{status}</div>}
            <form className="deepseek-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="输入你的学习或校园问题…" aria-label="对话内容" rows={3} disabled={busy && !apiKey} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} />
              <div className="deepseek-composer-foot"><span>Enter 发送 · Shift + Enter 换行</span>{busy ? <button type="button" className="deepseek-stop-btn" onClick={stopMessage}>停止生成</button> : <button type="submit" className="deepseek-send-btn" disabled={!draft.trim()}>发送</button>}</div>
            </form>
          </section>

          <aside className="deepseek-card deepseek-settings-card" aria-labelledby="deepseek-settings-title">
            <div className="deepseek-card-head"><div><h2 id="deepseek-settings-title">连接设置</h2><p>填写模型服务信息后即可开始。</p></div></div>
            <label className="deepseek-field"><span>API 地址</span><input value={settings.baseUrl} onChange={(event) => updateSettings({ baseUrl: event.target.value })} placeholder={DEFAULT_DEEPSEEK_BASE_URL} spellCheck={false} /></label>
            <label className="deepseek-field"><span>API Key</span><input type="password" value={apiKey} onChange={(event) => updateKey(event.target.value)} placeholder="sk-…" autoComplete="off" /></label>
            <label className="deepseek-field"><span>模型名称</span><input value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder={DEFAULT_DEEPSEEK_MODEL} spellCheck={false} /></label>
            <label className="deepseek-check"><input type="checkbox" checked={settings.rememberKey} onChange={(event) => updateSettings({ rememberKey: event.target.checked })} /><span>在本机记住 Key</span></label>
            <button type="button" className="deepseek-test-btn" onClick={() => void checkConnection()} disabled={!apiKey.trim() || !settings.model.trim() || !settings.baseUrl.trim()}>测试连接</button>
            <details className="deepseek-notice"><summary>使用说明</summary><ul><li>默认地址和模型适配 DeepSeek，也可替换成其他兼容服务。</li><li>接口需要允许浏览器跨域访问；连接失败时请检查服务商设置。</li><li>不要在公共电脑上勾选“在本机记住 Key”。</li></ul></details>
          </aside>
        </div>
      </main>
      <footer className="deepseek-footer">秋功 · 学习助手</footer>
    </div>
  </>;
}
