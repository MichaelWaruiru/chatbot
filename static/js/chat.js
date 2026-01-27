const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");

// Base URL automatically includes protocol + host + port
const API_BASE = window.location.origin;

// Function to add a message to the chat window
function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// Bot message with translate button and animation
function addBotMessage(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot";

  const content = document.createElement("div");
  content.className = "bot-text";
  content.textContent = text;

  const btn = document.createElement("button");
  btn.className = "translate-btn";
  btn.textContent = "Translate";

  let translated = false;
  let originalText = text;

  btn.onclick = async () => {
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "Translating…"; // Animation effect

    try {
      const res = await fetch(`${API_BASE}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: translated ? originalText : content.textContent
        })
      });

      const data = await res.json();
      content.textContent = data.translation;
      translated = !translated;
    } catch (err) {
      alert("Translation failed!");
    } finally {
      btn.disabled = false;
      btn.textContent = translated ? "Original" : "Translate";
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = input.value.trim();
  if (!message) return;

  addMessage(message, "user");
  input.value = "";

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

    addBotMessage(data.reply);
  } catch {
    addMessage("Unable to reach the server.", "bot");
  }
});
