import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCheck,
  Inbox,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  SendHorizontal,
} from "lucide-react";

import Modal from "../components/Modal";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import { ROLE_LABELS } from "../lib/nav";

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-NG", { day: "2-digit", month: "short" });
}

export default function Messages() {
  const { staff } = useAuth();
  const [box, setBox] = useState("inbox");
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [form, setForm] = useState({ recipient_id: "", subject: "", body: "" });
  const [composeError, setComposeError] = useState("");
  const [composing, setComposing] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get(`/messages?box=${box}`);
      setThreads(data?.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [box]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const openThread = async (threadId) => {
    setSelectedId(threadId);
    setThreadLoading(true);
    setError("");
    try {
      const data = await api.get(`/messages/${threadId}`);
      setThread(data);
      await api.post(`/messages/${threadId}/read`, {});
      setThreads((current) =>
        current.map((item) => (item.thread_id === threadId ? { ...item, unread: 0 } : item)),
      );
    } catch (err) {
      setError(err.message);
      setThread(null);
    } finally {
      setThreadLoading(false);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    setError("");
    try {
      await api.post(`/messages/${selectedId}/reply`, { body: reply.trim() });
      setReply("");
      await openThread(selectedId);
      loadThreads();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const openCompose = async () => {
    setComposeOpen(true);
    setComposeError("");
    if (!recipients.length) {
      try {
        const data = await api.get("/messages/recipients");
        setRecipients(data?.items || []);
      } catch (err) {
        setComposeError(err.message);
      }
    }
  };

  const sendNew = async (event) => {
    event.preventDefault();
    if (!form.recipient_id) {
      setComposeError("Choose who the message is for.");
      return;
    }
    if (!form.body.trim()) {
      setComposeError("Write a message before sending.");
      return;
    }
    setComposing(true);
    setComposeError("");
    try {
      const sent = await api.post("/messages", {
        recipient_id: form.recipient_id,
        subject: form.subject || null,
        body: form.body.trim(),
      });
      setForm({ recipient_id: "", subject: "", body: "" });
      setComposeOpen(false);
      setBox("sent");
      await loadThreads();
      openThread(sent.thread_id);
    } catch (err) {
      setComposeError(err.message);
    } finally {
      setComposing(false);
    }
  };

  const selected = threads.find((item) => item.thread_id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">Messages</h1>
          <p className="text-[12px] text-ink-soft">
            Secure messages between the clinical team. Patient details stay inside Afridetect EMR.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost px-2 text-[12px]" onClick={loadThreads}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" className="btn-primary py-2 text-[12px]" onClick={openCompose}>
            <MessageSquarePlus size={14} /> New message
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="btn-secondary px-2 py-1 text-[11px]" onClick={loadThreads}>
            Retry
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-3 pt-2">
          {[
            ["inbox", "Inbox", Inbox],
            ["sent", "Sent", SendHorizontal],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setBox(value);
                setSelectedId("");
                setThread(null);
              }}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-semibold ${
                box === value
                  ? "border-forest-700 text-forest-800"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className={`border-line md:border-r ${selectedId ? "hidden md:block" : "block"}`}>
            {loading ? (
              <div className="grid place-items-center py-16">
                <Loader2 size={20} className="animate-spin text-forest-600" />
              </div>
            ) : threads.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[13px] font-semibold text-ink">
                  {box === "inbox" ? "No messages yet" : "Nothing sent yet"}
                </p>
                <p className="mx-auto mt-1 max-w-[220px] text-[12px] text-ink-muted">
                  {box === "inbox"
                    ? "Messages from other staff members will appear here."
                    : "Messages you send to the team will be listed here."}
                </p>
              </div>
            ) : (
              <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
                {threads.map((item) => (
                  <li key={item.thread_id}>
                    <button
                      type="button"
                      onClick={() => openThread(item.thread_id)}
                      className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${
                        item.thread_id === selectedId ? "bg-forest-50/70" : "hover:bg-canvas"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest-100 text-[11px] font-bold text-forest-800">
                        {initials(item.other_party?.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] font-semibold text-ink">
                            {item.other_party?.name || "Unknown"}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-ink-muted">
                            {timeLabel(item.last_message?.created_at)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-ink-soft">
                          {item.subject}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className="truncate text-[11px] text-ink-muted">
                            {item.last_message?.body}
                          </span>
                          {item.unread > 0 && (
                            <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {item.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${selectedId ? "block" : "hidden md:block"}`}>
            {!selectedId ? (
              <div className="grid place-items-center px-6 py-16 text-center">
                <div>
                  <Inbox size={28} className="mx-auto text-forest-600" />
                  <p className="mt-3 text-[13px] font-semibold text-ink">Choose a conversation</p>
                  <p className="mx-auto mt-1 max-w-[240px] text-[12px] text-ink-muted">
                    Pick a thread on the left, or start a new message to another member of staff.
                  </p>
                </div>
              </div>
            ) : threadLoading && !thread ? (
              <div className="grid place-items-center py-16">
                <Loader2 size={20} className="animate-spin text-forest-600" />
              </div>
            ) : thread ? (
              <div className="flex h-full flex-col">
                <div className="flex items-start gap-2 border-b border-line px-4 py-3">
                  <button
                    type="button"
                    className="icon-btn md:hidden"
                    onClick={() => {
                      setSelectedId("");
                      setThread(null);
                    }}
                    aria-label="Back to messages"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-ink">
                      {selected?.subject || thread.messages[0]?.subject || "Conversation"}
                    </p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {selected?.other_party?.name || thread.messages[0]?.sender_name}
                      {selected?.patient_name ? ` · About ${selected.patient_name}` : ""}
                    </p>
                  </div>
                </div>

                <div className="max-h-[400px] flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {thread.messages.map((message) => {
                    const mine = message.sender_id === staff?.id;
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                            mine
                              ? "bg-forest-700 text-white"
                              : "border border-line bg-canvas text-ink"
                          }`}
                        >
                          <p className={`text-[10.5px] font-semibold ${mine ? "text-forest-100" : "text-ink-muted"}`}>
                            {message.sender_name}
                            {message.sender_role ? ` · ${ROLE_LABELS[message.sender_role] || message.sender_role}` : ""}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">
                            {message.body}
                          </p>
                          <p className={`mt-1 flex items-center gap-1 text-[10px] ${mine ? "text-forest-100" : "text-ink-muted"}`}>
                            {formatDateTime(message.created_at)}
                            {mine && (
                              <span className="ml-1 inline-flex items-center gap-0.5">
                                <CheckCheck size={11} />
                                {message.read_at ? "Read" : "Delivered"}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={sendReply} className="border-t border-line px-4 py-3">
                  <label className="block">
                    <span className="sr-only">Reply</span>
                    <textarea
                      rows={2}
                      className="input resize-y"
                      placeholder="Write a reply…"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[10.5px] text-ink-muted">
                      Patient information stays inside Afridetect EMR.
                    </p>
                    <button type="submit" className="btn-primary py-1.5 text-[12px]" disabled={sending || !reply.trim()}>
                      {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      Send reply
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="grid place-items-center px-6 py-16 text-center">
                <p className="text-[12px] text-ink-muted">This conversation could not be opened.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="New message"
        description="Send a secure message to another member of staff."
        size="max-w-lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setComposeOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="message-form" className="btn-primary" disabled={composing}>
              {composing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send message
            </button>
          </div>
        }
      >
        <form id="message-form" className="space-y-3" onSubmit={sendNew}>
          {composeError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{composeError}</span>
            </div>
          )}
          <label className="block">
            <span className="label">To *</span>
            <select
              className="input mt-1"
              value={form.recipient_id}
              onChange={(event) => setForm((current) => ({ ...current, recipient_id: event.target.value }))}
            >
              <option value="">Choose a staff member</option>
              {recipients.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} · {ROLE_LABELS[person.role] || person.role}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Subject</span>
            <input
              className="input mt-1"
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="Lab query for AFD/2026/0004"
            />
          </label>
          <label className="block">
            <span className="label">Message *</span>
            <textarea
              rows={4}
              className="input mt-1 resize-y"
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="Write the message…"
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
