(function() {
    // 1. Hardcode your backend URL. 
    const API_BASE = "http://184.174.36.49:5000"; 

    // 2. Inject Scoped CSS
    const styles = `
      #coop-magic-widget { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: sans-serif; }
      #coop-magic-toggle { background: #007bff; color: white; border: none; border-radius: 50%; width: 60px; height: 60px; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 24px;}
      #coop-magic-chat-container { display: none; width: 350px; height: 500px; background: white; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); flex-direction: column; overflow: hidden; margin-bottom: 15px; border: 1px solid #ccc; }
      #coop-magic-header { background: #007bff; color: white; padding: 15px; font-weight: bold; text-align: center; }
      #coop-magic-messages { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
      .message { padding: 10px; border-radius: 8px; max-width: 80%; }
      .message.user { background: #e0f7fa; align-self: flex-end; }
      .message.bot { background: #f1f1f1; align-self: flex-start; }
      #coop-magic-form { display: flex; border-top: 1px solid #eee; padding: 10px; }
      #coop-magic-input { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; outline: none; }
      #coop-magic-form button { margin-left: 8px; padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
      .translate-btn { margin-top: 5px; font-size: 12px; cursor: pointer; background: #ddd; border: none; padding: 4px 8px; border-radius: 4px;}
    `;
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // 3. Inject HTML Structure
    const widgetContainer = document.createElement("div");
    widgetContainer.id = "coop-magic-widget";
    widgetContainer.innerHTML = `
      <div id="coop-magic-chat-container">
        <header id="coop-magic-header">Co-op Magic AI Assistant</header>
        <div id="coop-magic-messages"></div>
        <form id="coop-magic-form">
          <input type="text" id="coop-magic-input" placeholder="Ask a question..." autocomplete="off" required />
          <button type="submit">Send</button>
        </form>
      </div>
      <button id="coop-magic-toggle">💬</button>
    `;
    document.body.appendChild(widgetContainer);

    // 4. Widget Logic & DOM Elements
    const toggleBtn = document.getElementById("coop-magic-toggle");
    const chatContainer = document.getElementById("coop-magic-chat-container");
    const form = document.getElementById("coop-magic-form");
    const input = document.getElementById("coop-magic-input");
    const messages = document.getElementById("coop-magic-messages");

    let isChatOpen = false;

    toggleBtn.addEventListener("click", () => {
        isChatOpen = !isChatOpen;
        chatContainer.style.display = isChatOpen ? "flex" : "none";
        if (isChatOpen && messages.children.length === 0) {
            addBotMessage("👋 Hello! I'm Co-op Magic AI Assistant. Ask me anything about cooperatives in South Sudan.");
        }
    });

    // 5. Ported API Logic (Adapted from your chat.js)
    function addMessage(text, type) {
        const div = document.createElement("div");
        div.className = `message ${type}`;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    function addBotMessage(text) {
        const wrapper = document.createElement("div");
        wrapper.className = "message bot";
        
        const content = document.createElement("span");
        content.textContent = text;
        wrapper.appendChild(content);

        // Include your existing translation logic here
        const isArabic = /[\u0600-\u06FF]/.test(text);
        let currentLang = isArabic ? "ar" : "en";
        const btn = document.createElement("button");
        btn.className = "translate-btn";
        btn.textContent = isArabic ? "Translate to English" : "Translate to Arabic";
        
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = "Translating...";
            try {
                const res = await fetch(`${API_BASE}/translate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: content.textContent,
                        target_lang: currentLang === "en" ? "Arabic" : "English"
                    })
                });
                const data = await res.json();
                content.textContent = data.translation;
                currentLang = currentLang === "en" ? "ar" : "en";
                btn.textContent = currentLang === "en" ? "Translate to Arabic" : "Translate to English";
            } catch (err) {
                console.error(err);
                btn.textContent = "Error";
            } finally {
                btn.disabled = false;
            }
        };

        wrapper.appendChild(document.createElement("br"));
        wrapper.appendChild(btn);
        messages.appendChild(wrapper);
        messages.scrollTop = messages.scrollHeight;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message) return;

        addMessage(message, "user");
        input.value = "";
        input.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            
            // Add existing graph/svg handling from your chat.js here if needed
            addBotMessage(data.answer); 
        } catch (err) {
            addBotMessage("Sorry, something went wrong.");
        } finally {
            input.disabled = false;
            input.focus();
        }
    });
})();
