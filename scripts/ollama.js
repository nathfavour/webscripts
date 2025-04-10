// ==UserScript==
// @name            Ollama Sidepanel Chat
// @namespace       nathfavour
// @version         0.1.0
// @description     Opens a sidepanel to chat with locally running Ollama gemma:3b model
// @author          nath
// @license         MIT
// @match           *://*/*
// @exclude         http://localhost:11434/*
// @grant           GM_addStyle
// @grant           GM_xmlhttpRequest
// @connect         localhost
// @run-at          document-idle
// @homepage        https://gitlab.com/nathfavour/webscripts
// ==/UserScript==

(function() {
    'use strict';
    
    // Configuration
    const config = {
        modelName: "gemma:3b",
        apiBaseUrl: "http://localhost:11434",
        panelWidth: "350px",
        initialPrompt: "Hello! I'm a locally running Ollama model. How can I help you today?",
        maxTokens: 4096,
        temperature: 0.7,
        systemPrompt: "You are a helpful AI assistant running locally via Ollama.",
        availableModels: [],
        showModelSelector: false
    };
    
    // Add styles for the sidepanel with improved contrast and readability
    GM_addStyle(`
        #ollama-sidepanel {
            position: fixed;
            top: 0;
            right: 0;
            width: ${config.panelWidth};
            height: 100vh;
            background-color: #ffffff;
            box-shadow: -3px 0 10px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            transition: transform 0.3s ease;
            font-family: 'Segoe UI', Arial, sans-serif;
            transform: translateX(${config.panelWidth});
            border-left: 1px solid #1a1a1a;
        }
        
        #ollama-sidepanel.visible {
            transform: translateX(0);
        }
        
        #ollama-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 15px;
            background-color: #2c3e50;
            color: white;
            border-bottom: 2px solid #1abc9c;
        }
        
        #ollama-title {
            font-weight: bold;
            font-size: 16px;
            margin: 0;
            cursor: pointer;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            letter-spacing: 0.5px;
        }
        
        #ollama-model-selector {
            position: absolute;
            top: 45px;
            left: 10px;
            right: 10px;
            background-color: #fff;
            border: 1px solid #2c3e50;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10001;
            max-height: 300px;
            overflow-y: auto;
            display: none;
        }
        
        #ollama-model-selector.visible {
            display: block;
        }
        
        .ollama-model-item {
            padding: 10px 14px;
            border-bottom: 1px solid #e0e0e0;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.2s;
        }
        
        .ollama-model-item:hover {
            background-color: #ecf0f1;
        }
        
        .ollama-model-item.active {
            background-color: #3498db;
            color: white;
        }
        
        .ollama-model-name {
            font-weight: bold;
            font-size: 14px;
        }
        
        .ollama-model-item.active .ollama-model-info {
            color: rgba(255,255,255,0.8);
        }
        
        .ollama-model-info {
            color: #34495e;
            font-size: 12px;
            font-weight: 500;
        }
        
        #ollama-toggle-btn {
            position: fixed;
            top: 20px;
            right: 0;
            width: 40px;
            height: 40px;
            background-color: #1abc9c;
            color: white;
            border: none;
            border-radius: 8px 0 0 8px;
            cursor: pointer;
            z-index: 9999;
            font-size: 18px;
            box-shadow: -2px 2px 5px rgba(0,0,0,0.2);
            transition: background-color 0.3s;
        }
        
        #ollama-toggle-btn:hover {
            background-color: #16a085;
        }
        
        #ollama-close-btn {
            background-color: transparent;
            border: none;
            cursor: pointer;
            font-size: 22px;
            color: white;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.2s;
        }
        
        #ollama-close-btn:hover {
            background-color: rgba(255,255,255,0.1);
        }
        
        #ollama-chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            background-color: #f5f7fa;
        }
        
        .ollama-message {
            padding: 10px 14px;
            border-radius: 14px;
            max-width: 85%;
            word-wrap: break-word;
            font-size: 15px;
            line-height: 1.5;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .ollama-user-message {
            background-color: #3498db;
            color: white;
            align-self: flex-end;
            margin-left: 15%;
            border-bottom-right-radius: 4px;
            font-weight: 500;
        }
        
        .ollama-bot-message {
            background-color: white;
            color: #2c3e50;
            align-self: flex-start;
            margin-right: 15%;
            border-bottom-left-radius: 4px;
            border: 1px solid #e0e0e0;
            font-weight: 500;
        }
        
        #ollama-input-container {
            display: flex;
            padding: 12px 15px;
            border-top: 1px solid #ddd;
            background-color: white;
        }
        
        #ollama-input {
            flex: 1;
            padding: 10px 12px;
            border: 1px solid #bdc3c7;
            border-radius: 6px;
            resize: none;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.4;
            transition: border-color 0.2s;
        }
        
        #ollama-input:focus {
            border-color: #3498db;
            outline: none;
            box-shadow: 0 0 0 2px rgba(52,152,219,0.3);
        }
        
        #ollama-send-btn {
            margin-left: 10px;
            background-color: #1abc9c;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 0 18px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            transition: background-color 0.3s;
        }
        
        #ollama-send-btn:hover {
            background-color: #16a085;
        }
        
        #ollama-status {
            font-size: 13px;
            color: #34495e;
            font-weight: 500;
            text-align: center;
            padding: 8px;
            background-color: #f8f9fa;
            border-top: 1px solid #ecf0f1;
        }

        .ollama-spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(26,188,156,0.3);
            border-top-color: #1abc9c;
            border-radius: 50%;
            animation: ollama-spin 1s linear infinite;
            vertical-align: middle;
            margin-right: 6px;
        }
        
        @keyframes ollama-spin {
            to { transform: rotate(360deg); }
        }
        
        /* Scrollbar styling */
        #ollama-chat-container::-webkit-scrollbar,
        #ollama-model-selector::-webkit-scrollbar {
            width: 8px;
        }
        
        #ollama-chat-container::-webkit-scrollbar-track,
        #ollama-model-selector::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        
        #ollama-chat-container::-webkit-scrollbar-thumb,
        #ollama-model-selector::-webkit-scrollbar-thumb {
            background: #bdc3c7;
            border-radius: 4px;
        }
        
        #ollama-chat-container::-webkit-scrollbar-thumb:hover,
        #ollama-model-selector::-webkit-scrollbar-thumb:hover {
            background: #95a5a6;
        }
    `);
    
    // Create sidepanel UI
    function createSidepanel() {
        const panel = document.createElement('div');
        panel.id = 'ollama-sidepanel';
        panel.innerHTML = `
            <div id="ollama-header">
                <h3 id="ollama-title">Ollama Chat (${config.modelName}) ▼</h3>
                <button id="ollama-close-btn">×</button>
            </div>
            <div id="ollama-model-selector"></div>
            <div id="ollama-chat-container"></div>
            <div id="ollama-status"></div>
            <div id="ollama-input-container">
                <textarea id="ollama-input" placeholder="Type your message..." rows="2"></textarea>
                <button id="ollama-send-btn">Send</button>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Add toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'ollama-toggle-btn';
        toggleBtn.innerHTML = '💬';
        toggleBtn.title = 'Toggle Ollama Chat';
        document.body.appendChild(toggleBtn);
        
        return {
            panel,
            toggleBtn,
            closeBtn: document.getElementById('ollama-close-btn'),
            chatContainer: document.getElementById('ollama-chat-container'),
            input: document.getElementById('ollama-input'),
            sendBtn: document.getElementById('ollama-send-btn'),
            statusEl: document.getElementById('ollama-status'),
            titleEl: document.getElementById('ollama-title'),
            modelSelector: document.getElementById('ollama-model-selector')
        };
    }
    
    // Ollama API functions
    const ollamaApi = {
        // Check if Ollama service is available and load models
        checkAvailability: function() {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `${config.apiBaseUrl}/api/tags`,
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            
                            // Store all available models
                            if (data.models && Array.isArray(data.models)) {
                                config.availableModels = data.models;
                            }
                            
                            const modelExists = data.models && data.models.some(model => 
                                model.name === config.modelName || model.name.startsWith(`${config.modelName}:`)
                            );
                            
                            resolve({ 
                                available: true, 
                                modelExists: modelExists,
                                models: data.models || []
                            });
                        } catch (e) {
                            resolve({ available: true, modelExists: false, error: e.message });
                        }
                    },
                    onerror: function(error) {
                        resolve({ available: false, error: error });
                    }
                });
            });
        },
        
        // Get all available models
        getModels: function() {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `${config.apiBaseUrl}/api/tags`,
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            const models = data.models || [];
                            
                            // Update the config
                            config.availableModels = models;
                            
                            resolve(models);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: function(error) {
                        reject(error);
                    }
                });
            });
        },
        
        // Generate a response from the model
        generateResponse: function(prompt, systemPrompt, onUpdate) {
            let fullResponse = '';
            let responseAccumulator = '';
            
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${config.apiBaseUrl}/api/chat`,
                    data: JSON.stringify({
                        model: config.modelName,
                        messages: [
                            {
                                role: "system",
                                content: systemPrompt || config.systemPrompt
                            },
                            {
                                role: "user",
                                content: prompt
                            }
                        ],
                        stream: true,
                        options: {
                            temperature: config.temperature
                        }
                    }),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    responseType: "text",
                    onreadystatechange: function(response) {
                        if (response.readyState === 4 && response.status === 200) {
                            try {
                                // In case of non-streaming response
                                const data = JSON.parse(response.responseText);
                                if (data.message && data.message.content) {
                                    fullResponse = data.message.content;
                                    onUpdate(fullResponse);
                                    resolve(fullResponse);
                                }
                            } catch (e) {
                                // Expected for streaming responses
                                resolve(fullResponse); // Make sure we resolve with the accumulated response
                            }
                        }
                    },
                    onprogress: function(response) {
                        try {
                            const lines = response.responseText.split('\n').filter(line => line.trim());
                            
                            for (const line of lines) {
                                try {
                                    const parsedLine = JSON.parse(line);
                                    if (parsedLine.message && parsedLine.message.content) {
                                        // Instead of replacing the full response, we accumulate it
                                        // But we need to handle special cases:
                                        
                                        // Some models repeat from the beginning each time
                                        const newContent = parsedLine.message.content;
                                        if (newContent.length < responseAccumulator.length) {
                                            // If we get a shorter message, it's either starting over 
                                            // or it's a chunk from the middle, keep our accumulated version
                                            continue;
                                        } else if (newContent.startsWith(responseAccumulator)) {
                                            // This is a continuation, just add the new part
                                            const additionalContent = newContent.substring(responseAccumulator.length);
                                            responseAccumulator = newContent;
                                        } else {
                                            // If the new message doesn't build on what we have, 
                                            // it might be a different approach to streaming
                                            responseAccumulator += newContent;
                                        }
                                        
                                        fullResponse = responseAccumulator;
                                        onUpdate(fullResponse);
                                    }
                                } catch (e) {
                                    // Skip invalid JSON lines
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing Ollama progress response:", e);
                        }
                    },
                    onload: function(response) {
                        try {
                            // Some responses might not be streamed
                            const text = response.responseText;
                            const lines = text.split('\n').filter(line => line.trim());
                            
                            // Get the last complete JSON object
                            for (let i = lines.length - 1; i >= 0; i--) {
                                try {
                                    const parsedLine = JSON.parse(lines[i]);
                                    if (parsedLine.message && parsedLine.message.content) {
                                        fullResponse = parsedLine.message.content;
                                        onUpdate(fullResponse);
                                        break;
                                    }
                                } catch (e) {
                                    // Skip invalid JSON lines
                                }
                            }
                            
                            resolve(fullResponse);
                        } catch (e) {
                            console.error("Error parsing Ollama final response:", e);
                            resolve(fullResponse);
                        }
                    },
                    onerror: function(error) {
                        console.error("Ollama API error:", error);
                        reject(error);
                    }
                });
            });
        },
        
        // Alternative generate response using the older /api/generate endpoint
        generateResponseLegacy: function(prompt, systemPrompt, onUpdate) {
            let fullResponse = '';
            
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${config.apiBaseUrl}/api/generate`,
                    data: JSON.stringify({
                        model: config.modelName,
                        prompt: prompt,
                        system: systemPrompt || config.systemPrompt,
                        stream: true,
                        options: {
                            temperature: config.temperature,
                            num_predict: config.maxTokens
                        }
                    }),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    responseType: "text",
                    onprogress: function(response) {
                        try {
                            const lines = response.responseText.split('\n').filter(line => line.trim());
                            let latestResponse = '';
                            
                            for (const line of lines) {
                                try {
                                    const parsedLine = JSON.parse(line);
                                    if (parsedLine.response) {
                                        latestResponse += parsedLine.response;
                                        onUpdate(latestResponse);
                                    }
                                } catch (e) {
                                    // Skip invalid JSON lines
                                }
                            }
                            
                            fullResponse = latestResponse;
                        } catch (e) {
                            console.error("Error parsing Ollama progress response:", e);
                        }
                    },
                    onload: function(response) {
                        resolve(fullResponse);
                    },
                    onerror: function(error) {
                        console.error("Ollama API error:", error);
                        reject(error);
                    }
                });
            });
        }
    };
    
    // Chat management
    const chatManager = {
        messages: [],
        ui: null,
        isInitialized: false,
        isGenerating: false,
        
        init: function(ui) {
            this.ui = ui;
            this.isInitialized = true;
            this.addBotMessage(config.initialPrompt);
            
            // Set up event listeners
            this.ui.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            this.ui.sendBtn.addEventListener('click', () => this.sendMessage());
            
            // Add model selector click handler
            this.ui.titleEl.addEventListener('click', () => this.toggleModelSelector());
            
            // Close model selector when clicking outside
            document.addEventListener('click', (e) => {
                if (this.ui.modelSelector && 
                    this.ui.modelSelector.classList.contains('visible') && 
                    e.target !== this.ui.titleEl && 
                    !this.ui.modelSelector.contains(e.target)) {
                    this.ui.modelSelector.classList.remove('visible');
                }
            });
            
            // Check Ollama availability and load models
            this.setStatus("Checking Ollama availability...");
            ollamaApi.checkAvailability()
                .then(result => {
                    if (result.available) {
                        if (result.modelExists) {
                            this.setStatus(`Connected to Ollama. Model: ${config.modelName}`);
                            // Load and display available models
                            this.loadAvailableModels(result.models);
                        } else {
                            this.setStatus(`Warning: Model ${config.modelName} not found. Please select another model.`);
                            // Load and display available models
                            this.loadAvailableModels(result.models);
                            // Show model selector
                            setTimeout(() => this.toggleModelSelector(), 1000);
                        }
                    } else {
                        this.setStatus("Error: Cannot connect to Ollama service. Is it running?");
                        this.addBotMessage("⚠️ Cannot connect to the Ollama service. Please make sure it's running on your local machine at port 11434.");
                    }
                });
        },
        
        loadAvailableModels: function(models = []) {
            // If no models passed, fetch them
            if (models.length === 0) {
                ollamaApi.getModels().then(fetchedModels => {
                    this.populateModelSelector(fetchedModels);
                }).catch(err => {
                    console.error("Failed to fetch models:", err);
                });
            } else {
                this.populateModelSelector(models);
            }
        },
        
        populateModelSelector: function(models) {
            if (!this.ui.modelSelector) return;
            
            // Clear existing content
            this.ui.modelSelector.innerHTML = '';
            
            // Add refresh button at the top
            const refreshDiv = document.createElement('div');
            refreshDiv.className = 'ollama-model-item';
            refreshDiv.innerHTML = `
                <span class="ollama-model-name">↻ Refresh Models</span>
            `;
            refreshDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                this.refreshModels();
            });
            this.ui.modelSelector.appendChild(refreshDiv);
            
            // No models found message
            if (!models || models.length === 0) {
                const noModelsDiv = document.createElement('div');
                noModelsDiv.className = 'ollama-model-item';
                noModelsDiv.innerHTML = `<span class="ollama-model-name">No models found</span>`;
                this.ui.modelSelector.appendChild(noModelsDiv);
                return;
            }
            
            // Sort models alphabetically
            const sortedModels = [...models].sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
            
            // Add each model
            sortedModels.forEach(model => {
                const modelDiv = document.createElement('div');
                modelDiv.className = 'ollama-model-item';
                if (model.name === config.modelName) {
                    modelDiv.classList.add('active');
                }
                
                // Format the size properly
                const sizeDisplay = this.formatModelSize(model.size);
                
                modelDiv.innerHTML = `
                    <span class="ollama-model-name">${model.name}</span>
                    <span class="ollama-model-info">${sizeDisplay}</span>
                `;
                modelDiv.addEventListener('click', () => {
                    this.switchModel(model.name);
                    this.ui.modelSelector.classList.remove('visible');
                });
                this.ui.modelSelector.appendChild(modelDiv);
            });
        },
        
        formatModelSize: function(bytes) {
            if (!bytes) return '';
            
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let size = bytes;
            let unitIndex = 0;
            
            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }
            
            return `${size.toFixed(1)} ${units[unitIndex]}`;
        },
        
        toggleModelSelector: function() {
            if (!this.ui.modelSelector) return;
            
            const isVisible = this.ui.modelSelector.classList.toggle('visible');
            
            // If showing the selector, refresh models
            if (isVisible && (!config.availableModels || config.availableModels.length === 0)) {
                this.refreshModels();
            }
        },
        
        refreshModels: function() {
            this.setStatus("Refreshing models...");
            ollamaApi.getModels()
                .then(models => {
                    this.populateModelSelector(models);
                    this.setStatus(`Found ${models.length} models. Current: ${config.modelName}`);
                })
                .catch(err => {
                    this.setStatus("Failed to refresh models");
                    console.error("Failed to refresh models:", err);
                });
        },
        
        switchModel: function(newModelName) {
            if (newModelName === config.modelName) return;
            
            // Update config
            const oldModelName = config.modelName;
            config.modelName = newModelName;
            
            // Update UI
            if (this.ui.titleEl) {
                this.ui.titleEl.textContent = `Ollama Chat (${newModelName}) ▼`;
            }
            
            // Clear conversation
            this.messages = [];
            if (this.ui.chatContainer) {
                this.ui.chatContainer.innerHTML = '';
            }
            
            // Add system message
            this.addBotMessage(`Model switched from ${oldModelName} to ${newModelName}. Previous conversation has been cleared.`);
            
            // Update status
            this.setStatus(`Model switched to ${newModelName}`);
        },
        
        addUserMessage: function(text) {
            if (!text.trim()) return;
            
            const messageEl = document.createElement('div');
            messageEl.className = 'ollama-message ollama-user-message';
            messageEl.textContent = text;
            this.ui.chatContainer.appendChild(messageEl);
            this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
            
            this.messages.push({ role: 'user', content: text });
        },
        
        addBotMessage: function(text) {
            const messageEl = document.createElement('div');
            messageEl.className = 'ollama-message ollama-bot-message';
            messageEl.textContent = text;
            this.ui.chatContainer.appendChild(messageEl);
            this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
            
            if (text !== config.initialPrompt) {
                this.messages.push({ role: 'assistant', content: text });
            }
        },
        
        updateBotMessage: function(text) {
            const lastBotMessage = this.ui.chatContainer.querySelector('.ollama-bot-message:last-child');
            if (lastBotMessage) {
                lastBotMessage.textContent = text;
                this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
            }
        },
        
        setStatus: function(text, isLoading = false) {
            if (!this.ui || !this.ui.statusEl) return;
            
            if (isLoading) {
                this.ui.statusEl.innerHTML = `<div class="ollama-spinner"></div> ${text}`;
            } else {
                this.ui.statusEl.textContent = text;
            }
        },
        
        sendMessage: async function() {
            if (this.isGenerating) return;
            
            const userInput = this.ui.input.value.trim();
            if (!userInput) return;
            
            this.ui.input.value = '';
            this.addUserMessage(userInput);
            
            // Create empty bot message that will be updated
            const botMessageEl = document.createElement('div');
            botMessageEl.className = 'ollama-message ollama-bot-message';
            botMessageEl.textContent = '';
            this.ui.chatContainer.appendChild(botMessageEl);
            
            this.isGenerating = true;
            this.setStatus("Generating response...", true);
            
            try {
                // Generate system prompt based on conversation context
                const systemPrompt = `${config.systemPrompt}\nRespond to the user's latest query in the conversation.`;
                
                // Prepare context by combining messages
                const conversationContext = this.messages
                    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                    .join('\n\n');
                
                // Combine with user's current query
                const fullPrompt = `${conversationContext}\n\nUser: ${userInput}\n\nAssistant:`;
                
                await ollamaApi.generateResponse(
                    fullPrompt,
                    systemPrompt,
                    (response) => {
                        botMessageEl.textContent = response;
                        this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
                    }
                );
                
                // Add the complete response to messages array
                this.messages.push({ 
                    role: 'assistant', 
                    content: botMessageEl.textContent 
                });
                
                this.setStatus(`Connected to Ollama. Model: ${config.modelName}`);
            } catch (error) {
                console.error("Ollama response error:", error);
                botMessageEl.textContent = "Sorry, I encountered an error. Please try again.";
                this.setStatus("Error connecting to Ollama");
            } finally {
                this.isGenerating = false;
            }
        }
    };
    
    // Initialize the UI
    function init() {
        const ui = createSidepanel();
        
        // Toggle panel visibility
        ui.toggleBtn.addEventListener('click', () => {
            ui.panel.classList.toggle('visible');
        });
        
        ui.closeBtn.addEventListener('click', () => {
            ui.panel.classList.remove('visible');
        });
        
        // Initialize chat manager
        chatManager.init(ui);
    }
    
    // Start script with a slight delay to ensure page is fully loaded
    setTimeout(init, 1000);
    
    // Make API available globally for debugging
    window.OllamaChat = {
        config,
        toggle: function() {
            const panel = document.getElementById('ollama-sidepanel');
            if (panel) {
                panel.classList.toggle('visible');
            }
        },
        switchModel: function(modelName) {
            if (chatManager && chatManager.isInitialized) {
                chatManager.switchModel(modelName);
                return true;
            }
            return false;
        },
        listModels: function() {
            return [...config.availableModels];
        },
        refreshModels: function() {
            if (chatManager && chatManager.isInitialized) {
                chatManager.refreshModels();
                return true;
            }
            return false;
        },
        getCurrentModel: function() {
            return config.modelName;
        },
        toggleModelSelector: function() {
            if (chatManager && chatManager.isInitialized) {
                chatManager.toggleModelSelector();
                return true;
            }
            return false;
        }
    };
})();