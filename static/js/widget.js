(function() {
    // 1. Hardcode your backend URL.
    const API_BASE = "https://ai.co-opmagic.org";   // FIXED: http:// not ttp://
    // 2. Inject Modern Scoped CSS (unchanged, kept as is)
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
      .typing-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 16px 18px;
          background: #ffffff;
          border: 1px solid #eee;
          border-radius: 18px;
          border-bottom-left-radius: 4px;
          max-width: fit-content;
          align-self: flex-start;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .typing-indicator .dot {
          width: 8px;
          height: 8px;
          background-color: #00a859;
          border-radius: 50%;
          opacity: 0.4;
          animation: rainDropPulse 1.2s infinite ease-in-out;
      }
      .typing-indicator .dot:nth-child(1) { animation-delay: 0s; }
      .typing-indicator .dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-indicator .dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes rainDropPulse {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { transform: translateY(-4px) scale(1.1); opacity: 1; }
      }
      
      #coop-magic-form button:disabled {
          background: #80d4ac;
          cursor: not-allowed;
      }
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

    // Helper to create download toolbar (used both when graph first arrives)
    function addDownloadToolbar(parentDiv, graphBase64, graphSvg, vizData) {
        const toolBar = document.createElement("div");
        toolBar.style.marginTop = "10px";
        toolBar.style.display = "flex";
        toolBar.style.gap = "8px";
        toolBar.style.flexWrap = "wrap";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        const btnPng = document.createElement("button");
        btnPng.textContent = "📥 PNG";
        btnPng.className = "translate-btn";
        btnPng.onclick = () => {
            const a = document.createElement("a");
            a.href = `data:image/png;base64,${graphBase64}`;
            a.download = `chart_${timestamp}.png`;
            a.click();
        };
        toolBar.appendChild(btnPng);

        if (graphSvg) {
            const btnSvg = document.createElement("button");
            btnSvg.textContent = "📥 SVG";
            btnSvg.className = "translate-btn";
            const svgBlob = new Blob([graphSvg], {type: "image/svg+xml;charset=utf-8"});
            btnSvg.onclick = () => {
                const url = URL.createObjectURL(svgBlob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `chart_${timestamp}.svg`;
                a.click();
                URL.revokeObjectURL(url);
            };
            toolBar.appendChild(btnSvg);
        }

        if (vizData && vizData.length > 0) {
            const csvHeader = Object.keys(vizData[0]).join(",");
            const csvRows = vizData.map(row =>
                Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
            );
            const csvContent = [csvHeader, ...csvRows].join("\n");

            const btnCsv = document.createElement("button");
            btnCsv.textContent = "📥 CSV";
            btnCsv.className = "translate-btn";
            btnCsv.onclick = () => {
                const blob = new Blob([csvContent], {type: "text/csv;charset=utf-8;"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `data_${timestamp}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            };
            toolBar.appendChild(btnCsv);

            const btnJson = document.createElement("button");
            btnJson.textContent = "📥 JSON";
            btnJson.className = "translate-btn";
            btnJson.onclick = () => {
                const blob = new Blob([JSON.stringify(vizData, null, 2)], {type: "application/json"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `data_${timestamp}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };
            toolBar.appendChild(btnJson);
        }

        parentDiv.appendChild(toolBar);
    }

    // ** NON‑STREAMED bot message (used for cached/history/greetings) **
    function addBotMessage(data, saveToHistory = true) {
        if (!data || (!data.answer && !data.graphBase64 && !data.graphSvg)) return;

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
            const wrapper = document.createElement("div");
            wrapper.className = "message bot";
            const img = document.createElement("img");
            img.src = `data:image/png;base64,${data.graphBase64}`;
            img.style.maxWidth = "100%";
            img.style.borderRadius = "8px";
            img.style.marginTop = "10px";
            img.style.border = "1px solid #ccc";
            wrapper.appendChild(img);
            addDownloadToolbar(wrapper, data.graphBase64, data.graphSvg, data.vizData);
            messages.appendChild(wrapper);
        }

        if (data.graphSvg && !data.graphBase64) {
            const wrapper = document.createElement("div");
            wrapper.className = "message bot";
            const svgContainer = document.createElement("div");
            svgContainer.innerHTML = data.graphSvg;
            svgContainer.style.maxWidth = "100%";
            svgContainer.style.marginTop = "10px";
            const svgEl = svgContainer.querySelector("svg");
            if (svgEl) {
                svgEl.style.width = "100%";
                svgEl.style.height = "auto";
            }
            wrapper.appendChild(svgContainer);
            addDownloadToolbar(wrapper, null, data.graphSvg, data.vizData);
            messages.appendChild(wrapper);
        }

        messages.scrollTop = messages.scrollHeight;

        if (saveToHistory) {
            chatHistory.push({ role: "bot", data: data });
            saveHistory();
        }
    }

    // 6. Load chat history on startup
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

    // 7. Form submit: supports both cached (non‑streamed) and streamed responses
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const message = input.value.trim();
        if (!message) return;

        addMessage(message, "user");
        input.value = "";
        
        input.disabled = true;
        const submitBtn = form.querySelector("button[type='submit']");
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Wait...";

        const typingDiv = document.createElement("div");
        typingDiv.className = "typing-indicator";
        typingDiv.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        messages.appendChild(typingDiv);
        messages.scrollTop = messages.scrollHeight;

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });

            const contentType = res.headers.get("content-type") || "";

            // === CACHED / CHITCHAT RESPONSE (non‑streamed) ===
            if (contentType.includes("application/json")) {
                const data = await res.json();
                typingDiv.remove();
                addBotMessage(data);
            }
            // === STREAMING RESPONSE (text/event-stream) ===
            else if (contentType.includes("text/event-stream")) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let botWrapper = null;
                let botTextSpan = null;
                let graphRendered = false;
                let buffer = "";

                // Helper to add translate button once at end
                function addTranslateButtonToStreamedBot() {
                    if (!botTextSpan) return;
                    const fullText = botTextSpan.textContent;
                    const isArabic = /[\u0600-\u06FF]/.test(fullText);
                    let currentLang = isArabic ? "ar" : "en";
                    const btn = document.createElement("button");
                    btn.className = "translate-btn";
                    btn.textContent = isArabic ? "Translate to English" : "Translate to Arabic";
                    btn.onclick = async () => {
                        btn.disabled = true;
                        btn.textContent = "Translating...";
                        try {
                            const resp = await fetch(`${API_BASE}/translate`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    text: botTextSpan.textContent,
                                    target_lang: currentLang === "en" ? "Arabic" : "English"
                                })
                            });
                            const respData = await resp.json();
                            botTextSpan.textContent = respData.translation;
                            currentLang = currentLang === "en" ? "ar" : "en";
                            btn.textContent = currentLang === "en" ? "Translate to Arabic" : "Translate to English";
                        } catch (err) {
                            console.error(err);
                            btn.textContent = "Error";
                        } finally {
                            btn.disabled = false;
                        }
                    };
                    botWrapper.appendChild(btn);
                }

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const events = buffer.split("\n\n");
                    buffer = events.pop();

                    for (const event of events) {
                        if (!event.trim()) continue;
                        const dataLine = event.split("\n").find(line => line.startsWith("data:"));
                        if (!dataLine) continue;
                        let chunk;
                        try {
                            chunk = JSON.parse(dataLine.replace("data: ", ""));
                        } catch (e) {
                            console.warn("Stream parse error:", e);
                            continue;
                        }

                        // First chunk: remove typing indicator, create bot bubble
                        if (!botWrapper) {
                            typingDiv.remove();
                            botWrapper = document.createElement("div");
                            botWrapper.className = "message bot";

                            const contentDiv = document.createElement("div");
                            contentDiv.className = "bot-text";
                            botTextSpan = document.createElement("span");
                            contentDiv.appendChild(botTextSpan);
                            botWrapper.appendChild(contentDiv);
                            messages.appendChild(botWrapper);
                        }

                        // Append text
                        if (chunk.answer && botTextSpan) {
                            botTextSpan.textContent += chunk.answer;
                        }

                        // Graph – render once
                        if (!graphRendered && (chunk.graphBase64 || chunk.graphSvg || chunk.vizData)) {
                            graphRendered = true;
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
                                addDownloadToolbar(contentDiv, chunk.graphBase64, chunk.graphSvg, chunk.vizData);
                            } else if (chunk.graphSvg) {
                                const svgDiv = document.createElement("div");
                                svgDiv.innerHTML = chunk.graphSvg;
                                svgDiv.style.maxWidth = "100%";
                                svgDiv.style.marginTop = "10px";
                                const svgEl = svgDiv.querySelector("svg");
                                if (svgEl) {
                                    svgEl.style.width = "100%";
                                    svgEl.style.height = "auto";
                                }
                                contentDiv.appendChild(svgDiv);
                                addDownloadToolbar(contentDiv, null, chunk.graphSvg, chunk.vizData);
                            }
                        }

                        messages.scrollTop = messages.scrollHeight;
                    }
                }

                // After stream ends, add translate button and save history
                if (botWrapper) {
                    addTranslateButtonToStreamedBot();
                    // Save to history with final state
                    const finalData = {
                        answer: botTextSpan.textContent,
                        graphBase64: graphRendered ? (botWrapper.querySelector("img")?.src.split(",")[1] || null) : null,
                        // Note: we don't easily preserve SVG/viz data for history, but it's okay for now
                    };
                    chatHistory.push({ role: "bot", data: finalData });
                    saveHistory();
                } else {
                    // If no bot content, show fallback
                    addBotMessage({ answer: "Received an empty response." });
                }
            }
            // === UNKNOWN CONTENT TYPE ===
            else {
                typingDiv.remove();
                const text = await res.text();
                addBotMessage({ answer: text || "Unexpected response format." });
            }
        } catch (err) {
            typingDiv.remove();
            addBotMessage({ answer: "Sorry, something went wrong connecting to the server." });
            console.error(err);
        } finally {
            input.disabled = false;
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
            input.focus();
        }
    });
})();