
/* Bexo Website Services promo */
(() => {
  "use strict";

  const DISMISS_KEY = "bexoServicesPromoDismissedUntil";
  const SESSION_KEY = "bexoServicesPromoShownThisSession";
  const DELAY_MS = 12000;
  const DISMISS_DAYS = 7;

  const pageName = window.location.pathname.split("/").pop().toLowerCase();
  const excludedPages = new Set([
    "services.html",
    "contact.html",
    "login.html",
    "signup.html",
    "profile.html",
    "admin.html",
    "admin-login.html"
  ]);

  if (excludedPages.has(pageName)) return;

  try {
    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedUntil > Date.now()) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  } catch (_) {}

  const css = `
    #bexo-services-promo {
      position: fixed;
      z-index: 1050;
      right: 22px;
      bottom: 22px;
      width: min(380px, calc(100vw - 28px));
      padding: 20px;
      border: 1px solid rgba(21,94,239,.18);
      border-radius: 16px;
      background: #fff;
      color: #202939;
      box-shadow: 0 14px 42px rgba(16,24,40,.20);
      font-family: inherit;
      animation: bexoPromoIn .25s ease-out;
    }
    #bexo-services-promo .bexo-promo-close {
      position: absolute;
      top: 8px;
      right: 10px;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #667085;
      font-size: 25px;
      cursor: pointer;
    }
    #bexo-services-promo .bexo-promo-eyebrow {
      display: inline-block;
      margin: 0 32px 8px 0;
      padding: 4px 8px;
      border-radius: 6px;
      background: #eef4ff;
      color: #155eef;
      font-size: 12px;
      font-weight: 700;
    }
    #bexo-services-promo h2 {
      margin: 0 24px 8px 0;
      color: #101828;
      font-size: 20px;
      line-height: 1.35;
    }
    #bexo-services-promo p {
      margin: 0 0 15px;
      color: #475467;
      font-size: 14px;
      line-height: 1.6;
    }
   #bexo-services-promo .bexo-promo-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 5px 10px;
  width: fit-content;
  max-width: 100%;
  border-radius: 7px;
  background: #155eef;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  line-height: 1.4;
}
    @keyframes bexoPromoIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 480px) {
      #bexo-services-promo {
        right: 14px;
        bottom: 14px;
        width: calc(100vw - 28px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #bexo-services-promo { animation: none; }
    }
  `;

  function rememberSessionDisplay() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_) {}
  }

  function dismissForAWeek() {
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
      );
    } catch (_) {}
    rememberSessionDisplay();
  }

  function showPromo() {
    if (!document.body || document.getElementById("bexo-services-promo")) return;

    rememberSessionDisplay();

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const promo = document.createElement("aside");
    promo.id = "bexo-services-promo";
    promo.setAttribute("aria-label", "Bexo website services");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "bexo-promo-close";
    close.setAttribute("aria-label", "Close promotion");
    close.textContent = "×";
    close.addEventListener("click", () => {
      dismissForAWeek();
      promo.remove();
    });

    const eyebrow = document.createElement("span");
    eyebrow.className = "bexo-promo-eyebrow";
    eyebrow.textContent = "BEXO WEBSITE SERVICES";

    const heading = document.createElement("h2");
    heading.textContent = "Have an idea for a website?";

    const description = document.createElement("p");
    description.textContent =
      "Tell us what you need. We can help with a new website, a redesign, or improvements to an existing site.";

    const link = document.createElement("a");
    link.className = "bexo-promo-link";
    link.href = "services.html";
    link.textContent = "Request your website →";

    promo.append(close, eyebrow, heading, description, link);
    document.body.appendChild(promo);
  }

  window.setTimeout(showPromo, DELAY_MS);
})();
