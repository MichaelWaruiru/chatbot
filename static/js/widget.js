(function() {
    // 1. Hardcode your backend URL.
    const API_BASE = "https://ai.co-opmagic.org";
    // 2. Inject Modern Scoped CSS
    const styles = `
      #coop-magic-widget { 
          position: fixed; bottom: 20px; right: 20px; z-index: 9999; 
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      }
      #coop-magic-toggle { 
          background: linear-gradient(135deg, #00a859, #008747); 
          color: white; border: none; border-radius: 50%; 
          width: 60px; height: 60px; cursor: pointer; 
          box-shadow: 0 4px 12px rgba(0, 168, 89, 0.3); 
          font-size: 28px; display: flex; align-items: center; justify-content: center;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      #coop-magic-toggle:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(0, 168, 89, 0.4);
      }
      #coop-magic-chat-container { 
          display: none; width: 360px; height: 550px; 
          background: #ffffff; border-radius: 16px; 
          box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04); 
          flex-direction: column; overflow: hidden; margin-bottom: 15px; 
          border: 1px solid #eaeaea; 
      }
      #coop-magic-header { 
          background: linear-gradient(135deg, #00a859, #008747); 
          color: white; padding: 18px 15px; font-weight: 600; font-size: 16px;
          text-align: center; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          letter-spacing: 0.3px;
      }
      #coop-magic-clear { 
          position: absolute; right: 15px; top: 15px; font-size: 12px; 
          cursor: pointer; background: rgba(255,255,255,0.15); 
          padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.3); 
          color: white; transition: all 0.2s ease; font-weight: 500;
      }
      #coop-magic-clear:hover { background: rgba(255,255,255,0.3); }
      #coop-magic-messages { 
          flex: 1; padding: 20px 15px; overflow-y: auto; display: flex; 
          flex-direction: column; gap: 12px; background: #fafbfc; 
      }
      .message { 
          padding: 12px 16px; border-radius: 18px; max-width: 82%; 
          font-size: 14px; line-height: 1.4; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .message.user { 
          background: #00a859; color: white; align-self: flex-end; 
          border-bottom-right-radius: 4px;
      }
      .message.bot { 
          background: #ffffff; color: #333; align-self: flex-start; 
          border-bottom-left-radius: 4px; border: 1px solid #eee;
      }

      /* TYPING BUBBLE ANIMATION */
      .typing-bubble {
          display: flex; align-items: center; gap: 4px;
          background: #ffffff; padding: 12px 16px;
          border-radius: 18px; width: fit-content;
          border-bottom-left-radius: 4px; border: 1px solid #eee;
      }
      .dot {
          width: 6px; height: 6px; background: #00a859;
          border-radius: 50%; opacity: 0.4;
          animation: blink 1.4s infinite both;
      }
      .dot:nth-child(2) { animation-delay: 0.2s; }
      .dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; transform: scale(1); }
          40% { opacity: 1; transform: scale(1.2); }
      }

      #coop-magic-form { 
          display: flex; border-top: 1px solid #eaeaea; padding: 12px; background: white; 
      }
      #coop-magic-input { 
          flex: 1; padding: 10px 14px; border: 1px solid #ddd; 
          border-radius: 20px; outline: none; transition: border-color 0.2s; 
          font-size: 14px; background: #f9f9f9;
      }
      #coop-magic-input:focus { border-color: #00a859; background: white; }
      #coop-magic-form button { 
          margin-left: 8px; padding: 10px 18px; background: #00a859; 
          color: white; border: none; border-radius: 20px; cursor: pointer; 
          font-weight: 600; transition: background 0.2s ease;
      }
      #coop-magic-form button:hover { background: #008747; }
      .translate-btn { 
          margin-top: 8px; font-size: 11px; cursor: pointer; 
          background: #f0f0f0; border: 1px solid #ddd; padding: 4px 10px; 
          border-radius: 12px; color: #555; transition: all 0.2s ease;
      }
      .translate-btn:hover { background: #e4e4e4; color: #333; }
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
        <header id="coop-magic-header">
            Co-op Magic AI
            <button id="coop-magic-clear" title="Clear Chat History">Clear</button>
        </header>
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
    const clearBtn = document.getElementById("coop-magic-clear");

    let isChatOpen = false;

    // --- STATE MANAGEMENT ---
    let chatHistory = JSON.parse(localStorage.getItem("coop_magic_history")) || [];

    function saveHistory() {
        localStorage.setItem("coop_magic_history", JSON.stringify(chatHistory));
    }

    // --- TYPING INDICATOR HELPERS ---
    function showTyping() {
        const div = document.createElement("div");
        div.id = "coop-magic-typing";
        div.className = "typing-bubble bot";
        div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
        const el = document.getElementById("coop-magic-typing");
        if (el) el.remove();
    }

    toggleBtn.addEventListener("click", () => {
        isChatOpen = !isChatOpen;
        chatContainer.style.display = isChatOpen ? "flex" : "none";
        if (isChatOpen) messages.scrollTop = messages.scrollHeight;
    });

    clearBtn.addEventListener("click", () => {
        if(confirm("Are you sure you want to clear the chat history?")) {
            localStorage.removeItem("coop_magic_history");
            chatHistory = [];
            messages.innerHTML = "";
            addBotMessage({ answer: "👋 Hello! I'm Co-op Magic AI Assistant. Ask me anything about cooperatives in South Sudan." }, false);
        }
    });

    // 5. Rendering Functions
    function addMessage(text, type, saveToHistory = true) {
        const div = document.createElement("div");
        div.className = `message ${type}`;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        if (saveToHistory) {
            chatHistory.push({ role: "user", text: text });
            saveHistory();
        }
    }

    function addBotMessage(data, saveToHistory = true) {
        if (data.answer) {
            const wrapper = document.createElement("div");
            wrapper.className = "message bot";
            
            const content = document.createElement("span");
            content.textContent = data.answer;
            wrapper.appendChild(content);

            const isArabic = /[\u0600-\u06FF]/.test(data.answer);
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
                    const resData = await res.json();
                    content.textContent = resData.translation;
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
        }

        if (data.graphBase64) {
            const img = document.createElement("img");
            img.src = `data:image/png;base64,${data.graphBase64}`;
            img.style.maxWidth = "100%";
            img.style.borderRadius = "8px";
            img.style.marginTop = "10px";
            img.style.border = "1px solid #ccc";
            
            const wrapper = document.createElement("div");
            wrapper.className = "message bot";
            wrapper.appendChild(img);
            messages.appendChild(wrapper);
        }

        if (data.graphSvg) {
            const svgContainer = document.createElement("div");
            svgContainer.innerHTML = data.graphSvg;
            svgContainer.style.maxWidth = "100%";
            svgContainer.style.marginTop = "10px";
            
            const svgElement = svgContainer.querySelector("svg");
            if (svgElement) {
                svgElement.style.width = "100%";
                svgElement.style.height = "auto";
            }
            
            const wrapper = document.createElement("div");
            wrapper.className = "message bot";
            wrapper.appendChild(svgContainer);
            messages.appendChild(wrapper);
        }

        messages.scrollTop = messages.scrollHeight;

        if (saveToHistory) {
            chatHistory.push({ role: "bot", data: data });
            saveHistory();
        }
    }

    if (chatHistory.length > 0) {
        chatHistory.forEach(msg => {
            if (msg.role === "user") {
                addMessage(msg.text, "user", false);
            } else if (msg.role === "bot") {
                addBotMessage(msg.data, false);
            }
        });
    } else {
        addBotMessage({ answer: "👋 Hello! I'm Co-op Magic AI Assistant. Ask me anything about cooperatives in South Sudan." }, false);
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message) return;

        addMessage(message, "user"); 
        input.value = "";
        input.disabled = true;

        showTyping(); // SHOW BUBBLE LOGIC[cite: 1]

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            hideTyping(); // HIDE BUBBLE LOGIC[cite: 1]
            addBotMessage(data); 
        } catch (err) {
            hideTyping(); // HIDE BUBBLE LOGIC[cite: 1]
            addBotMessage({ answer: "Sorry, something went wrong connecting to the server." });
        } finally {
            input.disabled = false;
            input.focus();
        }
    });
})();