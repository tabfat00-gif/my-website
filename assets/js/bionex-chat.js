/*!
 * BIONEX Chat — floating assistant widget for the Bexo website.
 *
 * Vanilla JS + self-contained injected CSS (no Bootstrap dependency).
 * Replies from the backend are rendered with textContent only (never innerHTML),
 * so untrusted model output can never inject markup or scripts.
 *
 * Backend: Supabase Edge Function `bexo-chat`.
 * The AI provider lives server-side; this file holds no API key and no
 * provider credentials. If the backend is missing or unconfigured the widget
 * says so plainly — it never fakes an AI reply.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------
  var CONFIG = {
    // Public project URL (not a secret) — same one used by the site's
    // other Supabase pages.
    endpoint:
      "https://ulxreyrjtavflppahqlp.supabase.co/functions/v1/bexo-chat",

    // Publishable anon key. Left EMPTY on purpose.
    // Supabase Edge Functions may be deployed with `--no-verify-jwt`;
    // if your deploy enforces JWT verification, paste the site's
    // publishable key here (it is a client-side value, already present
    // in the other pages of this site — not a secret).
    anonKey: "sb_publishable_L3HbgtTkYCPZmCnuEABRxw_t7qWHBAE",

    requestTimeoutMs: 30000,
    healthTimeoutMs: 15000,
    maxUserChars: 2000, // mirror of the server-side limit
    maxRequestMessages: 12, // mirror of the server-side conversation cap
    maxVisibleMessages: 100 // chat log cap (history keeps less)
  };

  var STORAGE_KEY = "bexo.bionex.chat.v1";
  var MAX_HISTORY = 20; // messages kept in sessionStorage

  // ---------------------------------------------------------------
  // Small DOM helpers
  // ---------------------------------------------------------------
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          if (key === "class") node.className = attrs[key];
          else if (key === "hidden") node.hidden = !!attrs[key];
          else node.setAttribute(key, attrs[key]);
        }
      }
    }
    if (typeof text === "string") node.textContent = text; // textContent, not innerHTML
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  var state = {
    open: false,
    pending: false,
    history: [], // [{role, content}]
    healthChecked: false,
    health: null, // {ok, configured, model}
    noticeShown: false,
    node: null
  };

  // ---------------------------------------------------------------
  // Styles (injected once)
  // ---------------------------------------------------------------
  var CSS = [
    "#bexo-chat-launcher{position:fixed;right:22px;bottom:22px;z-index:2100;",
    "width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;",
    "background:#155eef;color:#fff;display:flex;align-items:center;justify-content:center;",
    "box-shadow:0 12px 32px rgba(21,94,239,.42);transition:transform .18s ease,box-shadow .18s ease;}",
    "#bexo-chat-launcher:hover{transform:translateY(-2px);box-shadow:0 16px 36px rgba(21,94,239,.5);}",
    "#bexo-chat-launcher:focus-visible{outline:3px solid #98a2b3;outline-offset:3px;}",
    "#bexo-chat-launcher[data-state=\"ready\"]::after{content:\"\";position:absolute;top:2px;right:2px;",
    "width:12px;height:12px;border-radius:50%;background:#12b76a;border:2px solid #fff;}",
    "#bexo-chat-launcher[data-state=\"error\"]::after{content:\"\";position:absolute;top:2px;right:2px;",
    "width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;}",
    "#bexo-chat-panel{position:fixed;right:22px;bottom:92px;z-index:2100;",
    "width:min(400px,calc(100vw - 44px));height:min(600px,calc(100vh - 130px));",
    "display:flex;flex-direction:column;overflow:hidden;background:#fff;color:#202939;",
    "border:1px solid rgba(21,94,239,.18);border-radius:16px;",
    "box-shadow:0 24px 64px rgba(16,24,40,.24);font-family:inherit;}",
    "#bexo-chat-panel[hidden]{display:none!important;}",
    "#bexo-chat-header{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#155eef;color:#fff;}",
    "#bexo-chat-mark{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.18);",
    "display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;letter-spacing:.5px;}",
    "#bexo-chat-title{font-size:15px;font-weight:600;line-height:1.2;margin:0;}",
    "#bexo-chat-status{font-size:11px;opacity:.9;font-weight:400;margin-top:2px;}",
    "#bexo-chat-close{margin-left:auto;background:transparent;border:0;color:#fff;font-size:24px;",
    "line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px;}",
    "#bexo-chat-close:hover{background:rgba(255,255,255,.16);}",
    "#bexo-chat-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;",
    "background:#f8f9fb;scroll-behavior:smooth;}",
    "#bexo-chat-log:focus-visible{outline:none;}",
    "#bexo-chat-empty{margin:auto;text-align:center;color:#667085;font-size:13px;max-width:260px;}",
    ".bexo-msg{max-width:86%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;",
    "white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;animation:bexoMsgIn .18s ease;}",
    "@keyframes bexoMsgIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}",
    ".bexo-msg--user{align-self:flex-end;background:#155eef;color:#fff;border-bottom-right-radius:4px;}",
    ".bexo-msg--assistant{align-self:flex-start;background:#fff;color:#202939;border:1px solid #e4e7ec;",
    "border-bottom-left-radius:4px;}",
    ".bexo-msg--error{align-self:stretch;max-width:100%;background:#fef3f2;color:#b42318;",
    "border:1px solid #fecdca;font-size:13px;}",
    ".bexo-msg--note{align-self:stretch;max-width:100%;background:#fff7e6;color:#93370d;",
    "border:1px solid #fedf89;font-size:13px;}",
    ".bexo-msg a{color:#155eef;}",
    ".bexo-msg--user a{color:#fff;}",
    ".bexo-retry{margin-top:8px;background:#fff;border:1px solid #f04438;color:#b42318;border-radius:8px;",
    "padding:5px 12px;font-size:12px;cursor:pointer;}",
    ".bexo-retry:hover{background:#fef3f2;}",
    "#bexo-chat-typing{display:flex;gap:4px;align-items:center;align-self:flex-start;background:#fff;",
    "border:1px solid #e4e7ec;border-radius:14px;padding:12px 14px;}",
    "#bexo-chat-typing span{width:6px;height:6px;border-radius:50%;background:#98a2b3;",
    "animation:bexoDot 1.2s infinite ease-in-out;}",
    "#bexo-chat-typing span:nth-child(2){animation-delay:.16s;}",
    "#bexo-chat-typing span:nth-child(3){animation-delay:.32s;}",
    "@keyframes bexoDot{0%,80%,100%{opacity:.3;transform:translateY(0);}40%{opacity:1;transform:translateY(-3px);}}",
    "#bexo-chat-form{display:flex;gap:8px;align-items:flex-end;padding:12px;border-top:1px solid #e4e7ec;background:#fff;}",
    "#bexo-chat-input{flex:1;resize:none;min-height:42px;max-height:120px;padding:11px 12px;font-size:14px;",
    "font-family:inherit;color:#202939;background:#f8f9fb;border:1px solid #d0d5dd;border-radius:10px;",
    "line-height:1.4;}",
    "#bexo-chat-input:focus{outline:none;border-color:#155eef;background:#fff;}",
    "#bexo-chat-input:disabled{opacity:.6;}",
    "#bexo-chat-send{background:#155eef;color:#fff;border:0;border-radius:10px;width:42px;height:42px;",
    "cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;}",
    "#bexo-chat-send:hover:not(:disabled){background:#0f4fd1;}",
    "#bexo-chat-send:disabled{opacity:.5;cursor:not-allowed;}",
    "#bexo-chat-note{padding:0 14px 10px;font-size:11px;color:#98a2b3;background:#fff;margin:0;}",
    "/* Offset the fixed services promo so it never sits under the launcher. */",
    "#bexo-services-promo{bottom:96px!important;}",
    "@media (max-width:480px){#bexo-services-promo{bottom:86px!important;}}",
    "@media (max-width:560px){",
    "#bexo-chat-panel{right:0;bottom:0;width:100%;height:100vh;height:100dvh;border-radius:0;border:0;}",
    "#bexo-chat-launcher{right:16px;bottom:16px;}",
    "}",
    "@media (prefers-reduced-motion:reduce){",
    "#bexo-chat-launcher,#bexo-chat-log{transition:none;scroll-behavior:auto;}",
    ".bexo-msg{animation:none;}",
    "#bexo-chat-typing span{animation:none;opacity:.6;}",
    "}"
  ].join("");

  function injectStyles() {
    if (document.getElementById("bexo-chat-style")) return;
    var style = el("style", { id: "bexo-chat-style" });
    style.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------------------------------------------------------------
  // Labels (English UI)
  // ---------------------------------------------------------------
  var LABELS = {
    title: "BIONEX Assistant",
    close: "Close chat",
    open: "Open BIONEX chat",
    send: "Send message",
    inputPlaceholder: "Ask about this site…",
    empty:
      "Hi! I'm the BIONEX assistant. Ask me anything about the pages on this site.",
    note: "BIONEX can make mistakes. Don't share personal data.",
    connecting: "Checking service…",
    ready: "Online",
    readyModel: "Online · {model}",
    notConfigured: "Not configured",
    notReachable: "Not reachable",
    pending: "BIONEX is thinking…",
    retry: "Try again"
  };

  function errorMessage(code, detail) {
    switch (code) {
      case "not_configured":
        return "The BIONEX service isn't set up yet — no AI provider key is configured on the server.";
      case "rate_limited":
        return "Too many requests from this browser. Please wait a few minutes and try again.";
      case "provider_rate_limited":
        return "The assistant is at its limit right now. Please try again in a minute.";
      case "bad_request":
        return "Your message couldn't be processed. Please shorten it and try again.";
      case "origin_blocked":
        return "This page isn't allowed to use the assistant.";
      case "auth_required":
        return "The service is misconfigured (authentication required). Please tell the site owner.";
      case "timeout":
        return "The request timed out. Please try again.";
      case "offline":
        return "You're offline. Reconnect to use the assistant.";
      case "not_deployed":
        return "The BIONEX backend isn't deployed yet.";
      case "protocol":
        return "The assistant returned an unexpected response. Please try again.";
      case "network":
        return "Couldn't reach the BIONEX service — check your connection, the assistant may not be live yet.";
      default:
        return detail || "Something went wrong. Please try again.";
    }
  }

  // ---------------------------------------------------------------
  // History (sessionStorage)
  // ---------------------------------------------------------------
  function loadHistory() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (entry) {
        return (
          entry &&
          (entry.role === "user" || entry.role === "assistant") &&
          typeof entry.content === "string" &&
          entry.content.length > 0
        );
      });
    } catch (err) {
      return [];
    }
  }

  function saveHistory() {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state.history.slice(-MAX_HISTORY))
      );
    } catch (err) {
      /* storage full or blocked — history is a convenience, not a requirement */
    }
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function scrollLog() {
    if (!state.node) return;
    var log = state.node.log;
    log.scrollTop = log.scrollHeight;
  }

  function appendMessage(role, text) {
    if (!state.node) return null;
    var log = state.node.log;
    var empty = log.querySelector("#bexo-chat-empty");
    if (empty) empty.remove();

    var className =
      role === "user"
        ? "bexo-msg bexo-msg--user"
        : role === "note"
        ? "bexo-msg bexo-msg--note"
        : "bexo-msg bexo-msg--assistant";

    var node = el("div", { class: className, role: "article" });
    node.textContent = text; // never innerHTML
    log.appendChild(node);

    while (log.querySelectorAll(".bexo-msg").length > CONFIG.maxVisibleMessages) {
      var first = log.querySelector(".bexo-msg");
      if (!first) break;
      first.remove();
    }

    scrollLog();
    return node;
  }

  function appendError(text) {
    if (!state.node) return;
    var log = state.node.log;
    var empty = log.querySelector("#bexo-chat-empty");
    if (empty) empty.remove();

    var node = el("div", { class: "bexo-msg bexo-msg--error", role: "alert" });
    node.textContent = text;

    var last = lastUserText();
    if (last) {
      var retry = el(
        "button",
        { type: "button", class: "bexo-retry" },
        LABELS.retry
      );
      retry.addEventListener("click", function () {
        resend();
      });
      node.appendChild(retry);
    }

    log.appendChild(node);
    scrollLog();
  }

  function showTyping() {
    if (!state.node || state.node.typing) return;
    var node = el("div", { id: "bexo-chat-typing", "aria-hidden": "true" });
    node.appendChild(el("span"));
    node.appendChild(el("span"));
    node.appendChild(el("span"));
    state.node.log.appendChild(node);
    state.node.typing = node;
    scrollLog();
  }

  function hideTyping() {
    if (!state.node || !state.node.typing) return;
    state.node.typing.remove();
    state.node.typing = null;
  }

  function setStatus(text, tone) {
    if (!state.node) return;
    state.node.status.textContent = text;
    if (state.node.launcher) {
      state.node.launcher.setAttribute("data-state", tone || "ready");
    }
  }

  // ---------------------------------------------------------------
  // Request plumbing
  // ---------------------------------------------------------------
  function headers(json) {
    var h = { "content-type": "application/json" };
    if (CONFIG.anonKey) h.authorization = "Bearer " + CONFIG.anonKey;
    if (json) h.accept = "application/json";
    return h;
  }

  function fetchWithTimeout(url, options, ms) {
    var controller =
      typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options.signal = controller.signal;
      timer = window.setTimeout(function () {
        controller.abort();
      }, ms);
    }
    return fetch(url, options).then(
      function (res) {
        if (timer) window.clearTimeout(timer);
        return res;
      },
      function (err) {
        if (timer) window.clearTimeout(timer);
        throw err;
      }
    );
  }

  function readJson(res) {
    return res.text().then(function (text) {
      if (!text) return {};
      try {
        var parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (err) {
        return {};
      }
    });
  }

  /** Map an HTTP/network failure to a stable error code. */
  function classify(res, payload) {
    if (res.status === 404) return "not_deployed";
    if (res.status === 401) return "auth_required";
    if (res.status === 403) return "origin_blocked";
    if (res.status === 429) {
      return payload && payload.error === "rate_limited"
        ? "rate_limited"
        : "provider_rate_limited";
    }
    if (res.status === 503 && payload && payload.error === "not_configured") {
      return "not_configured";
    }
    if (res.status === 400) return "bad_request";
    if (res.status >= 500) return "server";
    return "unknown";
  }

  // ---------------------------------------------------------------
  // Health check (runs once, on first open)
  // ---------------------------------------------------------------
  function healthCheck() {
    if (state.healthChecked) return Promise.resolve(state.health);
    state.healthChecked = true;
    setStatus(LABELS.connecting, "loading");

    return fetchWithTimeout(
      CONFIG.endpoint,
      { method: "GET", headers: headers(true), mode: "cors" },
      CONFIG.healthTimeoutMs
    )
      .then(function (res) {
        return readJson(res).then(function (payload) {
          if (res.status === 404) throw { code: "not_deployed" };
          if (res.status === 401 || res.status === 403) {
            throw { code: classify(res, payload) };
          }
          if (!res.ok && res.status !== 503) throw { code: classify(res, payload) };

          state.health = {
            ok: true,
            configured:
              res.ok && payload && payload.configured === true ? true : false,
            model: payload && typeof payload.model === "string" ? payload.model : null
          };

          if (state.health.configured) {
            setStatus(
              state.health.model
                ? LABELS.readyModel.replace("{model}", state.health.model)
                : LABELS.ready,
              "ready"
            );
          } else {
            setStatus(LABELS.notConfigured, "error");
            showNotice(errorMessage("not_configured"));
          }
          return state.health;
        });
      })
      .catch(function (err) {
        var code =
          err && err.code
            ? err.code
            : navigator.onLine === false
            ? "offline"
            : "network";
        state.health = { ok: false, configured: false, code: code };
        setStatus(LABELS.notReachable, "error");
        // Only surface a note when it looks like "not deployed / not configured";
        // transient network problems will show up clearly on the next send.
        if (code === "not_deployed") {
          showNotice(errorMessage("not_deployed"));
        }
        return state.health;
      });
  }

  function showNotice(text) {
    if (state.noticeShown || !state.node) return;
    state.noticeShown = true;
    appendMessage("note", text);
  }

  // ---------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------
  function lastUserText() {
    for (var i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].role === "user") return state.history[i].content;
    }
    return null;
  }

  function setPending(pending) {
    state.pending = pending;
    if (!state.node) return;
    state.node.input.disabled = pending;
    state.node.send.disabled = pending;
    if (pending) showTyping();
    else hideTyping();
  }

  function send(text, options) {
    options = options || {};
    if (state.pending) return;

    var trimmed = (text || "").trim();
    if (!trimmed) return;
    if (trimmed.length > CONFIG.maxUserChars) {
      appendError(errorMessage("bad_request"));
      return;
    }

    if (!options.fromRetry) {
      // Optimistic local echo — appended immediately so the user sees it.
      appendMessage("user", trimmed);
      state.history.push({ role: "user", content: trimmed });
      saveHistory();
      if (state.node) state.node.input.value = "";
      resizeInput();
    }

    setPending(true);

    var payload = {
      messages: state.history.slice(-CONFIG.maxRequestMessages)
    };

    fetchWithTimeout(
      CONFIG.endpoint,
      {
        method: "POST",
        headers: headers(true),
        mode: "cors",
        body: JSON.stringify(payload)
      },
      CONFIG.requestTimeoutMs
    )
      .then(function (res) {
        return readJson(res).then(function (body) {
          if (!res.ok) {
            var code = classify(res, body);
            var serverText =
              body && typeof body.message === "string" ? body.message : null;
            throw { code: code, detail: serverText };
          }
          if (!body || typeof body.reply !== "string") {
            throw { code: "protocol" };
          }
          return body.reply;
        });
      })
      .then(function (reply) {
        appendMessage("assistant", reply);
        state.history.push({ role: "assistant", content: reply });
        saveHistory();
        if (!state.health || !state.health.ok) {
          state.health = { ok: true, configured: true, model: null };
          setStatus(LABELS.ready, "ready");
        }
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          appendError(errorMessage("timeout"));
          return;
        }
        if (err && (err.code || err.detail)) {
          appendError(errorMessage(err.code, err.detail));
          return;
        }
        if (navigator.onLine === false) {
          appendError(errorMessage("offline"));
          return;
        }
        // TypeError from fetch() => network/CORS (function missing or blocked)
        appendError(errorMessage("network"));
      })
      .then(
        function () {
          setPending(false);
        },
        function () {
          setPending(false);
        }
      );
  }

  function resend() {
    var last = lastUserText();
    if (!last || state.pending) return;
    // Drop the failed error row before retrying (no duplicate user bubble).
    if (state.node) {
      var errors = state.node.log.querySelectorAll(".bexo-msg--error");
      for (var i = 0; i < errors.length; i++) errors[i].remove();
    }
    send(last, { fromRetry: true });
  }

  function resizeInput() {
    if (!state.node) return;
    var input = state.node.input;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // ---------------------------------------------------------------
  // Panel construction
  // ---------------------------------------------------------------
  function buildPanel() {
    var panel = el("div", {
      id: "bexo-chat-panel",
      role: "dialog",
      "aria-label": LABELS.title,
      "aria-modal": "false",
      hidden: true
    });

    // --- header ---
    var header = el("div", { id: "bexo-chat-header" });
    var mark = el("div", { id: "bexo-chat-mark" }, "B");
    var titleWrap = el("div");
    titleWrap.appendChild(el("p", { id: "bexo-chat-title" }, LABELS.title));
    var status = el("p", { id: "bexo-chat-status" }, LABELS.connecting);
    titleWrap.appendChild(status);
    var close = el(
      "button",
      {
        type: "button",
        id: "bexo-chat-close",
        "aria-label": LABELS.close,
        title: LABELS.close
      },
      "×"
    );
    header.appendChild(mark);
    header.appendChild(titleWrap);
    header.appendChild(close);
    panel.appendChild(header);

    // --- log ---
    var log = el("div", {
      id: "bexo-chat-log",
      tabindex: "0",
      "aria-live": "polite",
      "aria-label": "Conversation"
    });
    var empty = el(
      "div",
      { id: "bexo-chat-empty", role: "note" },
      LABELS.empty
    );
    log.appendChild(empty);
    panel.appendChild(log);

    // --- composer ---
    var form = el("form", { id: "bexo-chat-form", autocomplete: "off" });
    var input = el("textarea", {
      id: "bexo-chat-input",
      rows: "1",
      "aria-label": LABELS.inputPlaceholder,
      placeholder: LABELS.inputPlaceholder,
      maxlength: String(CONFIG.maxUserChars)
    });
    var send = el(
      "button",
      { type: "submit", id: "bexo-chat-send", "aria-label": LABELS.send, title: LABELS.send },
      "➤"
    );
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(form);

    var note = el("p", { id: "bexo-chat-note" }, LABELS.note);
    panel.appendChild(note);

    return {
      panel: panel,
      log: log,
      input: input,
      send: send,
      form: form,
      close: close,
      status: status,
      typing: null
    };
  }

  function restoreLog() {
    if (!state.node) return;
    var log = state.node.log;
    clear(log);
    var visible = state.history.slice(-CONFIG.maxVisibleMessages);
    if (visible.length === 0) {
      log.appendChild(
        el("div", { id: "bexo-chat-empty", role: "note" }, LABELS.empty)
      );
      return;
    }
    for (var i = 0; i < visible.length; i++) {
      appendMessage(visible[i].role, visible[i].content);
    }
  }

  // ---------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------
  function open() {
    if (state.open) return;
    if (!state.node) buildUi();
    state.open = true;
    state.node.panel.hidden = false;
    state.node.launcher.setAttribute("aria-expanded", "true");
    restoreLog();
    state.node.input.focus();
    healthCheck();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    if (state.node) {
      state.node.panel.hidden = true;
      state.node.launcher.setAttribute("aria-expanded", "false");
      state.node.launcher.focus();
    }
  }

  function toggle() {
    if (state.open) close();
    else open();
  }

  // ---------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------
  function buildUi() {
    injectStyles();

    var launcher = el("button", {
      type: "button",
      id: "bexo-chat-launcher",
      "aria-label": LABELS.open,
      title: LABELS.open,
      "aria-expanded": "false",
      "aria-controls": "bexo-chat-panel",
      "data-state": "unknown"
    });
    launcher.appendChild(document.createTextNode("💬"));
    launcher.addEventListener("click", toggle);
    document.body.appendChild(launcher);

    var nodes = buildPanel();
    nodes.launcher = launcher;
    document.body.appendChild(nodes.panel);
    state.node = nodes;

    nodes.close.addEventListener("click", close);

    nodes.form.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = nodes.input.value;
      if (state.pending) return;
      send(value);
    });

    nodes.input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (state.pending) return;
        send(nodes.input.value);
      }
    });

    nodes.input.addEventListener("input", resizeInput);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.open) {
        event.stopPropagation();
        close();
      }
    });

    window.addEventListener("online", function () {
      if (state.health && state.health.ok === false) {
        state.healthChecked = false;
        state.health = null;
        setStatus(LABELS.connecting, "loading");
        healthCheck();
      }
    });
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  function init() {
    if (window.__bexoChatReady) return; // guard against double-injection
    window.__bexoChatReady = true;
    state.history = loadHistory();
    buildUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
