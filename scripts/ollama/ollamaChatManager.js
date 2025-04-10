/**
 * Ollama Chat Manager Module
 * Handles chat interactions, message history, and UI updates
 */

import { defaultConfig } from './ollamaConfig.js';
import { formatModelSize } from './ollamaUI.js';

/**
 * Creates a chat manager to handle chat interactions
 * @param {Object} ui - UI elements object
 * @param {Object} ollamaApi - Ollama API object
 * @param {Object} config - Configuration object
 * @returns {Object} - Chat manager object
 */
export function createChatManager(ui, ollamaApi, config = defaultConfig) {
    return {
        messages: [],
        ui: ui,
        api: ollamaApi,
        isInitialized: false,
        isGenerating: false,
        config: config,
        
        /**
         * Initialize the chat manager
         */
        init: function() {
            this.isInitialized = true;
            this.addBotMessage(this.config.initialPrompt);
            
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
            this.api.checkAvailability()
                .then(result => {
                    if (result.available) {
                        if (result.modelExists) {
                            this.setStatus(`Connected to Ollama. Model: ${this.config.modelName}`);
                            // Load and display available models
                            this.loadAvailableModels(result.models);
                        } else {
                            this.setStatus(`Warning: Model ${this.config.modelName} not found. Please select another model.`);
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
        
        /**
         * Load available models into model selector
         * @param {Array} models - List of models
         */
        loadAvailableModels: function(models = []) {
            // If no models passed, fetch them
            if (models.length === 0) {
                this.api.getModels().then(fetchedModels => {
                    this.populateModelSelector(fetchedModels);
                }).catch(err => {
                    console.error("Failed to fetch models:", err);
                });
            } else {
                this.populateModelSelector(models);
            }
        },
        
        /**
         * Populate the model selector with available models
         * @param {Array} models - List of models
         */
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
                if (model.name === this.config.modelName) {
                    modelDiv.classList.add('active');
                }
                
                // Format the size properly
                const sizeDisplay = formatModelSize(model.size);
                
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
        
        /**
         * Toggle display of model selector
         */
        toggleModelSelector: function() {
            if (!this.ui.modelSelector) return;
            
            const isVisible = this.ui.modelSelector.classList.toggle('visible');
            
            // If showing the selector, refresh models
            if (isVisible && (!this.config.availableModels || this.config.availableModels.length === 0)) {
                this.refreshModels();
            }
        },
        
        /**
         * Refresh the list of available models
         */
        refreshModels: function() {
            this.setStatus("Refreshing models...");
            this.api.getModels()
                .then(models => {
                    this.populateModelSelector(models);
                    this.setStatus(`Found ${models.length} models. Current: ${this.config.modelName}`);
                })
                .catch(err => {
                    this.setStatus("Failed to refresh models");
                    console.error("Failed to refresh models:", err);
                });
        },
        
        /**
         * Switch to a different model
         * @param {string} newModelName - Name of the model to switch to
         */
        switchModel: function(newModelName) {
            if (newModelName === this.config.modelName) return;
            
            // Update config
            const oldModelName = this.config.modelName;
            this.config.modelName = newModelName;
            
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
        
        /**
         * Add a user message to the chat
         * @param {string} text - Message text
         */
        addUserMessage: function(text) {
            if (!text.trim()) return;
            
            const messageEl = document.createElement('div');
            messageEl.className = 'ollama-message ollama-user-message';
            messageEl.textContent = text;
            this.ui.chatContainer.appendChild(messageEl);
            this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
            
            this.messages.push({ role: 'user', content: text });
        },
        
        /**
         * Add a bot message to the chat
         * @param {string} text - Message text
         */
        addBotMessage: function(text) {
            const messageEl = document.createElement('div');
            messageEl.className = 'ollama-message ollama-bot-message';
            messageEl.textContent = text;
            this.ui.chatContainer.appendChild(messageEl);
            this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
            
            if (text !== this.config.initialPrompt) {
                this.messages.push({ role: 'assistant', content: text });
            }
        },
        
        /**
         * Update the last bot message with new text
         * @param {string} text - New message text
         */
        updateBotMessage: function(text) {
            const lastBotMessage = this.ui.chatContainer.querySelector('.ollama-bot-message:last-child');
            if (lastBotMessage) {
                lastBotMessage.textContent = text;
                this.ui.chatContainer.scrollTop = this.ui.chatContainer.scrollHeight;
            }
        },
        
        /**
         * Set the status message in the UI
         * @param {string} text - Status text
         * @param {boolean} isLoading - Whether to show loading indicator
         */
        setStatus: function(text, isLoading = false) {
            if (!this.ui || !this.ui.statusEl) return;
            
            if (isLoading) {
                this.ui.statusEl.innerHTML = `<div class="ollama-spinner"></div> ${text}`;
            } else {
                this.ui.statusEl.textContent = text;
            }
        },
        
        /**
         * Send a user message and get a response
         */
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
                const systemPrompt = `${this.config.systemPrompt}\nRespond to the user's latest query in the conversation.`;
                
                // Prepare context by combining messages
                const conversationContext = this.messages
                    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                    .join('\n\n');
                
                // Combine with user's current query
                const fullPrompt = `${conversationContext}\n\nUser: ${userInput}\n\nAssistant:`;
                
                await this.api.generateResponse(
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
                
                this.setStatus(`Connected to Ollama. Model: ${this.config.modelName}`);
            } catch (error) {
                console.error("Ollama response error:", error);
                botMessageEl.textContent = "Sorry, I encountered an error. Please try again.";
                this.setStatus("Error connecting to Ollama");
            } finally {
                this.isGenerating = false;
            }
        }
    };
}