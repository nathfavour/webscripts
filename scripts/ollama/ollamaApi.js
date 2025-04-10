/**
 * Ollama API Module
 * Handles API communication with the local Ollama server
 */

import { defaultConfig } from './ollamaConfig.js';

/**
 * Ollama API wrapper with methods for communication with Ollama server
 * @param {Object} config - Configuration object with API settings
 * @returns {Object} - API methods object
 */
export function createOllamaApi(config = defaultConfig) {
    return {
        /**
         * Check if Ollama service is available and load models
         * @returns {Promise<Object>} Result with available status and models
         */
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
        
        /**
         * Get all available models from Ollama server
         * @returns {Promise<Array>} List of available models
         */
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
        
        /**
         * Generate a response from the model using the chat API
         * @param {string} prompt - User prompt
         * @param {string} systemPrompt - System instructions
         * @param {Function} onUpdate - Callback for streaming updates
         * @returns {Promise<string>} Final response
         */
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
                            let newResponseContent = '';
                            let hasNewContent = false;
                            
                            // Process each line as a separate JSON chunk
                            for (const line of lines) {
                                try {
                                    const parsedLine = JSON.parse(line);
                                    if (parsedLine.message && parsedLine.message.content !== undefined) {
                                        // Different models stream responses differently:
                                        // Some send the full response so far each time
                                        // Others send just new tokens
                                        const content = parsedLine.message.content;
                                        
                                        // This approach handles both streaming styles:
                                        // - If content is longer than what we have, it's a cumulative update
                                        // - If it's shorter, it might be just new tokens
                                        if (content.length >= fullResponse.length && content.startsWith(fullResponse)) {
                                            // The model is sending cumulative responses
                                            // Extract just the new part
                                            newResponseContent = content.substring(fullResponse.length);
                                            fullResponse = content;
                                            hasNewContent = true;
                                        } else if (content.length < fullResponse.length) {
                                            // This might be just new tokens
                                            newResponseContent = content;
                                            fullResponse += content;
                                            hasNewContent = true;
                                        } else {
                                            // This is a completely different response
                                            // Use it directly (such as when the model corrects itself)
                                            newResponseContent = content;
                                            fullResponse = content;
                                            hasNewContent = true;
                                        }
                                    }
                                } catch (e) {
                                    // Skip invalid JSON lines
                                }
                            }
                            
                            // Update the UI with the complete accumulated response
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
        },
        
        /**
         * Alternative generate response using the older /api/generate endpoint
         * @param {string} prompt - User prompt
         * @param {string} systemPrompt - System instructions
         * @param {Function} onUpdate - Callback for streaming updates
         * @returns {Promise<string>} Final response
         */
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
}