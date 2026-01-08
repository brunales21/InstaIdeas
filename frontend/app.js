const API_BASE = "https://antbhfqvcf.execute-api.eu-south-2.amazonaws.com/dev";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const output = document.getElementById("output");

const statusOverlay = document.getElementById("statusOverlay");
const statusText = document.getElementById("statusText");

let selectedFile = null;
window.currentIdeaId = null; // ✅ GLOBAL Y CORRECTO

const MAX_FEEDBACK_CHARS = 280;

/* -----------------------------
   Drag & Drop
------------------------------ */

dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener("change", e => {
  handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".m4a")) {
    alert("Only .m4a files are supported");
    return;
  }

  selectedFile = file;
  sendBtn.disabled = false;
}

/* -----------------------------
   Send flow
------------------------------ */

sendBtn.onclick = async () => {
  const userId = document.getElementById("userId").value.trim();
  if (!userId || !selectedFile) {
    alert("User ID and audio are required");
    return;
  }

  try {
    setStatus("⏳ Listening to your idea");

    const presignRes = await fetch(`${API_BASE}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        filename: selectedFile.name
      })
    });

    const { upload_url, audio_key } = await presignRes.json();

    await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "audio/m4a" },
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

    setStatus("✅ Idea ready", false);
    renderIdea(result.idea.idea_json);

  } catch (err) {
    console.error(err);
    setStatus("❌ We couldn’t process this audio.\nTry another .m4a file.");
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
    <div class="idea-card">
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

      <div class="feedback">
        <textarea
          id="feedbackComment"
          placeholder="Optional comment (max 280 chars)"
          rows="3"
        ></textarea>

        <div class="char-counter" id="charCounter">0 / 280</div>

        <div class="feedback-actions">
          <button onclick="sendFeedback(true)">👍 This helped</button>
          <button onclick="sendFeedback(false)">👎 Didn’t help</button>
        </div>

        <p id="feedbackError" class="feedback-error"></p>
      </div>
    </div>
  `;

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
  errorEl.style.color = "#d32f2f";

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

    errorEl.style.color = "green";
    errorEl.textContent = "Thanks for the feedback 🙌";
    commentEl.disabled = true;

  } catch {
    errorEl.textContent = "Error sending feedback";
  }
}
