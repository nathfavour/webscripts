/**
 * Ollama Configuration Module
 * Contains default configuration options for Ollama chat interface
 */

export const defaultConfig = {
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

/**
 * Creates a configuration object with custom overrides
 * @param {Object} customConfig - Custom configuration options
 * @returns {Object} - Final configuration object
 */
export function createConfig(customConfig = {}) {
    return { ...defaultConfig, ...customConfig };
}