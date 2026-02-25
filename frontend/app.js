const API_BASE = "https://antbhfqvcf.execute-api.eu-south-2.amazonaws.com/dev";

const startRecordingBtn = document.getElementById("startRecordingBtn");
const stopRecordingBtn = document.getElementById("stopRecordingBtn");
const recorderStatus = document.getElementById("recorderStatus");
const recordedAudio = document.getElementById("recordedAudio");
const sendBtn = document.getElementById("sendBtn");
const output = document.getElementById("output");

const statusOverlay = document.getElementById("statusOverlay");
const statusText = document.getElementById("statusText");

let selectedFile = null;
let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;
window.currentIdeaId = null; // ✅ GLOBAL Y CORRECTO
window.currentIdeaData = null;

const MAX_FEEDBACK_CHARS = 280;

/* -----------------------------
   Recording
------------------------------ */

function updateRecorderStatus(message) {
  recorderStatus.textContent = message;
}

function getSupportedMimeType() {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find(type => MediaRecorder.isTypeSupported(type));
}

async function startRecording() {
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    alert("Your browser does not support audio recording.");
    return;
  }

  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];

    mediaRecorder = new MediaRecorder(activeStream, { mimeType });
    mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mimeType });
      const extension = mimeType.includes("mp4") ? "m4a" : "webm";
      selectedFile = new File([blob], `recording.${extension}`, { type: mimeType });
      recordedAudio.src = URL.createObjectURL(blob);
      recordedAudio.classList.remove("hidden");
      sendBtn.disabled = false;
      updateRecorderStatus("Recording ready to send.");
    };

    mediaRecorder.start();
    updateRecorderStatus("Recording...");
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = false;
  } catch (error) {
    console.error(error);
    updateRecorderStatus("Microphone access denied.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  if (activeStream) {
    activeStream.getTracks().forEach(track => track.stop());
    activeStream = null;
  }

  startRecordingBtn.disabled = false;
  stopRecordingBtn.disabled = true;
}

startRecordingBtn.addEventListener("click", startRecording);
stopRecordingBtn.addEventListener("click", stopRecording);

/* -----------------------------
   Send flow
------------------------------ */

sendBtn.onclick = async () => {
  const userInput = document.getElementById("userId").value.trim();
  const userId = userInput || "default-user";
  
  if (!selectedFile) {
    alert("Please record audio first");
    return;
  }

  try {
    setStatus("⏳ Listening to your idea");

    const presignRes = await fetch(`${API_BASE}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        filename: selectedFile.name,
        contentType: selectedFile.type || "audio/webm"
      })
    });

    const { upload_url, audio_key } = await presignRes.json();

    await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": selectedFile.type || "audio/webm" },
      body: selectedFile
    });

    setStatus("🧠 Structuring your thoughts");

    const processRes = await fetch(`${API_BASE}/process-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, audio_key })
    });

    const result = await processRes.json();

    // ✅ GUARDAMOS BIEN EL ID
    window.currentIdeaId = result.idea.ideaId;

    window.currentIdeaData = result.idea.idea_json;

    setStatus("✅ Idea ready", false);
    renderIdea(result.idea.idea_json);

  } catch (err) {
    console.error(err);
    setStatus("❌ We couldn't process this audio.\nTry another .m4a file.");
    setTimeout(() => setStatus("", false), 2500);
  }
};

/* -----------------------------
   UI helpers
------------------------------ */

function setStatus(text, show = true) {
  statusText.textContent = text;
  statusOverlay.classList.toggle("hidden", !show);
}

function renderIdea(idea) {
  const list = (arr) =>
    Array.isArray(arr) && arr.length
      ? `<ul>${arr.map(i => `<li>${i}</li>`).join("")}</ul>`
      : `<p class="muted">—</p>`;

  output.innerHTML = `
    <div class="idea-card" id="ideaContent">
      <h2>${idea.title || "Untitled idea"}</h2>

      <section><h3>Possible names</h3>${list(idea.possible_names)}</section>
      <section><h3>Description</h3><p>${idea.description || "—"}</p></section>
      <section><h3>Problem</h3><p>${idea.problem || "—"}</p></section>
      <section><h3>Solution</h3><p>${idea.solution || "—"}</p></section>
      <section><h3>Suggested improvement</h3><p>${idea.suggested_improvement || "—"}</p></section>
      <section><h3>Potential impact</h3><p>${idea.potential_impact || "—"}</p></section>
      <section><h3>Target audience</h3>${list(idea.target_audience)}</section>
      <section><h3>Usage scenarios</h3>${list(idea.usage_scenarios)}</section>
      <section><h3>Extra opportunity</h3><p>${idea.extra_opportunity || "—"}</p></section>
      <section><h3>Extra context</h3><p>${idea.extra_context || "—"}</p></section>

      <div class="export-section">
        <h3>📤 Export</h3>
        <div class="export-buttons">
          <button id="copyIdeaBtn" class="export-btn copy-btn" title="Copy to clipboard" type="button">
            📋 Copy
          </button>
          <button id="downloadPdfBtn" class="export-btn pdf-btn" title="Download as PDF" type="button">
            📄 Download PDF
          </button>
        </div>
      </div>

      <div class="feedback">
        <textarea
          id="feedbackComment"
          placeholder="Optional comment (max 280 chars)"
          rows="3"
        ></textarea>

        <div class="char-counter" id="charCounter">0 / 280</div>

        <div class="feedback-actions">
          <button onclick="sendFeedback(true)">👍 This helped</button>
          <button onclick="sendFeedback(false)">👎 Didn't help</button>
        </div>

        <p id="feedbackError" class="feedback-error"></p>
      </div>
    </div>
  `;

  const copyIdeaBtn = document.getElementById("copyIdeaBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");

  if (copyIdeaBtn) {
    copyIdeaBtn.addEventListener("click", copyIdeaToClipboard);
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", downloadIdeaPDF);
  }

  output.scrollIntoView({ behavior: "smooth" });
}

document.addEventListener("input", e => {
  if (e.target.id === "feedbackComment") {
    document.getElementById("charCounter").textContent =
      `${e.target.value.length} / ${MAX_FEEDBACK_CHARS}`;
  }
});

/* -----------------------------
   Feedback → Backend
------------------------------ */

async function sendFeedback(helped) {
  const userId = document.getElementById("userId").value.trim();
  const commentEl = document.getElementById("feedbackComment");
  const errorEl = document.getElementById("feedbackError");

  errorEl.textContent = "";
  errorEl.style.color = "#667eea";

  if (!window.currentIdeaId) {
    errorEl.textContent = "Idea ID missing. Please reload and try again.";
    return;
  }

  const comment = commentEl.value.trim();

  if (comment.length > MAX_FEEDBACK_CHARS) {
    errorEl.textContent = `Max ${MAX_FEEDBACK_CHARS} characters allowed`;
    return;
  }

  try {
    await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        ideaId: window.currentIdeaId,
        helped,
        comment
      })
    });

    errorEl.style.color = "#22c55e";
    errorEl.textContent = "Thanks for the feedback 🙌";
    commentEl.disabled = true;

  } catch {
    errorEl.textContent = "Error sending feedback";
  }
}

/* -----------------------------
   Export features
------------------------------ */

function copyIdeaToClipboard() {
  if (!window.currentIdeaData) {
    showExportNotification("No idea content available", false);
    return;
  }

  const text = formatIdeaAsText(window.currentIdeaData);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showExportNotification("📋 Copied to clipboard!", true))
      .catch(() => fallbackCopyToClipboard(text));
    return;
  }

  fallbackCopyToClipboard(text);
}

function fallbackCopyToClipboard(text) {
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.select();

  try {
    const copied = document.execCommand("copy");
    showExportNotification(copied ? "📋 Copied to clipboard!" : "Failed to copy", copied);
  } catch {
    showExportNotification("Failed to copy", false);
  } finally {
    document.body.removeChild(temp);
  }
}

function formatIdeaAsText(idea) {
  const lines = [];
  const pushValue = (label, value) => {
    lines.push(`${label}:`);
    if (Array.isArray(value)) {
      if (value.length) {
        value.forEach(item => lines.push(`• ${item}`));
      } else {
        lines.push("—");
      }
    } else {
      lines.push(value || "—");
    }
    lines.push("");
  };

  lines.push(idea.title || "Untitled idea", "");
  pushValue("Possible names", idea.possible_names);
  pushValue("Description", idea.description);
  pushValue("Problem", idea.problem);
  pushValue("Solution", idea.solution);
  pushValue("Suggested improvement", idea.suggested_improvement);
  pushValue("Potential impact", idea.potential_impact);
  pushValue("Target audience", idea.target_audience);
  pushValue("Usage scenarios", idea.usage_scenarios);
  pushValue("Extra opportunity", idea.extra_opportunity);
  pushValue("Extra context", idea.extra_context);

  return lines.join("\n").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "idea";
}

function renderSectionForPdf(title, value) {
  if (Array.isArray(value)) {
    const items = value.length
      ? `<ul>${value.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "<p>—</p>";
    return `<section><h3>${title}</h3>${items}</section>`;
  }

  return `<section><h3>${title}</h3><p>${escapeHtml(value || "—")}</p></section>`;
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensurePdfEngineLoaded() {
  if (typeof window.html2pdf !== "undefined") {
    return true;
  }

  const sources = [
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
    "https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js"
  ];

  for (const src of sources) {
    try {
      await loadExternalScript(src);
      if (typeof window.html2pdf !== "undefined") {
        return true;
      }
    } catch {
      // try next source
    }
  }

  return false;
}

async function downloadIdeaPDF() {
  if (!window.currentIdeaData) {
    showExportNotification("No idea content available", false);
    return;
  }

  const hasPdfEngine = await ensurePdfEngineLoaded();
  if (!hasPdfEngine) {
    showExportNotification("PDF engine unavailable", false);
    return;
  }

  const idea = window.currentIdeaData;
  const filename = `${sanitizeFileName(idea.title || "idea")}.pdf`;

  const tempContainer = document.createElement("div");
  tempContainer.style.position = "fixed";
  tempContainer.style.inset = "0";
  tempContainer.style.opacity = "0";
  tempContainer.style.pointerEvents = "none";
  tempContainer.style.zIndex = "-1";
  tempContainer.style.background = "#fff";

  tempContainer.innerHTML = `
    <article style="width: 190mm; margin: 0 auto; font-family: Arial, sans-serif; color: #111; line-height: 1.5; padding: 8mm; background: #fff;">
      <h1 style="font-size: 24px; margin-bottom: 18px;">${escapeHtml(idea.title || "Untitled idea")}</h1>
      ${renderSectionForPdf("Possible names", idea.possible_names)}
      ${renderSectionForPdf("Description", idea.description)}
      ${renderSectionForPdf("Problem", idea.problem)}
      ${renderSectionForPdf("Solution", idea.solution)}
      ${renderSectionForPdf("Suggested improvement", idea.suggested_improvement)}
      ${renderSectionForPdf("Potential impact", idea.potential_impact)}
      ${renderSectionForPdf("Target audience", idea.target_audience)}
      ${renderSectionForPdf("Usage scenarios", idea.usage_scenarios)}
      ${renderSectionForPdf("Extra opportunity", idea.extra_opportunity)}
      ${renderSectionForPdf("Extra context", idea.extra_context)}
    </article>
  `;

  document.body.appendChild(tempContainer);
  const article = tempContainer.firstElementChild;

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  window.html2pdf()
    .set({
      margin: [12, 12, 12, 12],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" }
    })
    .from(article)
    .save()
    .then(() => showExportNotification("📄 PDF downloaded!", true))
    .catch(() => showExportNotification("Failed to generate PDF", false))
    .finally(() => document.body.removeChild(tempContainer));
}

function showExportNotification(message, isSuccess) {
  const notification = document.createElement("div");
  notification.className = "export-notification" + (isSuccess ? " success" : " error");
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
