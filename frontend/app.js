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
          <button onclick="copyIdeaToClipboard()" class="export-btn copy-btn" title="Copy to clipboard">
            📋 Copy
          </button>
          <button onclick="downloadIdeaPDF('${(idea.title || "Idea").replace(/'/g, "\\'")}.pdf')" class="export-btn pdf-btn" title="Download as PDF">
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
  const ideaContent = document.getElementById("ideaContent");
  if (!ideaContent) return;

  const text = extractIdeaText(ideaContent);
  
  navigator.clipboard.writeText(text).then(() => {
    showExportNotification("📋 Copied to clipboard!", true);
  }).catch(err => {
    console.error("Failed to copy:", err);
    showExportNotification("Failed to copy", false);
  });
}

function extractIdeaText(ideaElement) {
  let text = "";
  const h2 = ideaElement.querySelector("h2");
  if (h2) text += h2.textContent + "\n\n";

  const sections = ideaElement.querySelectorAll("section");
  sections.forEach(section => {
    const h3 = section.querySelector("h3");
    if (h3) text += h3.textContent + ":\n";
    
    const p = section.querySelector("p");
    const ul = section.querySelector("ul");
    
    if (p) {
      text += p.textContent + "\n";
    } else if (ul) {
      const items = ul.querySelectorAll("li");
      items.forEach(item => {
        text += "• " + item.textContent + "\n";
      });
    }
    text += "\n";
  });

  return text;
}

function downloadIdeaPDF(filename) {
  const ideaContent = document.getElementById("ideaContent");
  if (!ideaContent) return;

  // Create a temporary container to hold the clone
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "fixed";
  tempContainer.style.left = "-9999px";
  tempContainer.style.top = "-9999px";
  tempContainer.style.width = "210mm";
  tempContainer.style.zIndex = "-1";
  
  // Clone the element
  const clone = ideaContent.cloneNode(true);
  
  // Remove export and feedback sections from PDF
  const exportSection = clone.querySelector(".export-section");
  const feedbackSection = clone.querySelector(".feedback");
  if (exportSection) exportSection.remove();
  if (feedbackSection) feedbackSection.remove();
  
  // Add to temporary container
  tempContainer.appendChild(clone);
  document.body.appendChild(tempContainer);

  // Generate PDF with a slight delay to ensure rendering
  setTimeout(() => {
    const opt = {
      margin: [15, 15, 15, 15],
      filename: filename || "idea.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { orientation: "portrait", unit: "mm", format: "a4" }
    };

    html2pdf()
      .set(opt)
      .from(tempContainer)
      .save()
      .then(() => {
        // Clean up
        document.body.removeChild(tempContainer);
        showExportNotification("📄 PDF ready!", true);
      })
      .catch(err => {
        document.body.removeChild(tempContainer);
        showExportNotification("Failed to generate PDF", false);
        console.error("PDF generation error:", err);
      });
  }, 100);
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
