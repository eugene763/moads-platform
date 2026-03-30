import {
  buildMotrendPublicShareUrl,
  createOrReuseMotrendPublicShare,
  getActiveMotrendPublicShareBySlug,
  PlatformError,
  resolveProductByCode,
} from "@moads/db";
import {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";

import {
  DOWNLOAD_PREPARE_RETRY_MS,
  DOWNLOAD_PREPARE_STALE_MS,
  getMotrendPreparedDownloadResponse,
  markMotrendDownloadPreparationFailed,
  readDownloadPrepareState,
  requestMotrendDownloadPreparation,
  runMotrendDownloadPreparation,
} from "../lib/motrend-downloads.js";
import {dispatchMotrendDownloadPrepare} from "../lib/task-dispatch.js";
import {requireAuth, resolveAccount} from "../middleware/auth.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function safeExternalUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function isPreparedSourceUnavailable(lastError: string | null | undefined): boolean {
  const normalized = typeof lastError === "string" ? lastError.toLowerCase() : "";
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("generated output is not available") ||
    normalized.includes("download source is not available") ||
    normalized.includes("failed to fetch generated video (403)") ||
    normalized.includes("failed to fetch generated video (404)") ||
    normalized.includes("remote video fetch failed with 403") ||
    normalized.includes("remote video fetch failed with 404")
  );
}

async function getMotrendEntryDomain(app: FastifyInstance): Promise<string> {
  const product = await resolveProductByCode(app.prisma, "motrend");
  return product.entryDomain;
}

async function buildPublicSharePayload(
  app: FastifyInstance,
  slug: string,
  entryDomain: string,
) {
  const share = await getActiveMotrendPublicShareBySlug(app.prisma, slug);
  const prepared = await getMotrendPreparedDownloadResponse(app, {
    accountId: share.job.accountId,
    userId: share.job.userId,
    jobId: share.job.id,
  });
  const downloadPrepare = readDownloadPrepareState(share.job.metadataJson);
  const nowMs = Date.now();
  const pending = !prepared && (
    downloadPrepare.status === "pending" ||
    downloadPrepare.status === "processing"
  ) && downloadPrepare.requestedAtMs != null &&
    nowMs - downloadPrepare.requestedAtMs < DOWNLOAD_PREPARE_STALE_MS;
  const sourceMissing = !share.job.providerOutputUrl ||
    isPreparedSourceUnavailable(downloadPrepare.lastError);

  return {
    slug: share.slug,
    jobId: share.jobId,
    shareUrl: buildMotrendPublicShareUrl(entryDomain, share.slug),
    title: share.title,
    description: share.description,
    previewImageUrl: safeExternalUrl(share.previewImageUrl),
    ready: Boolean(prepared),
    pending,
    retryAfterMs: pending ? DOWNLOAD_PREPARE_RETRY_MS : null,
    inlineUrl: prepared?.inlineUrl ?? null,
    downloadUrl: prepared?.downloadUrl ?? null,
    expiresAtMs: prepared?.expiresAtMs ?? null,
    canPrepareDownload: !sourceMissing,
    sourceMissing,
    lastError: !prepared && downloadPrepare.status === "failed" ?
      downloadPrepare.lastError :
      null,
  };
}

function renderPublicShareHtml(
  payload: Awaited<ReturnType<typeof buildPublicSharePayload>>,
  apiBaseUrl: string,
) {
  const title = escapeHtml(payload.title || "MoTrend© video");
  const description = escapeHtml(payload.description || "Watch a video made with MoTrend©.");
  const shareUrl = escapeHtml(payload.shareUrl);
  const previewImageUrl = escapeHtml(
    safeExternalUrl(payload.previewImageUrl) || "https://trend.moads.agency/assets/moads-logo.png"
  );
  const initialState = escapeJsonForScript(payload);
  const publicApiBaseUrl = apiBaseUrl || "https://api.moads.agency";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <meta name="description" content="${description}"/>
  <link rel="canonical" href="${shareUrl}"/>
  <meta property="og:type" content="video.other"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${description}"/>
  <meta property="og:image" content="${previewImageUrl}"/>
  <meta property="og:url" content="${shareUrl}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${title}"/>
  <meta name="twitter:description" content="${description}"/>
  <meta name="twitter:image" content="${previewImageUrl}"/>
  <link rel="icon" href="/favicon.ico" sizes="any"/>
  <style>
    @font-face{font-family:"Coolvetica";src:url("/fonts/CoolveticaRg-Regular.woff") format("woff");font-weight:400;font-style:normal;font-display:swap;}
    @font-face{font-family:"Coolvetica";src:url("/fonts/CoolveticaRg-Bold.woff") format("woff");font-weight:700;font-style:normal;font-display:swap;}
    :root{
      --font:"Coolvetica", Arial, sans-serif;
      --bg:#0b0b0b;
      --card:#151515;
      --border:#2a2a2a;
      --text:#fff;
      --muted:rgba(255,255,255,.72);
      --accent:#8BFFB0;
      --danger:#f87171;
    }
    *{box-sizing:border-box;font-family:var(--font)}
    body{margin:0;background:var(--bg);color:var(--text);font-size:20px}
    .wrap{max-width:780px;margin:0 auto;padding:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
    h1{margin:0 0 8px;font-size:42px;line-height:.96}
    .brand{color:inherit;text-decoration:none}
    .muted{font-size:18px;color:var(--muted)}
    .videoWrap{margin-top:14px;border-radius:14px;overflow:hidden;background:#000;border:1px solid #202020;display:none}
    video{display:block;width:100%;max-height:70vh;background:#000}
    .actions{display:none;flex-direction:column;gap:10px;margin-top:14px}
    .btn,.btnGhost{width:100%;min-height:54px;border-radius:12px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:32px;line-height:1;font-weight:700;padding:0 12px;border:0;cursor:pointer}
    .btn{background:var(--accent);color:#000;border:1px solid #6edc97}
    .btnGhost{background:#2a2a2a;color:#fff}
    .btn:disabled,.btnGhost:disabled{opacity:.55;cursor:not-allowed}
    .singleAction{display:none;flex-direction:column;gap:10px;margin-top:18px}
    .error{display:none;margin-top:14px;color:var(--danger);font-size:18px}
    .note{margin-top:12px;font-size:18px;color:var(--muted)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <a class="brand" href="/"><h1>MoTrend©</h1></a>
      <div class="muted">${description}</div>
      <div id="error" class="error"></div>
      <div id="videoWrap" class="videoWrap">
        <video id="video" controls playsinline></video>
      </div>
      <div id="singleAction" class="singleAction">
        <button id="btnPrepare" class="btn" type="button">Prepare download</button>
      </div>
      <div id="actions" class="actions">
        <a id="btnSaveFile" class="btn" href="#" download rel="noopener noreferrer">Save file</a>
        <button id="btnCopy" class="btnGhost" type="button">Copy link</button>
        <button id="btnShare" class="btnGhost" type="button">Share</button>
      </div>
      <div id="note" class="note"></div>
    </div>
  </div>
  <script>
    (function() {
      const initialState = ${initialState};
      const apiBaseUrl = ${JSON.stringify(publicApiBaseUrl)};
      let currentState = initialState;
      let prepareInFlight = false;
      let pollTimer = null;

      const errorEl = document.getElementById("error");
      const videoWrap = document.getElementById("videoWrap");
      const videoEl = document.getElementById("video");
      const noteEl = document.getElementById("note");
      const actionsEl = document.getElementById("actions");
      const singleActionEl = document.getElementById("singleAction");
      const btnPrepare = document.getElementById("btnPrepare");
      const btnSaveFile = document.getElementById("btnSaveFile");
      const btnCopy = document.getElementById("btnCopy");
      const btnShare = document.getElementById("btnShare");

      function safeUrl(value) {
        if (typeof value !== "string") return "";
        const trimmed = value.trim();
        if (!trimmed) return "";
        try {
          const url = new URL(trimmed);
          if (url.protocol !== "http:" && url.protocol !== "https:") return "";
          return url.toString();
        } catch {
          return "";
        }
      }

      function showError(message) {
        if (!message) {
          errorEl.textContent = "";
          errorEl.style.display = "none";
          return;
        }
        errorEl.textContent = message;
        errorEl.style.display = "block";
      }

      function clearPoll() {
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
      }

      function schedulePoll(delayMs) {
        clearPoll();
        pollTimer = setTimeout(() => {
          void refreshState();
        }, Math.max(500, Number(delayMs) || 2000));
      }

      function render(state) {
        currentState = state;
        const inlineUrl = safeUrl(state.inlineUrl || "");
        const downloadUrl = safeUrl(state.downloadUrl || "");
        const hasPreparedVideo = !!(inlineUrl || downloadUrl);

        showError("");
        videoWrap.style.display = hasPreparedVideo ? "block" : "none";
        actionsEl.style.display = hasPreparedVideo ? "flex" : "none";
        singleActionEl.style.display = hasPreparedVideo ? "none" : "flex";

        if (hasPreparedVideo) {
          const videoSrc = inlineUrl || downloadUrl;
          if ((videoEl.getAttribute("data-current-src") || "") !== videoSrc) {
            videoEl.setAttribute("data-current-src", videoSrc);
            videoEl.src = videoSrc;
          }
          btnSaveFile.href = downloadUrl || inlineUrl;
          noteEl.textContent = "Prepared links are temporary. If they expire, prepare them again from this page.";
          btnPrepare.disabled = false;
          btnPrepare.textContent = "Prepare download";
          clearPoll();
          return;
        }

        if (state.pending || prepareInFlight) {
          btnPrepare.disabled = true;
          btnPrepare.textContent = "Preparing...";
          noteEl.textContent = "Preparing a fresh download. This may take a few seconds.";
          schedulePoll(state.retryAfterMs || 2000);
          return;
        }

        btnPrepare.disabled = false;
        btnPrepare.textContent = "Prepare download";
        clearPoll();

        if (state.sourceMissing || !state.canPrepareDownload) {
          showError("This video is no longer available to prepare.");
          singleActionEl.style.display = "none";
          noteEl.textContent = "The original source is no longer available.";
          return;
        }

        if (state.lastError) {
          showError("We couldn't prepare the video. Please try again.");
        }
        noteEl.textContent = "The prepared file expired. You can prepare it again from this page.";
      }

      async function readJsonResponse(response) {
        const rawText = await response.text();
        if (!rawText) return null;
        try {
          return JSON.parse(rawText);
        } catch {
          return null;
        }
      }

      async function refreshState() {
        try {
          const response = await fetch(
            apiBaseUrl + "/public/motrend/shares/" + encodeURIComponent(currentState.slug),
            {
              headers: {Accept: "application/json"},
            }
          );
          const payload = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(payload && payload.error && payload.error.message || "Unable to load this page.");
          }
          render(payload || currentState);
        } catch (error) {
          clearPoll();
          showError(error && error.message || "Unable to refresh this page.");
        }
      }

      btnPrepare.addEventListener("click", async function() {
        if (prepareInFlight) return;
        prepareInFlight = true;
        render({...currentState, pending: true, retryAfterMs: currentState.retryAfterMs || 2000});
        try {
          const response = await fetch(
            apiBaseUrl + "/public/motrend/shares/" + encodeURIComponent(currentState.slug) + "/prepare-download",
            {
              method: "POST",
              headers: {Accept: "application/json"},
            }
          );
          const payload = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(payload && payload.error && payload.error.message || "Unable to prepare the video.");
          }
          render(payload || currentState);
        } catch (error) {
          showError(error && error.message || "Unable to prepare the video.");
          render({...currentState, pending: false});
        } finally {
          prepareInFlight = false;
        }
      });

      btnCopy.addEventListener("click", async function() {
        try {
          await navigator.clipboard.writeText(currentState.shareUrl || window.location.href);
          btnCopy.textContent = "Link copied";
          btnCopy.disabled = true;
          setTimeout(function() {
            btnCopy.textContent = "Copy link";
            btnCopy.disabled = false;
          }, 700);
        } catch {
          showError("Unable to copy the link.");
        }
      });

      if (navigator.share) {
        btnShare.addEventListener("click", async function() {
          try {
            await navigator.share({
              title: currentState.title || "MoTrend© video",
              text: currentState.description || "",
              url: currentState.shareUrl || window.location.href,
            });
          } catch (error) {
            if (!error || error.name === "AbortError") {
              return;
            }
            showError("Unable to share the link.");
          }
        });
      } else {
        btnShare.style.display = "none";
      }

      render(currentState);
    })();
  </script>
</body>
</html>`;
}

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  const authGuards = [requireAuth, resolveAccount];

  app.post("/motrend/jobs/:id/share", {preHandler: authGuards}, async (request, reply) => {
    if (!request.accountContext || !request.authContext) {
      throw new PlatformError(500, "session_context_missing", "Session context is missing.");
    }

    const params = request.params as {id?: string};
    if (typeof params.id !== "string" || !params.id.trim()) {
      throw new PlatformError(400, "job_id_required", "job id is required.");
    }

    const entryDomain = await getMotrendEntryDomain(app);
    const share = await createOrReuseMotrendPublicShare(app.prisma, {
      accountId: request.accountContext.accountId,
      userId: request.authContext.userId,
      jobId: params.id.trim(),
      entryDomain,
    });

    reply.send(await buildPublicSharePayload(app, share.slug, entryDomain));
  });

  const publicHtmlHandler = async (
    request: FastifyRequest<{Params: {slug: string}}>,
    reply: FastifyReply,
  ) => {
    const params = request.params as {slug?: string};
    if (typeof params.slug !== "string" || !params.slug.trim()) {
      throw new PlatformError(404, "share_not_found", "Shared video was not found.");
    }

    const entryDomain = await getMotrendEntryDomain(app);
    const payload = await buildPublicSharePayload(app, params.slug, entryDomain);
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-cache")
      .send(renderPublicShareHtml(
        payload,
        app.config.apiBaseUrl ?? "https://api.moads.agency",
      ));
  };

  app.get("/v/:slug", publicHtmlHandler);
  app.get("/public/motrend/v/:slug", publicHtmlHandler);

  app.get("/public/motrend/shares/:slug", async (request, reply) => {
    const params = request.params as {slug?: string};
    if (typeof params.slug !== "string" || !params.slug.trim()) {
      throw new PlatformError(404, "share_not_found", "Shared video was not found.");
    }

    const entryDomain = await getMotrendEntryDomain(app);
    reply.send(await buildPublicSharePayload(app, params.slug, entryDomain));
  });

  app.post("/public/motrend/shares/:slug/prepare-download", async (request, reply) => {
    const params = request.params as {slug?: string};
    if (typeof params.slug !== "string" || !params.slug.trim()) {
      throw new PlatformError(404, "share_not_found", "Shared video was not found.");
    }

    const entryDomain = await getMotrendEntryDomain(app);
    const share = await getActiveMotrendPublicShareBySlug(app.prisma, params.slug);
    const requested = await requestMotrendDownloadPreparation(app, {
      accountId: share.job.accountId,
      userId: share.job.userId,
      jobId: share.job.id,
    });

    if (requested.state === "dispatch") {
      try {
        const dispatchResult = await dispatchMotrendDownloadPrepare(app, {
          jobId: share.job.id,
        });
        if (dispatchResult.dispatched === false) {
          await runMotrendDownloadPreparation(app, {jobId: share.job.id});
        }
      } catch (error) {
        request.log.warn({
          err: error,
          jobId: share.job.id,
          shareSlug: share.slug,
        }, "public motrend download prepare dispatch failed");
        await markMotrendDownloadPreparationFailed(
          app,
          share.job.id,
          error instanceof Error ? error.message : "Download preparation dispatch failed."
        );
      }
    }

    reply.send(await buildPublicSharePayload(app, params.slug, entryDomain));
  });
}
