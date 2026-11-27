import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen, Rocket, Workflow, Bot, BotMessageSquare, KeyRound, MessageSquare,
  FileJson, HelpCircle, Search, Copy, Check, Download, ExternalLink,
} from 'lucide-react';

function CodeBlock({ code, filename }: { code: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="docs-code">
      {filename && <div className="docs-code-name">{filename}</div>}
      <button
        className="btn-icon btn-ghost docs-copy"
        onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        aria-label="Copy code"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="docs-figure">
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="docs-step">
      <span className="docs-step-num">{n}</span>
      <div>
        <b>{title}</b>
        <div className="small dim" style={{ lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

interface DocSection {
  id: string;
  title: string;
  icon: any;
  keywords: string;
  text: string;
  body: ReactNode;
}

const WORKFLOW_JSON = `{
  "name": "Example workflow",
  "graph": {
    "nodes": [
      { "id": "n_trigger", "type": "manualTrigger", "position": { "x": 0, "y": 0 }, "data": { "note": "start" } },
      { "id": "n_set", "type": "set", "position": { "x": 220, "y": 0 }, "data": { "mapping": "{\\"hello\\":\\"world\\"}" } },
      { "id": "n_delay", "type": "delay", "position": { "x": 440, "y": 0 }, "data": { "seconds": 1 } }
    ],
    "edges": [
      { "id": "e1", "source": "n_trigger", "sourceHandle": "out", "target": "n_set", "targetHandle": "payload" },
      { "id": "e2", "source": "n_set", "sourceHandle": "payload", "target": "n_delay", "targetHandle": "value" }
    ]
  }
}`;

const AGENT_JSON = `{
  "name": "Support assistant",
  "systemPrompt": "You are a concise, helpful support agent.",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "baseUrl": "",
  "temperature": 0.7,
  "tools": [],
  "structuredOutput": null
}`;

const SECTIONS: DocSection[] = [
  {
    id: 'start',
    title: 'စတင်အသုံးပြုခြင်း',
    icon: Rocket,
    keywords: 'start getting started login register download app account',
    text: 'account login register download app install telegram bot workflow agent credential',
    body: (
      <>
        <p>FlowBot AI Studio ကို စတင်ရန် အောက်ပါအဆင့်များ လိုက်ပါ။</p>
        <Step n={1} title="Account ဖန်တီးပါ">Email နှင့် password ဖြင့် <b>Create account</b> ကို နှိပ်ပါ။ Email verification/OTP ဖွင့်ထားရင် 6-digit code ဖြင့် အတည်ပြုပါ။</Step>
        <Step n={2} title="Android app ဒေါင်းလုဒ်">Register page ရှိ <b>Download App</b> button သို့မဟုတ် GitHub Releases မှ APK ကို ဒေါင်းလုဒ်လုပ်ပါ။</Step>
        <Step n={3} title="Credential ထည့်ပါ">AI provider တစ်ခုခုအတွက် <b>Credentials</b> တွင် API key ထည့်ပါ (သို့) Cloudflare Workers AI ကို အသုံးပြုပါ။</Step>
        <Step n={4} title="Workflow တစ်ခု ဖန်တီးပါ"><b>Workflows → New workflow</b> ကို နှိပ်ပြီး node များ ချိတ်ဆက်ကာ Run လုပ်ပါ။</Step>
        <div className="docs-callout">🔐 API key များကို server-side တွင် encrypt လုပ်သိမ်းပြီး browser သို့ ဘယ်တော့မှ မပို့ပါ။</div>
      </>
    ),
  },
  {
    id: 'workflows',
    title: 'Workflows လုပ်နည်း',
    icon: Workflow,
    keywords: 'workflow node canvas connect run logs import export json undo redo duplicate',
    text: 'workflow node trigger set delay connect run logs input json import export duplicate undo redo autosave',
    body: (
      <>
        <Figure src="/docs/workflow.svg" alt="Workflow canvas" caption="Node များကို ဆွဲချိတ်ပြီး Run လုပ်နိုင်သည်။" />
        <Step n={1} title="New workflow"><b>Workflows → New workflow</b> ကို နှိပ်ပါ။</Step>
        <Step n={2} title="Node ထည့်ပါ"><b>Add</b> ကို နှိပ်ပြီး Quick add / Search / Category မှ node ကို ရွေးပါ။ Node ကို နှိပ်ရင် settings sheet ပွင့်လာပါမည်။</Step>
        <Step n={3} title="ချိတ်ဆက်ပါ">Node တစ်ခု၏ ညာဘက် handle မှ နောက် node ၏ ဘယ်ဘက် handle သို့ ဆွဲချိတ်ပါ။ ချိတ်ဆက်မှုများကို animated line ဖြင့် ပြပါသည်။</Step>
        <Step n={4} title="Run လုပ်ပါ"><b>Run</b> ကို နှိပ်ပြီး input JSON ထည့်ကာ Run လုပ်ပါ။ Status နှင့် node တစ်ခုချင်း logs ကို panel တွင် ကြည့်နိုင်သည်။ Stop ဖြင့် ရပ်နိုင်သည်။</Step>
        <Step n={5} title="Save / Export"><b>Save</b> သည် autosave ဖြစ်သည်။ Export/Import ဖြင့် workflow JSON ကို သိမ်း/ပြန်ထည့်နိုင်သည်။ Duplicate ဖြင့် workflow အသစ်ကူးနိုင်သည်။</Step>
        <p><b>ဥပမာ JSON:</b> <a className="docs-link" href="/docs/workflow-example.json" download><Download size={14} /> workflow-example.json</a></p>
        <CodeBlock filename="workflow-example.json" code={WORKFLOW_JSON} />
        <div className="docs-callout">Tip — Undo/Redo ကို toolbar သို့မဟုတ် Ctrl/Cmd+Z ဖြင့် သုံးနိုင်သည်။ Node တစ်ခုကို ရွေးပြီး Duplicate/Remove လုပ်နိုင်သည်။</div>
      </>
    ),
  },
  {
    id: 'bots',
    title: 'Telegram Bot လုပ်နည်း',
    icon: Bot,
    keywords: 'telegram bot botfather token webhook command ai reply',
    text: 'telegram bot botfather token webhook secret command start help ai reply keyboard',
    body: (
      <>
        <Figure src="/docs/bot.svg" alt="Telegram bot flow" caption="BotFather token → Bots → webhook → workflow trigger။" />
        <Step n={1} title="BotFather မှ token ယူပါ">Telegram တွင် <b>@BotFather</b> → <code>/newbot</code> → token ကို copy လုပ်ပါ။</Step>
        <Step n={2} title="Bot ထည့်ပါ"><b>Bots → Add bot</b> တွင် token ထည့်ပါ။ Server က <code>getMe</code> ဖြင့် စစ်ပြီး encrypt လုပ်သိမ်းပါသည်။</Step>
        <Step n={3} title="Commands / AI reply">Commands ကို တစ်ကြောင်းချင်း <code>/start — Welcome</code> ပုံစံဖြင့် ထည့်ပါ။ AI reply အတွက် agent ကို ရွေးပါ။</Step>
        <Step n={4} title="Webhook သတ်မှတ်ပါ"><b>Set webhook</b> ကို နှိပ်ပါ။ URL သည် <code>&lt;APP_BASE_URL&gt;/api/in/telegram/&lt;secret&gt;</code> ဖြစ်သည်။</Step>
        <Step n={5} title="Workflow တွင် သုံးပါ"><b>Telegram Trigger</b> နှင့် <b>Telegram Send Message</b> node များကို ထည့်ပါ။</Step>
        <CodeBlock filename="commands.txt" code={'/start — Welcome to FlowBot\n/help — Show help\n/quote — Get a quote = Stay hungry, stay foolish.'} />
      </>
    ),
  },
  {
    id: 'agents',
    title: 'AI Agent ရေးနည်း',
    icon: BotMessageSquare,
    keywords: 'agent system prompt provider model base url credential temperature tools structured output',
    text: 'agent system prompt provider model base url credential temperature tools structured output json schema',
    body: (
      <>
        <Figure src="/docs/agent.svg" alt="AI Agent config" caption="System prompt + provider/model + credential + temperature။" />
        <Step n={1} title="New agent"><b>AI Agents → New agent</b> ကို နှိပ်ပါ။</Step>
        <Step n={2} title="System prompt ရေးပါ">Agent ၏ အလုပ်နှင့် စည်းမျဉ်းများကို ရှင်းရှင်းလင်းလင်း ရေးပါ။</Step>
        <Step n={3} title="Provider / model ရွေးပါ">OpenAI-compatible, Groq, OpenRouter, Gemini, Anthropic, Cloudflare Workers AI များထဲမှ ရွေးပါ။ လိုအပ်ပါက <b>Custom endpoint (Base URL)</b> ထည့်ပါ။</Step>
        <Step n={4} title="Credential ရွေးပါ"><b>Credentials</b> တွင် ထည့်ထားသော key ကို ရွေးပါ။ <b>Test</b> ဖြင့် စစ်နိုင်သည်။</Step>
        <Step n={5} title="Save ပြီး workflow တွင် သုံးပါ">Workflow ထဲတွင် <b>AI Agent</b> node ထည့်ပြီး ဒီ agent ကို ရွေးပါ။</Step>
        <p><b>ဥပမာ JSON:</b> <a className="docs-link" href="/docs/agent-example.json" download><Download size={14} /> agent-example.json</a></p>
        <CodeBlock filename="agent-example.json" code={AGENT_JSON} />
      </>
    ),
  },
  {
    id: 'api',
    title: 'API ထည့်နည်း (Credentials)',
    icon: KeyRound,
    keywords: 'api key credential base url headers model test openai groq openrouter deepseek minimax elevenlabs experiential free cloudflare zilliz',
    text: 'api key credential base url headers model test openai groq openrouter deepseek minimax elevenlabs experiential labs free cloudflare workers ai zilliz',
    body: (
      <>
        <Figure src="/docs/api.svg" alt="API credentials" caption="API key + Base URL + headers ကို encrypted vault တွင် သိမ်းသည်။" />
        <Step n={1} title="Credentials → Add"><b>Credentials</b> သို့ သွားပြီး <b>Add</b> ကို နှိပ်ပါ။</Step>
        <Step n={2} title="Provider ရွေးပါ">OpenAI, Groq, OpenRouter, DeepSeek, MiniMax, ElevenLabs, Experiential Labs, Gemini, Anthropic, Custom OpenAI-compatible, Telegram များထဲမှ ရွေးပါ။</Step>
        <Step n={3} title="API key / Base URL / Headers">API key ထည့်ပါ။ ကိုယ်ပိုင် endpoint အတွက် Base URL ထည့်ပါ။ လိုအပ်ပါက custom headers (JSON) ထည့်ပါ။</Step>
        <Step n={4} title="Test လုပ်ပါ">List ထဲရှိ <b>Test</b> ကို နှိပ်ပြီး server-side မှ ချိတ်ဆက်မှုကို စစ်ပါ။</Step>
        <div className="docs-callout">Cloudflare Workers AI အတွက် API key မလိုပါ — server-side <code>env.AI</code> binding ကို သုံးသည်။ Zilliz အတွက် <code>ZILLIZ_ENDPOINT</code> နှင့် <code>ZILLIZ_API_KEY</code> ကို Worker secrets အဖြစ် သတ်မှတ်ပါ။</div>
        <div className="docs-callout">
          <b>Provider endpoints &amp; auth:</b> DeepSeek <code>https://api.deepseek.com/v1</code> (Authorization: Bearer) · MiniMax <code>https://api.minimax.io/v1</code> (Bearer) · ElevenLabs <code>https://api.elevenlabs.io/v1</code> (<code>xi-api-key</code>) · Experiential Labs (custom Base URL, Bearer). OpenRouter တွင် free <code>:free</code> models ရှိပြီး Groq/Gemini/Cloudflare Workers AI တွင်လည်း free tier ရှိသည်။ ElevenLabs ကို HTTP Request node တွင် credential ဖြင့် ခေါ်နိုင်သည်။
        </div>
      </>
    ),
  },
  {
    id: 'chat',
    title: 'Chat နှင့် Public Chat',
    icon: MessageSquare,
    keywords: 'chat public chat ai assistant presence avatar 24 hour email otp',
    text: 'chat public chat ai assistant presence avatar 24 hour email otp passwordless',
    body: (
      <>
        <p><b>Chat page</b> (<code>/chat</code>) သည် <b>Public Chat</b> ဖြစ်သည် — signed-in user အားလုံး အတူ စကားပြောနိုင်သည်။</p>
        <ul className="docs-list">
          <li>Active-user avatars များကို အပေါ်တွင် left-to-right marquee ဖြင့် ပြသည် (avatar 30 မျိုး၊ male 15 / female 15)။</li>
          <li>Message များကို <b>24 နာရီ</b> ပြည့်လျှင် အလိုအလျောက် ဖျက်သည်။</li>
          <li>Spam ကာကွယ်ရန် server-side rate limit ရှိသည်။</li>
        </ul>
        <p><b>AI Workflow Assistant</b> ကို <b>Workflows</b> page တွင် ထည့်ထားသည် — လိုချင်တဲ့ workflow ကို ဖော်ပြပြီး AI က JSON graph ရေးပေးနိုင်သည်။</p>
        <div className="docs-callout">Email code sign-in ကို အသုံးပြုရန် <code>RESEND_API_KEY</code> နှင့် <code>EMAIL_FROM</code> ကို Worker secrets အဖြစ် သတ်မှတ်ပါ။</div>
      </>
    ),
  },
  {
    id: 'json',
    title: 'JSON reference',
    icon: FileJson,
    keywords: 'json graph nodes edges node type data position import export schema',
    text: 'json graph nodes edges node type data position import export schema reference',
    body: (
      <>
        <p>Workflow JSON တွင် <code>nodes</code> နှင့် <code>edges</code> ပါသည်။ Node တစ်ခုတွင် <code>id</code>, <code>type</code>, <code>position</code>, <code>data</code> ရှိသည်။</p>
        <CodeBlock filename="workflow-graph.json" code={WORKFLOW_JSON} />
        <p>Import လုပ်ရန် Editor toolbar ရှိ <b>Upload</b> ကို နှိပ်ပြီး JSON ဖိုင်ကို ရွေးပါ။ Export အတွက် <b>Download</b> ကို နှိပ်ပါ။</p>
        <p><a className="docs-link" href="/docs/workflow-example.json" download><Download size={14} /> workflow-example.json</a> · <a className="docs-link" href="/docs/agent-example.json" download><Download size={14} /> agent-example.json</a></p>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'ပြဿနာဖြေရှင်းခြင်း',
    icon: HelpCircle,
    keywords: 'faq login error zilliz public chat 500 pwa update android apk email otp',
    text: 'faq login error zilliz public chat 500 pwa update android apk email otp not configured',
    body: (
      <>
        <div className="docs-faq">
          <b>Login မရပါ</b>
          <p>Password မှန်/မမှန် စစ်ပါ။ 10 ကြိမ်ကျော် မှားထားရင် 15 မိနစ် စောင့်ပါ။ Email OTP ဖွင့်ထားရင် “Sign in with an email code” ကို သုံးပါ။</p>
        </div>
        <div className="docs-faq">
          <b>Zilliz is not configured</b>
          <p><code>ZILLIZ_ENDPOINT</code> နှင့် <code>ZILLIZ_API_KEY</code> (သို့) <code>ZILLIZ_URL</code> + <code>ZILLIZ_TOKEN</code> ကို Worker secrets သတ်မှတ်ပါ။ Settings → Zilliz → Test connection ဖြင့် စစ်ပါ။</p>
        </div>
        <div className="docs-faq">
          <b>Public Chat 500</b>
          <p>ယခု ပြင်ပြီးပါပြီ (KV TTL အနည်းဆုံး 60s)။ မရသေးရင် Worker ကို redeploy လုပ်ပါ။</p>
        </div>
        <div className="docs-faq">
          <b>App အဟောင်း ပြနေသည်</b>
          <p>PWA ကို auto-update ဖွင့်ထားပြီးပါပြီ။ တစ်ကြိမ် reload လုပ်ပါ; မရရင် tab အားလုံးပိတ်ပြီး ပြန်ဖွင့်ပါ။</p>
        </div>
        <div className="docs-faq">
          <b>Android APK</b>
          <p>GitHub Releases မှ နောက်ဆုံး APK ကို ဒေါင်းလုဒ်လုပ်ပါ။ Unknown sources ကို ခွင့်ပြုပါ။</p>
        </div>
      </>
    ),
  },
];

export function DocsPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? SECTIONS.filter((s) => `${s.title} ${s.keywords} ${s.text}`.toLowerCase().includes(q)) : SECTIONS),
    [q],
  );

  return (
    <div className="docs-page">
      <aside className="docs-sidebar">
        <div className="chat-search docs-search">
          <Search size={16} aria-hidden />
          <input
            className="chat-search-input"
            placeholder="Search docs 🔍"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search documentation"
          />
        </div>
        <nav className="docs-nav" aria-label="Documentation sections">
          {filtered.map((s) => {
            const Icon = s.icon;
            return (
              <a key={s.id} href={`#${s.id}`}>
                <Icon size={15} /> {s.title}
              </a>
            );
          })}
          {filtered.length === 0 && <div className="small dim" style={{ padding: '8px 10px' }}>No matching sections.</div>}
        </nav>
        <div className="docs-sidebar-foot">
          <BookOpen size={14} /> FlowBot AI Studio docs
        </div>
      </aside>

      <main className="docs-content">
        <div className="docs-hero">
          <div className="badge badge-info"><BookOpen size={13} /> Documentation</div>
          <h1>အသုံးပြုနည်း လမ်းညွှန်</h1>
          <p className="small dim">Workflows, Telegram Bots, AI Agents, API credentials နှင့် Chat အသုံးပြုနည်းများ။ အောက်တွင် ရှာနိုင်သည်။</p>
          <div className="chat-search docs-search docs-search-mobile">
            <Search size={16} aria-hidden />
            <input
              className="chat-search-input"
              placeholder="Search docs 🔍"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search documentation"
            />
          </div>
        </div>

        {filtered.map((s) => {
          const Icon = s.icon;
          return (
            <section key={s.id} id={s.id} className="docs-section">
              <h2><Icon size={20} /> {s.title}</h2>
              {s.body}
            </section>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty" style={{ padding: 32 }}>
            <Search size={26} />
            <h3>No results</h3>
            <p className="small dim">“{query}” နှင့် ကိုက်ညီသော section မရှိပါ။</p>
          </div>
        )}
        <footer className="docs-footer">
          <a className="docs-link" href="https://github.com/amkyawdev/flowbot-ai-studio" target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> GitHub repository
          </a>
          <span className="small faint">FlowBot AI Studio · docs</span>
        </footer>
      </main>
    </div>
  );
}
