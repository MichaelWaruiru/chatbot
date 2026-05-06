// Service worker register
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/static/js/service_worker.js");
  });
}

// Dom elements
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const submitBtn = document.querySelector("button");

// Base URL automatically includes protocol + host + port
const API_BASE = window.location.origin;

// Input locking
function disableChatInput() {
  input.disabled = true;
  submitBtn.disabled = true;
}

function enableChatInput() {
  input.disabled = false;
  submitBtn.disabled = false;
  input.focus();
}

// Message rendering
function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// Function to add a message to the chat window
function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// --- NEW HELPERS FOR DOWNLOADING ---
function downloadFile(url, filename) {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error("Download failed:", err);
    alert("Failed to download file.");
  }
}

function extractCSV(data) {
  if (!data || !data.length) return "";
  const keys = Object.keys(data[0]);
  const header = keys.join(",");
  const rows = data.map(obj => keys.map(key => {
    // Escape quotes to prevent CSV breakage
    let val = obj[key] === null ? "" : String(obj[key]);
    return `"${val.replace(/"/g, '""')}"`;
  }).join(","));
  return [header, ...rows].join("\n");
}

// Bot message with translate button, animation, and download options
function addBotMessage(text, graphBase64, graphSvg, vizData) {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot";

  const content = document.createElement("div");
  content.className = "bot-text";

  const textSpan = document.createElement("span");
  content.appendChild(textSpan);

  // Check for image URL in text
  if (graphBase64) {
    const img = document.createElement("img");
    img.src = `data:image/png;base64,${graphBase64}`; // Use the base64 string directly as the image source
    img.className = "chat-graph";
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.marginTop = "10px";
    img.alt = "Data Visualization";
    content.appendChild(img);

    // --- NEW: Download Toolbar ---
    const toolBar = document.createElement("div");
    toolBar.style.marginTop = "10px";
    toolBar.style.display = "flex";
    toolBar.style.gap = "8px";
    toolBar.style.flexWrap = "wrap";

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // PNG Download
    const btnPng = document.createElement("button");
    btnPng.textContent = "📥 PNG";
    btnPng.className = "translate-btn";
    btnPng.onclick = () => downloadFile(`data:image/png;base64,${graphBase64}`, `chart_${timestamp}.png`);
    toolBar.appendChild(btnPng);

    // SVG Download
    if (graphSvg) {
      const btnSvg = document.createElement("button");
      btnSvg.textContent = "📥 SVG";
      btnSvg.className = "translate-btn";
      const svgBlob = new Blob([graphSvg], { type: "image/svg+xml;charset=utf-8" });
      btnSvg.onclick = () => downloadFile(URL.createObjectURL(svgBlob), `chart_${timestamp}.svg`);
      toolBar.appendChild(btnSvg);
    }

    // CSV/JSON Data Downloads
    if (vizData && vizData.length > 0) {
      const btnCsv = document.createElement("button");
      btnCsv.textContent = "📥 CSV";
      btnCsv.className = "translate-btn";
      const csvBlob = new Blob([extractCSV(vizData)], { type: "text/csv;charset=utf-8;" });
      btnCsv.onclick = () => downloadFile(URL.createObjectURL(csvBlob), `data_${timestamp}.csv`);
      toolBar.appendChild(btnCsv);

      const btnJson = document.createElement("button");
      btnJson.textContent = "📥 JSON";
      btnJson.className = "translate-btn";
      const jsonBlob = new Blob([JSON.stringify(vizData, null, 2)], { type: "application/json" });
      btnJson.onclick = () => downloadFile(URL.createObjectURL(jsonBlob), `data_${timestamp}.json`);
      toolBar.appendChild(btnJson);
    }

    content.appendChild(toolBar);
  } else {
    textSpan.textContent = text;
  }

  // Language detection (Arabic regex)
  const isArabic = /[\u0600-\u06FF]/.test(text);
  let currentLang = isArabic ? "ar" : "en";

  // Cache original text - This prevents re-translation drift
  const originalText = text;
  const translations = {
    "en": text,
    "ar": null  // Will be fetched on first translate
  };

  const btn = document.createElement("button");
  btn.className = "translate-btn";
  btn.textContent = isArabic ? "Translate to English" : "Translate to Arabic";

  btn.onclick = async () => {
    // If there's no text to translate, alert user
    if (!textSpan.textContent || textSpan.textContent.trim() === "") {
      alert("Cannot translate graphical content. Only text can be translated.");
      return;
    }
    btn.disabled = true;
    const targetLang = currentLang === "en" ? "ar" : "en";
    btn.textContent = "Translating…";

    try {
      // If we already have this translation cached, use it
      if (translations[targetLang]) {
        textSpan.textContent = translations[targetLang];
      } else {
        // Fetch new translation
        const res = await fetch(`${API_BASE}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: originalText,  // Always translate from ORIGINAL, not current
            target_lang: targetLang === "en" ? "English" : "Arabic"
          })
        });

        if (!res.ok) throw new Error("Translation API error");

        const data = await res.json();

        // Cache this translation
        translations[targetLang] = data.translation;
        textSpan.textContent = data.translation;
      }

      // Toggle language state
      currentLang = targetLang;
      btn.textContent = currentLang === "en" ? "Translate to Arabic" : "Translate to English";

    } catch (err) {
      alert("Translation failed!");
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  };

  wrapper.appendChild(content);
  wrapper.appendChild(btn);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

// Function to show bot typing indicator
function addBotTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot typing";
  wrapper.textContent = "Co-op Magic AI Assistant is typing";

  // Add animated dots
  const dots = document.createElement("span");
  dots.className = "dots";
  dots.textContent = "...";
  wrapper.appendChild(dots);

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;

  return wrapper; // Return so we can remove it later
}

// Initial greeting when chatbot loads
window.addEventListener("DOMContentLoaded", () => {
  addBotMessage("👋 Hello! I'm Co-op Magic AI Assistant. Ask me anything about cooperatives in South Sudan. I can translate both English and Arabic.");
});

window.addEventListener("offline", () => {
  addBotMessage("You are currently offline. Some features may not work.");
});

window.addEventListener("online", () => {
  addBotMessage("Connection restored.");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (input.disabled) return; // Prevent multiple submissions

  const message = input.value.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";

  // Detect offline BEFORE request
  if (!navigator.onLine) {
    addBotMessage("You appear to be offline. Please check your internet connection.");
    return;
  }

  disableChatInput(); // Disable input while waiting for response

  // Show typing indicator
  const typingElem = addBotTyping();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    if (!res.ok) {
      throw new Error("Server error");
    }

    const data = await res.json();

    // Remove typing indicator
    typingElem.remove();

    enableChatInput(); // Re-enable input

    // UPDATED: Pass the additional data points into the rendering function
    addBotMessage(data.answer, data.graphBase64, data.graphSvg, data.vizData);

  } catch (err) {
    typingElem.remove();
    enableChatInput();

    if (!navigator.onLine) {
      addBotMessage("You appear to be offline. Please check your internet connection.", "bot");
      console.error(err);
    } else {
      addBotMessage(err.message || "Sorry, something went wrong. Please try again later.", "bot");
    }
    console.error(err);
  }
});