// Service worker register
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/static/js/service_worker.js");
    });
}

(function () {
    // 1. Configuration
    const API_BASE = "https://ai.co-opmagic.org";

    const WELCOME_MSG =
        "👋 Hello! I'm Co-op Magic AI Assistant. Ask me anything about cooperatives in South Sudan. I can translate both English and Arabic.";

    // 2. Inject CSS
    const styles = `
        #coop-magic-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
        }

        /* CTA Bubble */
        #coop-magic-cta {
            display: none;
            background: #ffffff;
            color: #333;
            padding: 10px 18px;
            border-radius: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            margin-bottom: 12px;
            font-size: 14px;
            font-weight: 600;
            position: relative;
            border: 1px solid #00a859;
            animation: coop-pop-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            white-space: nowrap;
            cursor: pointer;
        }

        #coop-magic-cta::after {
            content: '';
            position: absolute;
            bottom: -8px;
            right: 20px;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 8px solid #00a859;
        }

        @keyframes coop-pop-in {
            from {
                opacity: 0;
                transform: translateY(15px) scale(0.9);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        #coop-magic-toggle {
            background: linear-gradient(135deg, #00a859, #008747);
            color: white;
            border: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 168, 89, 0.3);
            font-size: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s ease;
        }

        #coop-magic-toggle:hover {
            transform: scale(1.05);
        }

        #coop-magic-chat-container {
            display: none;
            width: 360px;
            height: 550px;
            max-height: calc(100vh - 100px);
            background: hsl(0, 0%, 100%);
            border-radius: 16px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            flex-direction: column;
            overflow: hidden;
            position: absolute;
            bottom: 75px;
            right: 0;
            border: 1px solid #eaeaea;
        }

        #coop-magic-header {
            background: #1a2b3c;
            color: white;
            padding: 12px 15px;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header-controls {
            display: flex;
            gap: 8px;
        }

        #coop-magic-clear,
        #coop-magic-close {
            font-size: 11px;
            cursor: pointer;
            background: rgba(255,255,255,0.15);
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
        }

        #coop-magic-messages {
            flex: 1;
            padding: 15px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: #f3f4f6;
        }

        .message {
            padding: 10px 14px;
            border-radius: 15px;
            max-width: 85%;
            font-size: 14px;
            line-height: 1.4;
            word-wrap: break-word;
        }

        .message.user {
            background: #2563eb;
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }

        .message.bot {
            background: hsl(220, 13%, 91%);
            color: #333;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            border: 1px solid #eee;
        }

        .message.typing {
            font-style: italic;
            color: #888;
            background: transparent;
            border: none;
        }

        #coop-magic-form {
            display: flex;
            border-top: 1px solid #eaeaea;
            padding: 12px;
            background: white;
            gap: 8px;
        }

        #coop-magic-input {
            flex: 1;
            padding: 10px 15px;
            border: 1px solid #ddd;
            border-radius: 20px;
            outline: none;
            font-size: 14px;
        }

        #coop-magic-form button {
            padding: 8px 15px;
            background: #00a859;
            color: white;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
        }

        .translate-btn {
            margin-top: 8px;
            font-size: 11px;
            cursor: pointer;
            background: #00a859;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 10px;
        }

        .chat-graph {
            max-width: 100%;
            border-radius: 8px;
            margin-top: 10px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }

        .download-toolbar {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
            margin-top: 8px;
        }

        .bot-text span {
            transition: opacity 0.3s ease-in-out;
        }

        .fade-out {
            opacity: 0;
        }

        @keyframes blink {
            0% { opacity: .2; }
            20% { opacity: 1; }
            100% { opacity: .2; }
        }

        .dots {
            animation: blink 1.4s infinite both;
        }

        @media (max-width: 400px) {
            #coop-magic-chat-container {
                width: calc(100vw - 40px);
                right: 0;
                }
        }

        .typing-bubble {
            display: flex;
            gap: 5px;
            align-items: center;
            padding: 6px 10px;
        }

        .typing-dot {
            width: 7px;
            height: 7px;
            background: #888;
            border-radius: 50%;
            animation: typingBounce 1.2s infinite ease-in-out;
        }

        .typing-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .typing-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes typingBounce {
            0%, 80%, 100% {
                transform: scale(0.6);
                opacity: 0.4;
            }
            40% {
                transform: scale(1);
                opacity: 1;
            }
        }

        .typing-indicator {
            background: hsl(220, 13%, 91%);
            align-self: flex-start;
            border-radius: 15px;
            border: 1px solid #eee;
        }

        /* Disabled input state */
        #coop-magic-input:disabled {
            background: #f1f1f1;
            color: #999;
            cursor: not-allowed;
            opacity: 0.7;
        }

        /* Disabled send button */
        #coop-magic-send-btn:disabled {
            background: #a5d6b4;
            cursor: not-allowed;
            opacity: 0.6;
            pointer-events: none;
        }

        /* Optional: remove hover effect when disabled */
        #coop-magic-send-btn:disabled:hover {
            transform: none;
            box-shadow: none;
        }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // 3. Inject HTML Structure
    const widgetContainer = document.createElement("div");
    widgetContainer.id = "coop-magic-widget";
    widgetContainer.innerHTML = `
      <div id="coop-magic-cta">Chat with us!</div>
      <div id="coop-magic-chat-container">
        <header id="coop-magic-header">
            <span>Co-op Magic AI</span>

            <div class="header-controls">
                <button id="coop-magic-clear">Clear</button>
                <button id="coop-magic-close">✕</button>
            </div>
        </header>

        <div id="coop-magic-messages"></div>

        <form id="coop-magic-form">
          <input
              type="text"
              id="coop-magic-input"
              placeholder="Ask a question..."
              autocomplete="off"
              required
          />

          <button type="submit" id="coop-magic-send-btn">
              Send
          </button>
        </form>
      </div>

      <button id="coop-magic-toggle">💬</button>
    `;

    document.body.appendChild(widgetContainer);

    // 4. DOM Elements
    const toggleBtn = document.getElementById("coop-magic-toggle");
    const closeBtn = document.getElementById("coop-magic-close");
    const ctaBubble = document.getElementById("coop-magic-cta");
    const chatContainer = document.getElementById("coop-magic-chat-container");
    const form = document.getElementById("coop-magic-form");
    const input = document.getElementById("coop-magic-input");
    const messages = document.getElementById("coop-magic-messages");
    const clearBtn = document.getElementById("coop-magic-clear");

    let isChatOpen = false;

    let chatHistory =
        JSON.parse(localStorage.getItem("coop_magic_history")) || [];

    // Helpers
    function saveHistory() {
        localStorage.setItem(
            "coop_magic_history",
            JSON.stringify(chatHistory)
        );
    }

    function scrollToBottom() {
        messages.scrollTop = messages.scrollHeight;
    }

    function disableInput() {
        input.disabled = true;
    }

    function enableInput() {
        input.disabled = false;
        input.focus();
    }

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
        }
    }

    function extractCSV(data) {
        if (!data || !data.length) return "";

        const keys = Object.keys(data[0]);

        const header = keys.join(",");

        const rows = data.map((obj) =>
            keys
                .map((key) => {
                    let val =
                        obj[key] === null
                            ? ""
                            : String(obj[key]);

                    return `"${val.replace(/"/g, '""')}"`;
                })
                .join(",")
        );

        return [header, ...rows].join("\n");
    }

    // Add normal message
    function addMessage(text, type, saveToHistory = true) {
        const div = document.createElement("div");

        div.className = `message ${type}`;

        div.textContent = text;

        messages.appendChild(div);

        scrollToBottom();

        if (saveToHistory) {
            chatHistory.push({
                role: type,
                text,
            });

            saveHistory();
        }
    }

    // Bot typing
    function addBotTyping() {
        const wrapper = document.createElement("div");
        wrapper.className = "message bot typing-indicator";

        const bubble = document.createElement("div");
        bubble.className = "typing-bubble";

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement("span");
            dot.className = "typing-dot";
            bubble.appendChild(dot);
        }

        wrapper.appendChild(bubble);
        messages.appendChild(wrapper);

        scrollToBottom();

        return wrapper;
    }

    // Main bot message renderer
    function addBotMessage(data, saveToHistory = true) {
        const wrapper = document.createElement("div");
        wrapper.className = "message bot";
        const content = document.createElement("div");
        content.className = "bot-text";
        const textSpan = document.createElement("span");
        const answer = data.answer || "";

        const graphBase64 =
            data.graphBase64 || data.graph_base64;

        const graphSvg =
            data.graphSvg || data.graph_svg;

        const vizData =
            data.vizData || data.viz_data;

        textSpan.textContent = answer;

        content.appendChild(textSpan);

        // Image support
        if (graphBase64) {
            const img = document.createElement("img");

            img.src = `data:image/png;base64,${graphBase64}`;

            img.className = "chat-graph";

            img.alt = "Chart";

            content.appendChild(img);

            const toolBar = document.createElement("div");

            toolBar.className = "download-toolbar";

            const timestamp = Date.now();

            // PNG
            const pngBtn = document.createElement("button");

            pngBtn.className = "translate-btn";

            pngBtn.textContent = "📥 PNG";

            pngBtn.onclick = () => {
                downloadFile(
                    `data:image/png;base64,${graphBase64}`,
                    `chart_${timestamp}.png`
                );
            };

            toolBar.appendChild(pngBtn);

            // SVG
            if (graphSvg) {
                const svgBtn =
                    document.createElement("button");

                svgBtn.className = "translate-btn";

                svgBtn.textContent = "📥 SVG";

                svgBtn.onclick = () => {
                    const blob = new Blob(
                        [graphSvg],
                        {
                            type: "image/svg+xml",
                        }
                    );

                    downloadFile(
                        URL.createObjectURL(blob),
                        `chart_${timestamp}.svg`
                    );
                };

                toolBar.appendChild(svgBtn);
            }

            // CSV
            if (vizData && vizData.length > 0) {
                const csvBtn =
                    document.createElement("button");

                csvBtn.className = "translate-btn";

                csvBtn.textContent = "📥 CSV";

                csvBtn.onclick = () => {
                    const blob = new Blob(
                        [extractCSV(vizData)],
                        {
                            type: "text/csv",
                        }
                    );

                    downloadFile(
                        URL.createObjectURL(blob),
                        `data_${timestamp}.csv`
                    );
                };

                toolBar.appendChild(csvBtn);
            }

            content.appendChild(toolBar);
        }

        wrapper.appendChild(content);

        // Translation support
        if (answer) {
            const originalText = answer;

            const isArabic =
                /[\u0600-\u06FF]/.test(originalText);

            let currentLang = isArabic ? "ar" : "en";

            const translations = {
                en: isArabic ? null : originalText,
                ar: isArabic ? originalText : null,
            };

            const tBtn =
                document.createElement("button");

            tBtn.className = "translate-btn";

            tBtn.textContent = isArabic
                ? "Translate to English"
                : "Translate to Arabic";

            const updateTextWithAnimation = (
                newText
            ) => {
                textSpan.classList.add("fade-out");

                setTimeout(() => {
                    textSpan.textContent = newText;

                    textSpan.classList.remove(
                        "fade-out"
                    );
                }, 300);
            };

            tBtn.onclick = async () => {
                if (
                    !originalText ||
                    originalText.trim() === ""
                ) {
                    return;
                }

                tBtn.disabled = true;

                const targetLang =
                    currentLang === "en"
                        ? "ar"
                        : "en";

                const originalBtnText =
                    tBtn.textContent;

                tBtn.textContent =
                    "Translating...";

                try {
                    // Use cache first
                    if (
                        translations[targetLang]
                    ) {
                        updateTextWithAnimation(
                            translations[targetLang]
                        );
                    } else {
                        const res = await fetch(
                            `${API_BASE}/translate`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                },
                                body: JSON.stringify({
                                    text: originalText,
                                    target_lang:
                                        targetLang ===
                                        "en"
                                            ? "English"
                                            : "Arabic",
                                }),
                            }
                        );

                        if (!res.ok) {
                            throw new Error(
                                "Translation failed"
                            );
                        }

                        const resData =
                            await res.json();

                        translations[
                            targetLang
                        ] = resData.translation;

                        updateTextWithAnimation(
                            resData.translation
                        );
                    }

                    currentLang = targetLang;

                    tBtn.textContent =
                        currentLang === "en"
                            ? "Translate to Arabic"
                            : "Translate to English";
                } catch (err) {
                    console.error(err);

                    tBtn.textContent =
                        "Translation failed";

                    setTimeout(() => {
                        tBtn.textContent =
                            originalBtnText;
                    }, 2000);
                } finally {
                    tBtn.disabled = false;
                }
            };

            wrapper.appendChild(tBtn);
        }

        messages.appendChild(wrapper);

        scrollToBottom();

        if (saveToHistory) {
            chatHistory.push({
                role: "bot",
                data,
            });

            saveHistory();
        }
    }

    // Toggle widget
    function toggleChat() {
        isChatOpen = !isChatOpen;

        chatContainer.style.display =
            isChatOpen ? "flex" : "none";

        ctaBubble.style.display =
            isChatOpen ? "none" : "block";

        if (isChatOpen) {
            input.focus();
        }
    }

    // Events
    toggleBtn.addEventListener("click", toggleChat);

    closeBtn.addEventListener("click", toggleChat);

    ctaBubble.addEventListener("click", toggleChat);

    clearBtn.addEventListener("click", () => {
        if (confirm("Clear chat history?")) {
            localStorage.removeItem(
                "coop_magic_history"
            );

            chatHistory = [];

            messages.innerHTML = "";

            addBotMessage(
                {
                    answer: WELCOME_MSG,
                },
                false
            );
        }
    });

    // Submit
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (input.disabled) return;

        const msg = input.value.trim();

        if (!msg) return;

        addMessage(msg, "user");

        input.value = "";

        // Offline
        if (!navigator.onLine) {
            addBotMessage({
                answer:
                    "You appear to be offline.",
            });

            return;
        }

        disableInput();

        const typing = addBotTyping();

        try {
            const res = await fetch(
                `${API_BASE}/chat`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        message: msg,
                    }),
                }
            );

            if (!res.ok) {
                throw new Error(
                    "Server error"
                );
            }

            const data = await res.json();

            typing.remove();

            addBotMessage(data);
        } catch (err) {
            typing.remove();

            console.error(err);

            addBotMessage({
                answer:
                    err.message ||
                    "Something went wrong.",
            });
        } finally {
            enableInput();
        }
    });

    // Online/offline listeners
    window.addEventListener("offline", () => {
        addBotMessage({
            answer:
                "You are offline. Some features may not work.",
        });
    });

    window.addEventListener("online", () => {
        addBotMessage({
            answer: "Connection restored.",
        });
    });

    // Initial CTA
    setTimeout(() => {
        if (!isChatOpen) {
            ctaBubble.style.display = "block";
        }
    }, 1500);

    // Initial greeting
    addBotMessage(
        {
            answer: WELCOME_MSG,
        },
        false
    );

    // Restore history
    if (chatHistory.length > 0) {
        chatHistory.forEach((m) => {
            if (m.role === "user") {
                addMessage(
                    m.text,
                    "user",
                    false
                );
            } else {
                addBotMessage(
                    m.data,
                    false
                );
            }
        });
    }
})();