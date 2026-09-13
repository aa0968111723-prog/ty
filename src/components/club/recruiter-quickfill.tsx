import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardPen, ExternalLink, RefreshCw, UserRound } from "lucide-react";
import { AdminLogin } from "@/components/admin-login";
import {
  OFFICIAL_RECRUITERS,
  RECRUITER_STORAGE_KEY,
  datetimeLocalTaipei,
  generatePrefilledFormUrl,
} from "@/lib/club/recruitment-prefill.mjs";
import type { RecruitmentData } from "./recruitment-dashboard";

type Candidate = RecruitmentData["pending"][number] & {
  completedAt?: string;
  submissionId?: string;
  extraNotes?: string;
};

function readStoredRecruiter() {
  try {
    return localStorage.getItem(RECRUITER_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function waitLabel(minutes: number | null | undefined) {
  if (minutes == null) return "時間未填";
  if (minutes < 60) return `已等 ${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `已等 ${hours} 時 ${rest} 分` : `已等 ${hours} 時`;
}

export function RecruiterQuickfill() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [data, setData] = useState<RecruitmentData | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recruiter, setRecruiter] = useState("");
  const [customRecruiter, setCustomRecruiter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<Candidate | null>(null);
  const [extraNotes, setExtraNotes] = useState("");

  useEffect(() => {
    const stored = readStoredRecruiter();
    if (OFFICIAL_RECRUITERS.includes(stored)) setRecruiter(stored);
    else if (stored) {
      setRecruiter("其他");
      setCustomRecruiter(stored);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/session", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => setAuthenticated(body.authenticated === true))
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      });
    return () => controller.abort();
  }, []);

  const load = useCallback(async (force = false) => {
    setBusy(true);
    try {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
      const response = await fetch(
        `/api/admin/recruitment?date=${encodeURIComponent(date)}${force ? "&refresh=1" : ""}`,
        { cache: "no-store", signal: AbortSignal.timeout(15000) },
      );
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "無法載入待跟進名單");
      setData(body);
      setStale(Boolean(
        body.sync?.recruitmentResponses?.stale
        || body.sync?.gameResults?.stale
        || body.sync?.form?.stale,
      ));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入待跟進名單");
      setStale(Boolean(data));
    } finally {
      setBusy(false);
    }
  }, [data]);

  useEffect(() => {
    if (!authenticated) return;
    void load(true);
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps -- load on auth only

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && authenticated) void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authenticated, load]);

  const officialRecruiter = recruiter === "其他" ? customRecruiter.trim() : recruiter;
  const pending = useMemo(() => {
    const rows = data?.pending || [];
    const needle = query.trim();
    return rows.filter((row) => {
      if (!needle) return true;
      return `${row.name} ${row.phone} ${row.department} ${row.grade} ${row.gameGatekeeper}`.includes(needle);
    });
  }, [data, query]);

  useEffect(() => {
    if (!selectedKey) return;
    if (!(data?.pending || []).some((row) => row.personKey === selectedKey)) {
      setSelectedKey("");
      setDraft(null);
    }
  }, [data, selectedKey]);

  function rememberRecruiter(name: string) {
    setRecruiter(name);
    if (name !== "其他") {
      setCustomRecruiter("");
      try { localStorage.setItem(RECRUITER_STORAGE_KEY, name); } catch { /* ignore */ }
    }
  }

  function chooseStudent(row: Candidate) {
    setSelectedKey(row.personKey);
    setDraft({
      ...row,
      completedAt: row.completedAt || row.gameCompletedAt,
      extraNotes: "",
    });
    setExtraNotes("");
  }

  const preview = draft ? {
    ...draft,
    extraNotes,
  } : null;
  const prefillUrl = preview && officialRecruiter
    ? generatePrefilledFormUrl(preview, { recruiter: officialRecruiter, extraNotes })
    : "";

  if (authenticated === null) {
    return <p className="admin-empty">讀取登入狀態…</p>;
  }
  if (!authenticated) {
    return (
      <AdminLogin onSuccess={() => setAuthenticated(true)} />
    );
  }

  return (
    <div className="quickfill-page" data-quickfill="page">
      <header className="quickfill-top">
        <a href="/admin?view=recruitment">招生戰情</a>
        <strong>接引人快速填表</strong>
        <button type="button" onClick={() => void load(true)} disabled={busy} aria-label="重新同步">
          <RefreshCw size={18} />
        </button>
      </header>

      {error ? <p role="alert" className="admin-error">{error}{stale ? " · 顯示上次名單" : ""}</p> : null}
      {stale && !error ? <p className="admin-caption">同步異常，顯示上次讀到的名單</p> : null}

      <section className="admin-panel quickfill-partner" aria-label="選擇接引人">
        <h1><UserRound size={20} /> 我是哪一位接引人</h1>
        <p className="admin-caption">正式招生接引人會預填進表單。遊戲關主維持原現場帶關，不會被覆蓋。</p>
        <div className="quickfill-partners">
          {OFFICIAL_RECRUITERS.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={recruiter === name}
              onClick={() => rememberRecruiter(name)}
            >
              {name}
            </button>
          ))}
          <button type="button" aria-pressed={recruiter === "其他"} onClick={() => rememberRecruiter("其他")}>
            其他
          </button>
        </div>
        {recruiter === "其他" ? (
          <label>
            接引人姓名
            <input
              aria-label="其他接引人姓名"
              value={customRecruiter}
              maxLength={20}
              onChange={(event) => {
                setCustomRecruiter(event.target.value);
                try { localStorage.setItem(RECRUITER_STORAGE_KEY, event.target.value.trim()); } catch { /* ignore */ }
              }}
            />
          </label>
        ) : null}
        {officialRecruiter ? <p className="admin-caption">目前接引人：{officialRecruiter}</p> : null}
      </section>

      {!officialRecruiter ? (
        <p className="admin-empty">先選自己，再選要跟進的同學</p>
      ) : (
        <section className="admin-panel" aria-label="待跟進同學">
          <div className="admin-section-heading">
            <h2>待跟進同學</h2>
            <span className="admin-caption">{pending.length} 位尚未送出正式表單</span>
          </div>
          <input
            aria-label="搜尋同學"
            placeholder="搜尋姓名、電話、科系"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!pending.length ? (
            <p className="admin-empty">目前沒有待跟進同學</p>
          ) : (
            <div className="admin-person-list recruitment-pending">
              {pending.map((row) => (
                <article key={row.personKey}>
                  <div>
                    <strong>{row.name}</strong>
                    <span className="admin-badge">{row.gameGatekeeper || "未分類"}</span>
                  </div>
                  <p>{row.department || "科系未填"} · {row.grade || "年級未填"}</p>
                  <p>{row.phone || "電話未填"}</p>
                  <small>{waitLabel(row.waitMinutes)} · 遊戲關主 {row.gameGatekeeper || "未填"}</small>
                  <button type="button" className="admin-primary" onClick={() => chooseStudent(row)}>
                    跟進這位同學
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {preview ? (
        <section className="admin-panel quickfill-preview" aria-label="預填資料">
          <div className="admin-section-heading">
            <h2><ClipboardPen size={20} /> 預填資料</h2>
            <button type="button" onClick={() => { setDraft(null); setSelectedKey(""); }}>
              <ArrowLeft size={18} /> 重選
            </button>
          </div>
          <p className="admin-caption">以下欄位會帶進正式 Google 表單，送出前都還能改。</p>
          <label>
            同學的姓名
            <input aria-label="同學的姓名" value={preview.name || ""} onChange={(event) => setDraft({ ...preview, name: event.target.value })} />
          </label>
          <label>
            電話
            <input aria-label="同學電話" inputMode="tel" value={preview.phone || ""} onChange={(event) => setDraft({ ...preview, phone: event.target.value })} />
          </label>
          <label>
            科系
            <input aria-label="科系" value={preview.department || ""} onChange={(event) => setDraft({ ...preview, department: event.target.value })} />
          </label>
          <label>
            年級
            <input aria-label="年級" value={preview.grade || ""} onChange={(event) => setDraft({ ...preview, grade: event.target.value })} />
          </label>
          <label>
            遊戲完成時間
            <input
              aria-label="遊戲完成時間"
              type="datetime-local"
              value={datetimeLocalTaipei(preview.completedAt)}
              onChange={(event) => setDraft({
                ...preview,
                completedAt: event.target.value ? new Date(`${event.target.value}:00+08:00`).toISOString() : "",
              })}
            />
          </label>
          <label>
            遊戲關主
            <input
              aria-label="遊戲關主"
              value={preview.gameGatekeeper || ""}
              onChange={(event) => setDraft({ ...preview, gameGatekeeper: event.target.value })}
            />
          </label>
          <p className="admin-caption">遊戲關主是現場帶關的人，不會改成接引人「{officialRecruiter}」。</p>
          <label>
            submissionId
            <input aria-label="submissionId" value={preview.submissionId || ""} onChange={(event) => setDraft({ ...preview, submissionId: event.target.value })} />
          </label>
          <label>
            接引人備註（活動、興趣等可在表單裡接著填）
            <textarea
              aria-label="接引人備註"
              rows={3}
              value={extraNotes}
              onChange={(event) => setExtraNotes(event.target.value)}
            />
          </label>
          <dl className="recruitment-identity">
            <div><dt>正式招生接引人</dt><dd>{officialRecruiter}</dd></div>
            <div><dt>遊戲關主</dt><dd>{preview.gameGatekeeper || "未填"}</dd></div>
          </dl>
          <a
            className="admin-primary"
            href={prefillUrl}
            target="_blank"
            rel="noreferrer"
            data-quickfill="open-form"
          >
            打開正式招生表單 <ExternalLink size={16} />
          </a>
          <button type="button" onClick={() => void load(true)}>
            我已送出表單，更新名單
          </button>
        </section>
      ) : null}
    </div>
  );
}
