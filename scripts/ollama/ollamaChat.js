// ==UserScript==
// @name            Ollama Chat (Modular)
// @namespace       nathfavour
// @version         0.1.0
// @description     Modular implementation of Ollama chat interface
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
    
    /**
     * Import modules
     * Note: In a real UserScript environment, you might need to include these modules directly or
     * use a bundler, since UserScripts don't support ES6 module imports directly
     */
    
    // Configuration module
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
    
    // Apply UI styles
    function generateStyles(config) {
        return `
            #ollama-sidepanel {
                position: fixed;
                top: 0;
                right: 0;
                width: ${config.panelWidth};
                height: 100vh;
                background-color: #ffffff;
                box-shadow: -5px 0 15px rgba(0, 0, 0, 0.4);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                transition: transform 0.3s ease;
                font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
                transform: translateX(${config.panelWidth});
                border-left: 2px solid #000000;
            }
            /* ... rest of the styles (abbreviated for brevity) ... */
        `;
    }
    
    // Add styles to page
    GM_addStyle(generateStyles(config));
    
    // Create UI components
    function createSidepanel(config) {
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
    
    // Create Ollama API instance
    function createOllamaApi(config) {
        return {
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
            
            generateResponse: function(prompt, systemPrompt, onUpdate) {
                // Store the complete accumulated response
                let fullResponse = '';
                
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
                        onprogress: function(response) {
                            try {
                                const lines = response.responseText.split('\n').filter(line => line.trim());
                                let hasNewContent = false;
                                
                                for (const line of lines) {
                                    try {
                                        const parsedLine = JSON.parse(line);
                                        if (parsedLine.message && parsedLine.message.content !== undefined) {
                                            const content = parsedLine.message.content;
                                            
                                            if (content.length >= fullResponse.length && content.startsWith(fullResponse)) {
                                                fullResponse = content;
                                                hasNewContent = true;
                                            } else if (content.length < fullResponse.length) {
                                                fullResponse += content;
                                                hasNewContent = true;
                                            } else {
                                                fullResponse = content;
                                                hasNewContent = true;
                                            }
                                        }
                                    } catch (e) {
                                        // Skip invalid JSON lines
                                    }
                                }
                                
                                if (hasNewContent) {
                                    onUpdate(fullResponse);
                                }
                            } catch (e) {
                                console.error("Error parsing Ollama response:", e);
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
    }
    
    // Create chat manager
    function createChatManager(ui, api, config) {
        // Chat manager implementation (abbreviated)
        const chatManager = {
            messages: [],
            ui: ui,
            api: api,
            isInitialized: false,
            isGenerating: false,
            
            init: function() {
                // Initialize chat interface (implementation details omitted for brevity)
                this.isInitialized = true;
                
                // Setup event handlers
                this.setupEventHandlers();
                
                // Check Ollama availability
                this.checkOllamaAvailability();
            },
            
            setupEventHandlers: function() {
                // Set up all event listeners
                // Input handler, send button, etc.
                this.ui.input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                });
                
                this.ui.sendBtn.addEventListener('click', () => this.sendMessage());
                
                // Add model selector click handler
                this.ui.titleEl.addEventListener('click', () => this.toggleModelSelector());
            },
            
            checkOllamaAvailability: function() {
                // Check if Ollama is available
                this.api.checkAvailability()
                    .then(result => {
                        if (result.available) {
                            // Handle availability results
                            console.log('Ollama is available');
                        } else {
                            console.error('Ollama is not available');
                        }
                    });
            },
            
            sendMessage: async function() {
                // Send message implementation
                console.log('Sending message');
            }
        };
        
        return chatManager;
    }
    
    // Initialize the chat application
    function init() {
        // Create UI components
        const ui = createSidepanel(config);
        
        // Create API instance
        const api = createOllamaApi(config);
        
        // Create chat manager
        const chatManager = createChatManager(ui, api, config);
        
        // Initialize chat manager
        chatManager.init();
        
        // Set up basic UI interactions
        ui.toggleBtn.addEventListener('click', () => {
            ui.panel.classList.toggle('visible');
        });
        
        ui.closeBtn.addEventListener('click', () => {
            ui.panel.classList.remove('visible');
        });
        
        // Make API available globally for debugging
        window.OllamaChat = {
            config,
            api,
            chatManager,
            toggle: function() {
                ui.panel.classList.toggle('visible');
            }
        };
    }
    
    // Start the application with a delay
    setTimeout(init, 1000);
})();