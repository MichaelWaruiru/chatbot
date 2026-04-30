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

// Function to add a user message
function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// --- HELPERS FOR DOWNLOADING ---
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
    let val = obj[key] === null ? "" : String(obj[key]);
    return `"${val.replace(/"/g, '""')}"`;
  }).join(","));
  return [header, ...rows].join("\n");
}
// -----------------------------------

// Bot message with translate button, animation, and download options
// Used for non‑streamed messages (initial greeting, offline/online alerts)
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
    img.src = `data:image/png;base64,${graphBase64}`;
    img.className = "chat-graph";
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.marginTop = "10px";
    img.alt = "Data Visualization";
    content.appendChild(img);

    // Download Toolbar
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
        const svgBlob = new Blob([graphSvg], {type: "image/svg+xml;charset=utf-8"});
        btnSvg.onclick = () => downloadFile(URL.createObjectURL(svgBlob), `chart_${timestamp}.svg`);
        toolBar.appendChild(btnSvg);
    }

    // CSV/JSON Data Downloads
    if (vizData && vizData.length > 0) {
        const btnCsv = document.createElement("button");
        btnCsv.textContent = "📥 CSV";
        btnCsv.className = "translate-btn";
        const csvBlob = new Blob([extractCSV(vizData)], {type: "text/csv;charset=utf-8;"});
        btnCsv.onclick = () => downloadFile(URL.createObjectURL(csvBlob), `data_${timestamp}.csv`);
        toolBar.appendChild(btnCsv);

        const btnJson = document.createElement("button");
        btnJson.textContent = "📥 JSON";
        btnJson.className = "translate-btn";
        const jsonBlob = new Blob([JSON.stringify(vizData, null, 2)], {type: "application/json"});
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

  const btn = document.createElement("button");
  btn.className = "translate-btn";
  btn.textContent = isArabic ? "Translate to English" : "Translate to Arabic";

  btn.onclick = async () => {
    if (!textSpan.textContent || textSpan.textContent.trim() === "") {
      alert("Cannot translate graphical content. Only text can be translated.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Translating…";

    try {
      const res = await fetch(`${API_BASE}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textSpan.textContent,
          target_lang: currentLang === "en" ? "Arabic" : "English"
        })
      });

      if (!res.ok) throw new Error("Translation API error");

      const data = await res.json();
      textSpan.textContent = data.translation;

      currentLang = currentLang === "en" ? "ar" : "en";
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

  const dots = document.createElement("span");
  dots.className = "dots";
  dots.textContent = "...";
  wrapper.appendChild(dots);

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;

  return wrapper;
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

// ----------------------------------------------------------------
//  ⚡ STREAMING CHAT SUBMIT (Replaces old non‑streaming handler)
// ----------------------------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (input.disabled) return;

  const message = input.value.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";

  // Offline guard
  if (!navigator.onLine) {
    addBotMessage("You appear to be offline. Please check your internet connection.");
    return;
  }

  disableChatInput();
  const typingElem = addBotTyping();

  // ---- Streaming state ----
  let botWrapper = null;
  let botTextSpan = null;
  let hasRenderedGraph = false;
  let currentLang = "en";   // will be reset based on final text

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error("Server error");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop();   // keep incomplete chunk

      for (const event of events) {
        if (!event.trim()) continue;

        const dataLine = event.split("\n").find(line => line.startsWith("data:"));
        if (!dataLine) continue;

        const jsonStr = dataLine.replace("data: ", "");
        let chunk;
        try {
          chunk = JSON.parse(jsonStr);
        } catch (parseErr) {
          console.warn("JSON parse error for chunk:", parseErr);
          continue;
        }

        // First chunk: create the bot message container
        if (!botWrapper) {
          typingElem.remove();

          botWrapper = document.createElement("div");
          botWrapper.className = "message bot";

          const contentDiv = document.createElement("div");
          contentDiv.className = "bot-text";

          botTextSpan = document.createElement("span");
          contentDiv.appendChild(botTextSpan);
          botWrapper.appendChild(contentDiv);
          messages.appendChild(botWrapper);
        }

        // Append incremental answer text
        if (chunk.answer && botTextSpan) {
          botTextSpan.textContent += chunk.answer;
        }

        // Render graph elements once per response
        if (!hasRenderedGraph && (chunk.graphBase64 || chunk.graphSvg || chunk.vizData)) {
          hasRenderedGraph = true;
          const contentDiv = botWrapper.querySelector(".bot-text");

          if (chunk.graphBase64) {
            const img = document.createElement("img");
            img.src = `data:image/png;base64,${chunk.graphBase64}`;
            img.className = "chat-graph";
            img.style.maxWidth = "100%";
            img.style.borderRadius = "8px";
            img.style.marginTop = "10px";
            img.alt = "Data Visualization";
            contentDiv.appendChild(img);

            // Download toolbar
            const toolBar = document.createElement("div");
            toolBar.style.marginTop = "10px";
            toolBar.style.display = "flex";
            toolBar.style.gap = "8px";
            toolBar.style.flexWrap = "wrap";
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

            const btnPng = document.createElement("button");
            btnPng.textContent = "📥 PNG";
            btnPng.className = "translate-btn";
            btnPng.onclick = () => downloadFile(`data:image/png;base64,${chunk.graphBase64}`, `chart_${timestamp}.png`);
            toolBar.appendChild(btnPng);

            if (chunk.graphSvg) {
              const btnSvg = document.createElement("button");
              btnSvg.textContent = "📥 SVG";
              btnSvg.className = "translate-btn";
              const svgBlob = new Blob([chunk.graphSvg], { type: "image/svg+xml;charset=utf-8" });
              btnSvg.onclick = () => downloadFile(URL.createObjectURL(svgBlob), `chart_${timestamp}.svg`);
              toolBar.appendChild(btnSvg);
            }

            if (chunk.vizData && chunk.vizData.length > 0) {
              const btnCsv = document.createElement("button");
              btnCsv.textContent = "📥 CSV";
              btnCsv.className = "translate-btn";
              const csvBlob = new Blob([extractCSV(chunk.vizData)], { type: "text/csv;charset=utf-8;" });
              btnCsv.onclick = () => downloadFile(URL.createObjectURL(csvBlob), `data_${timestamp}.csv`);
              toolBar.appendChild(btnCsv);

              const btnJson = document.createElement("button");
              btnJson.textContent = "📥 JSON";
              btnJson.className = "translate-btn";
              const jsonBlob = new Blob([JSON.stringify(chunk.vizData, null, 2)], { type: "application/json" });
              btnJson.onclick = () => downloadFile(URL.createObjectURL(jsonBlob), `data_${timestamp}.json`);
              toolBar.appendChild(btnJson);
            }

            contentDiv.appendChild(toolBar);
          }
        }
      }
    }

    // After stream finishes, add the translate button
    if (botWrapper && botTextSpan) {
      const fullText = botTextSpan.textContent;
      const isArabic = /[\u0600-\u06FF]/.test(fullText);
      currentLang = isArabic ? "ar" : "en";

      const btn = document.createElement("button");
      btn.className = "translate-btn";
      btn.textContent = isArabic ? "Translate to English" : "Translate to Arabic";

      btn.onclick = async () => {
        if (!botTextSpan.textContent.trim()) {
          alert("Cannot translate graphical content. Only text can be translated.");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Translating…";
        try {
          const res = await fetch(`${API_BASE}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: botTextSpan.textContent,
              target_lang: currentLang === "en" ? "Arabic" : "English"
            })
          });
          if (!res.ok) throw new Error("Translation failed");
          const data = await res.json();
          botTextSpan.textContent = data.translation;
          currentLang = currentLang === "en" ? "ar" : "en";
          btn.textContent = currentLang === "en" ? "Translate to Arabic" : "Translate to English";
        } catch (err) {
          alert("Translation failed!");
          console.error(err);
        } finally {
          btn.disabled = false;
        }
      };

      botWrapper.appendChild(btn);
    }

    // Fallback if no chunk ever arrived
    if (!botWrapper) {
      typingElem.remove();
      addBotMessage("Received an empty response. Please try again.");
    }

  } catch (err) {
    typingElem.remove();
    if (!navigator.onLine) {
      addBotMessage("You appear to be offline. Please check your internet connection.");
    } else {
      addBotMessage(err.message || "Sorry, something went wrong. Please try again later.");
    }
    console.error(err);
  } finally {
    enableChatInput();
    scrollToBottom();
  }
});