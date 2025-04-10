/**
 * Ollama UI Module
 * Provides UI components and styling for the Ollama chat interface
 */

import { defaultConfig } from './ollamaConfig.js';

/**
 * Generate CSS styles for Ollama chat interface
 * @param {Object} config - Configuration object
 * @returns {string} - CSS styles as string
 */
export function generateStyles(config = defaultConfig) {
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
        
        #ollama-sidepanel.visible {
            transform: translateX(0);
        }
        
        #ollama-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            background-color: #111827;
            color: white;
            border-bottom: 3px solid #10b981;
        }
        
        #ollama-title {
            font-weight: 700;
            font-size: 16px;
            margin: 0;
            cursor: pointer;
            text-shadow: 0 1px 2px rgba(0,0,0,0.4);
            letter-spacing: 0.5px;
        }
        
        #ollama-model-selector {
            position: absolute;
            top: 52px;
            left: 10px;
            right: 10px;
            background-color: #fff;
            border: 1px solid #000000;
            border-radius: 4px;
            box-shadow: 0 6px 16px rgba(0,0,0,0.3);
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
            padding: 12px 16px;
            border-radius: 14px;
            max-width: 85%;
            word-wrap: break-word;
            font-size: 15px;
            line-height: 1.6;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        }
        
        .ollama-user-message {
            background-color: #1e40af;
            color: white;
            align-self: flex-end;
            margin-left: 15%;
            border-bottom-right-radius: 4px;
            font-weight: 600;
            text-shadow: 0 1px 1px rgba(0,0,0,0.2);
        }
        
        .ollama-bot-message {
            background-color: #f8fafc;
            color: #0f172a;
            align-self: flex-start;
            margin-right: 15%;
            border-bottom-left-radius: 4px;
            border: 1.5px solid #94a3b8;
            font-weight: 600;
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
    `;
}

/**
 * Creates the sidepanel UI elements
 * @param {Object} config - Configuration object
 * @returns {Object} - UI elements object
 */
export function createSidepanel(config = defaultConfig) {
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

/**
 * Format a model size in bytes to a human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
export function formatModelSize(bytes) {
    if (!bytes) return '';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}