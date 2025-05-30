// ==UserScript==
// @name            Social Media Manager (SM.js)
// @namespace       nathfavour
// @version         0.1.0
// @description     Intelligent social media manager with AI integration for Twitter, Instagram, LinkedIn, Facebook, Threads
// @author          nath
// @license         MIT
// @match           https://x.com/*
// @match           https://twitter.com/*
// @match           https://threads.net/*
// @match           https://instagram.com/*
// @match           https://linkedin.com/*
// @match           https://facebook.com/*
// @grant           GM_addStyle
// @grant           GM_xmlhttpRequest
// @grant           GM_getValue
// @grant           GM_setValue
// @connect         localhost
// @run-at          document-idle
// @homepage        https://gitlab.com/nathfavour/webscripts
// ==/UserScript==

(function() {
    'use strict';
    
    // Configuration with fallback values
    const defaultConfig = {
        // Social media platforms
        platforms: {
            twitter: ['x.com', 'twitter.com'],
            threads: ['threads.net'],
            instagram: ['instagram.com'],
            linkedin: ['linkedin.com'],
            facebook: ['facebook.com']
        },
        
        // API endpoints
        localApiUrl: 'http://localhost:8080',
        ollamaApiUrl: 'http://localhost:11434',
        
        // Ollama settings
        ollama: {
            defaultModel: 'gemma:3b',
            temperature: 0.7,
            maxTokens: 4096,
            systemPrompt: 'You are an intelligent social media assistant. Analyze content and provide insights.',
            availableModels: []
        },
        
        // Analysis settings
        analysis: {
            contentScanInterval: 30000, // 30 seconds
            maxContentAge: 3600000, // 1 hour
            batchSize: 5,
            enableAutoAnalysis: true,
            enableAutoPosting: false,
            enableAutoReplying: false
        },
        
        // UI settings
        ui: {
            panelWidth: '400px',
            enableFloatingPanel: true,
            enableNotifications: true,
            theme: 'dark'
        }
    };
    
    // Global state
    let config = { ...defaultConfig };
    let currentPlatform = null;
    let isInitialized = false;
    let analysisTimer = null;
    let ui = null;
    
    // Utility functions
    const utils = {
        log: (message, level = 'info') => {
            const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
            console.log(`[SM.js ${timestamp}] [${level.toUpperCase()}] ${message}`);
        },
        
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        
        getCurrentPlatform: () => {
            const hostname = window.location.hostname.toLowerCase();
            for (const [platform, domains] of Object.entries(config.platforms)) {
                if (domains.some(domain => hostname.includes(domain))) {
                    return platform;
                }
            }
            return null;
        },
        
        sanitizeText: (text) => {
            return text.replace(/\s+/g, ' ').trim().substring(0, 1000);
        },
        
        extractUrls: (text) => {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return text.match(urlRegex) || [];
        },
        
        generateId: () => {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }
    };
    
    // Local API communication
    const localApi = {
        baseUrl: config.localApiUrl,
        
        request: async (endpoint, options = {}) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: `${localApi.baseUrl}/api${endpoint}`,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    data: options.data ? JSON.stringify(options.data) : undefined,
                    onload: (response) => {
                        try {
                            const data = response.responseText ? JSON.parse(response.responseText) : {};
                            resolve({ status: response.status, data });
                        } catch (e) {
                            resolve({ status: response.status, data: response.responseText });
                        }
                    },
                    onerror: (error) => {
                        utils.log(`Local API error: ${error}`, 'error');
                        reject(error);
                    }
                });
            });
        },
        
        getConfig: async () => {
            try {
                const response = await localApi.request('/config');
                if (response.status === 200 && response.data) {
                    return response.data;
                }
            } catch (error) {
                utils.log('Failed to fetch config from local API, using defaults', 'warn');
            }
            return defaultConfig;
        },
        
        saveConfig: async (newConfig) => {
            try {
                const response = await localApi.request('/config', {
                    method: 'PUT',
                    data: newConfig
                });
                return response.status === 200;
            } catch (error) {
                utils.log('Failed to save config to local API', 'error');
                return false;
            }
        },
        
        savePost: async (postData) => {
            try {
                const response = await localApi.request('/posts', {
                    method: 'POST',
                    data: postData
                });
                return response.status === 201;
            } catch (error) {
                utils.log('Failed to save post data', 'error');
                return false;
            }
        },
        
        getAnalytics: async (platform, timeRange = '24h') => {
            try {
                const response = await localApi.request(`/analytics/${platform}?range=${timeRange}`);
                if (response.status === 200) {
                    return response.data;
                }
            } catch (error) {
                utils.log('Failed to fetch analytics', 'error');
            }
            return null;
        },
        
        schedulePost: async (postData) => {
            try {
                const response = await localApi.request('/posts/schedule', {
                    method: 'POST',
                    data: postData
                });
                return response.status === 201;
            } catch (error) {
                utils.log('Failed to schedule post', 'error');
                return false;
            }
        }
    };
    
    // Ollama AI integration
    const ollamaApi = {
        generateResponse: async (prompt, systemPrompt = null) => {
            return new Promise((resolve, reject) => {
                let fullResponse = '';
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `${config.ollamaApiUrl}/api/chat`,
                    data: JSON.stringify({
                        model: config.ollama.defaultModel,
                        messages: [
                            {
                                role: 'system',
                                content: systemPrompt || config.ollama.systemPrompt
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        stream: true,
                        options: {
                            temperature: config.ollama.temperature
                        }
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    responseType: 'text',
                    onprogress: (response) => {
                        try {
                            const lines = response.responseText.split('\n').filter(line => line.trim());
                            for (const line of lines) {
                                try {
                                    const parsedLine = JSON.parse(line);
                                    if (parsedLine.message && parsedLine.message.content !== undefined) {
                                        const content = parsedLine.message.content;
                                        if (content.length >= fullResponse.length && content.startsWith(fullResponse)) {
                                            fullResponse = content;
                                        } else {
                                            fullResponse += content;
                                        }
                                    }
                                } catch (e) {
                                    // Skip invalid JSON lines
                                }
                            }
                        } catch (e) {
                            utils.log(`Error parsing Ollama response: ${e.message}`, 'error');
                        }
                    },
                    onload: () => {
                        resolve(fullResponse);
                    },
                    onerror: (error) => {
                        utils.log(`Ollama API error: ${error}`, 'error');
                        reject(error);
                    }
                });
            });
        },
        
        analyzeContent: async (content, context = '') => {
            const prompt = `Analyze this social media content and provide insights:

Content: "${content}"
Context: "${context}"
Platform: ${currentPlatform}

Please provide:
1. Main topics and themes
2. Sentiment analysis
3. Engagement potential (high/medium/low)
4. Suggested response strategies
5. Key insights

Format your response as JSON with these fields: topics, sentiment, engagement, suggestions, insights.`;

            try {
                const response = await ollamaApi.generateResponse(prompt);
                // Try to parse JSON response
                try {
                    return JSON.parse(response);
                } catch (e) {
                    // If not JSON, return structured response
                    return {
                        topics: [],
                        sentiment: 'neutral',
                        engagement: 'medium',
                        suggestions: [],
                        insights: response,
                        raw: response
                    };
                }
            } catch (error) {
                utils.log(`Content analysis failed: ${error.message}`, 'error');
                return null;
            }
        },
        
        generatePost: async (topic, style = 'engaging', platform = currentPlatform) => {
            const prompt = `Generate a social media post for ${platform}:

Topic: ${topic}
Style: ${style}
Platform-specific requirements:
- Twitter/X: 280 characters max, use hashtags
- LinkedIn: Professional tone, longer form acceptable
- Instagram: Visual-friendly, use hashtags
- Facebook: Conversational, engaging
- Threads: Similar to Twitter but more conversational

Create an engaging post that fits the platform's culture and audience.`;

            try {
                return await ollamaApi.generateResponse(prompt);
            } catch (error) {
                utils.log(`Post generation failed: ${error.message}`, 'error');
                return null;
            }
        }
    };
    
    // Content extraction and analysis
    const contentAnalyzer = {
        extractPosts: () => {
            const posts = [];
            let postSelectors = [];
            
            // Platform-specific selectors
            switch (currentPlatform) {
                case 'twitter':
                    postSelectors = [
                        'article[role="article"]',
                        'div[data-testid="tweet"]'
                    ];
                    break;
                case 'linkedin':
                    postSelectors = [
                        '.feed-shared-update-v2',
                        '.occludable-update'
                    ];
                    break;
                case 'instagram':
                    postSelectors = [
                        'article',
                        'div[role="button"]'
                    ];
                    break;
                case 'facebook':
                    postSelectors = [
                        '[data-pagelet="FeedUnit"]',
                        '.userContentWrapper'
                    ];
                    break;
                case 'threads':
                    postSelectors = [
                        'div[role="article"]'
                    ];
                    break;
            }
            
            // Extract posts using selectors
            for (const selector of postSelectors) {
                const elements = document.querySelectorAll(selector);
                elements.forEach((element, index) => {
                    if (index < config.analysis.batchSize) {
                        const postData = contentAnalyzer.extractPostData(element);
                        if (postData && postData.content) {
                            posts.push(postData);
                        }
                    }
                });
                if (posts.length >= config.analysis.batchSize) break;
            }
            
            return posts;
        },
        
        extractPostData: (element) => {
            try {
                const postId = utils.generateId();
                const timestamp = new Date().toISOString();
                
                // Extract text content
                const textElement = element.querySelector('[data-testid="tweetText"], .feed-shared-text, .userContent, p, span') || element;
                const content = utils.sanitizeText(textElement.textContent || '');
                
                // Extract links
                const links = [];
                const linkElements = element.querySelectorAll('a[href]');
                linkElements.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                        links.push(href);
                    }
                });
                
                // Extract author info if available
                const authorElement = element.querySelector('[data-testid="User-Name"], .feed-shared-actor__name, .actor-name');
                const author = authorElement ? utils.sanitizeText(authorElement.textContent) : '';
                
                // Extract engagement metrics if available
                const metrics = contentAnalyzer.extractMetrics(element);
                
                return {
                    id: postId,
                    platform: currentPlatform,
                    content,
                    author,
                    links,
                    metrics,
                    timestamp,
                    url: window.location.href,
                    element: element.outerHTML.substring(0, 1000) // Store limited HTML for context
                };
            } catch (error) {
                utils.log(`Error extracting post data: ${error.message}`, 'error');
                return null;
            }
        },
        
        extractMetrics: (element) => {
            const metrics = {
                likes: 0,
                shares: 0,
                comments: 0,
                views: 0
            };
            
            // Platform-specific metric extraction
            const metricSelectors = {
                twitter: {
                    likes: '[data-testid="like"] span, [aria-label*="likes"]',
                    shares: '[data-testid="retweet"] span, [aria-label*="retweets"]',
                    comments: '[data-testid="reply"] span, [aria-label*="replies"]'
                },
                linkedin: {
                    likes: '.social-actions-button--liked .social-action__count',
                    shares: '.social-actions-button--shared .social-action__count',
                    comments: '.social-actions-button--comment .social-action__count'
                }
            };
            
            const platformSelectors = metricSelectors[currentPlatform];
            if (platformSelectors) {
                Object.keys(platformSelectors).forEach(metric => {
                    const element_metric = element.querySelector(platformSelectors[metric]);
                    if (element_metric) {
                        const text = element_metric.textContent.trim();
                        const number = parseInt(text.replace(/[^0-9]/g, '')) || 0;
                        metrics[metric] = number;
                    }
                });
            }
            
            return metrics;
        },
        
        analyzeCurrentPage: async () => {
            if (!config.analysis.enableAutoAnalysis) return;
            
            utils.log(`Starting content analysis for ${currentPlatform}`);
            
            const posts = contentAnalyzer.extractPosts();
            const analyses = [];
            
            for (const post of posts) {
                try {
                    const analysis = await ollamaApi.analyzeContent(post.content, `Author: ${post.author}`);
                    if (analysis) {
                        const enrichedPost = {
                            ...post,
                            analysis,
                            analyzed_at: new Date().toISOString()
                        };
                        
                        // Save to local API
                        await localApi.savePost(enrichedPost);
                        analyses.push(enrichedPost);
                        
                        // Update UI if available
                        if (ui && ui.updateAnalysis) {
                            ui.updateAnalysis(enrichedPost);
                        }
                    }
                } catch (error) {
                    utils.log(`Analysis failed for post ${post.id}: ${error.message}`, 'error');
                }
                
                // Small delay between analyses
                await utils.sleep(500);
            }
            
            utils.log(`Completed analysis of ${analyses.length} posts`);
            return analyses;
        }
    };
    
    // UI Management
    const uiManager = {
        createUI: () => {
            // Add styles
            GM_addStyle(`
                #sm-panel {
                    position: fixed;
                    top: 20px;
                    right: 0;
                    width: ${config.ui.panelWidth};
                    max-height: 80vh;
                    background: ${config.ui.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
                    color: ${config.ui.theme === 'dark' ? '#ffffff' : '#000000'};
                    border: 2px solid #00ff88;
                    border-radius: 10px 0 0 10px;
                    box-shadow: -5px 0 15px rgba(0, 255, 136, 0.3);
                    z-index: 10000;
                    display: flex;
                    flex-direction: column;
                    font-family: system-ui, -apple-system, sans-serif;
                    transform: translateX(calc(100% - 40px));
                    transition: transform 0.3s ease;
                }
                
                #sm-panel.expanded {
                    transform: translateX(0);
                }
                
                #sm-panel-toggle {
                    position: absolute;
                    left: -40px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 40px;
                    height: 80px;
                    background: linear-gradient(45deg, #00ff88, #00cc6a);
                    border: none;
                    border-radius: 10px 0 0 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    color: white;
                    font-weight: bold;
                }
                
                #sm-panel-header {
                    padding: 15px;
                    background: linear-gradient(45deg, #00ff88, #00cc6a);
                    color: white;
                    font-weight: bold;
                    text-align: center;
                    border-radius: 8px 8px 0 0;
                }
                
                #sm-panel-content {
                    padding: 15px;
                    overflow-y: auto;
                    flex: 1;
                }
                
                .sm-section {
                    margin-bottom: 20px;
                    padding: 10px;
                    background: ${config.ui.theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};
                    border-radius: 8px;
                }
                
                .sm-section h3 {
                    margin: 0 0 10px 0;
                    color: #00ff88;
                    font-size: 14px;
                }
                
                .sm-button {
                    background: #00ff88;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    margin: 5px;
                    font-weight: bold;
                }
                
                .sm-button:hover {
                    background: #00cc6a;
                }
                
                .sm-status {
                    font-size: 12px;
                    opacity: 0.8;
                    margin-top: 10px;
                }
                
                .sm-analysis-item {
                    background: ${config.ui.theme === 'dark' ? '#333' : '#e8e8e8'};
                    padding: 8px;
                    margin: 5px 0;
                    border-radius: 5px;
                    font-size: 12px;
                }
                
                .sm-metric {
                    display: inline-block;
                    margin: 2px 5px;
                    padding: 2px 6px;
                    background: #00ff88;
                    color: white;
                    border-radius: 3px;
                    font-size: 11px;
                }
            `);
            
            // Create panel HTML
            const panel = document.createElement('div');
            panel.id = 'sm-panel';
            panel.innerHTML = `
                <button id="sm-panel-toggle">SM</button>
                <div id="sm-panel-header">
                    Social Media Manager
                    <div style="font-size: 12px; font-weight: normal; opacity: 0.9;">
                        ${currentPlatform.toUpperCase()}
                    </div>
                </div>
                <div id="sm-panel-content">
                    <div class="sm-section">
                        <h3>🎯 AI Analysis</h3>
                        <button class="sm-button" id="sm-analyze-now">Analyze Current Page</button>
                        <button class="sm-button" id="sm-toggle-auto">Toggle Auto-Analysis</button>
                        <div class="sm-status" id="sm-analysis-status">Auto-analysis: ${config.analysis.enableAutoAnalysis ? 'ON' : 'OFF'}</div>
                        <div id="sm-analysis-results"></div>
                    </div>
                    
                    <div class="sm-section">
                        <h3>✍️ Content Generation</h3>
                        <input type="text" id="sm-topic-input" placeholder="Enter topic..." style="width: 100%; padding: 5px; margin: 5px 0; border-radius: 3px; border: 1px solid #ccc;">
                        <button class="sm-button" id="sm-generate-post">Generate Post</button>
                        <div id="sm-generated-content"></div>
                    </div>
                    
                    <div class="sm-section">
                        <h3>📊 Analytics</h3>
                        <button class="sm-button" id="sm-view-analytics">View Analytics</button>
                        <div id="sm-analytics-display"></div>
                    </div>
                    
                    <div class="sm-section">
                        <h3>⚙️ Settings</h3>
                        <button class="sm-button" id="sm-open-config">Open Config</button>
                        <div class="sm-status">Model: ${config.ollama.defaultModel}</div>
                        <div class="sm-status">API: ${config.localApiUrl}</div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(panel);
            
            // Set up event listeners
            uiManager.setupEventListeners();
            
            return {
                panel,
                toggle: document.getElementById('sm-panel-toggle'),
                content: document.getElementById('sm-panel-content'),
                analysisResults: document.getElementById('sm-analysis-results'),
                analysisStatus: document.getElementById('sm-analysis-status'),
                generatedContent: document.getElementById('sm-generated-content'),
                analyticsDisplay: document.getElementById('sm-analytics-display'),
                updateAnalysis: uiManager.updateAnalysisDisplay,
                updateStatus: uiManager.updateStatus
            };
        },
        
        setupEventListeners: () => {
            // Toggle panel
            document.getElementById('sm-panel-toggle').addEventListener('click', () => {
                document.getElementById('sm-panel').classList.toggle('expanded');
            });
            
            // Analyze current page
            document.getElementById('sm-analyze-now').addEventListener('click', async () => {
                uiManager.updateStatus('Analyzing current page...', 'sm-analysis-status');
                await contentAnalyzer.analyzeCurrentPage();
                uiManager.updateStatus(`Auto-analysis: ${config.analysis.enableAutoAnalysis ? 'ON' : 'OFF'}`, 'sm-analysis-status');
            });
            
            // Toggle auto-analysis
            document.getElementById('sm-toggle-auto').addEventListener('click', () => {
                config.analysis.enableAutoAnalysis = !config.analysis.enableAutoAnalysis;
                uiManager.updateStatus(`Auto-analysis: ${config.analysis.enableAutoAnalysis ? 'ON' : 'OFF'}`, 'sm-analysis-status');
                
                // Save config
                localApi.saveConfig(config);
                
                // Restart/stop analysis timer
                if (config.analysis.enableAutoAnalysis) {
                    startAnalysisTimer();
                } else {
                    stopAnalysisTimer();
                }
            });
            
            // Generate post
            document.getElementById('sm-generate-post').addEventListener('click', async () => {
                const topic = document.getElementById('sm-topic-input').value.trim();
                if (!topic) {
                    alert('Please enter a topic for post generation');
                    return;
                }
                
                uiManager.updateGeneratedContent('Generating post...', true);
                try {
                    const generatedPost = await ollamaApi.generatePost(topic);
                    if (generatedPost) {
                        uiManager.updateGeneratedContent(generatedPost, false);
                    } else {
                        uiManager.updateGeneratedContent('Failed to generate post', false);
                    }
                } catch (error) {
                    uiManager.updateGeneratedContent(`Error: ${error.message}`, false);
                }
            });
            
            // View analytics
            document.getElementById('sm-view-analytics').addEventListener('click', async () => {
                uiManager.updateAnalyticsDisplay('Loading analytics...', true);
                try {
                    const analytics = await localApi.getAnalytics(currentPlatform);
                    if (analytics) {
                        uiManager.displayAnalytics(analytics);
                    } else {
                        uiManager.updateAnalyticsDisplay('No analytics data available', false);
                    }
                } catch (error) {
                    uiManager.updateAnalyticsDisplay(`Error: ${error.message}`, false);
                }
            });
            
            // Open config
            document.getElementById('sm-open-config').addEventListener('click', () => {
                const configWindow = window.open('', '_blank', 'width=600,height=400');
                configWindow.document.write(`
                    <html>
                        <head><title>SM.js Configuration</title></head>
                        <body style="font-family: system-ui; padding: 20px;">
                            <h2>Current Configuration</h2>
                            <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto;">
${JSON.stringify(config, null, 2)}
                            </pre>
                            <p>To modify configuration, use the shitpostercli or edit ~/.shitposter/configs.json</p>
                        </body>
                    </html>
                `);
            });
        },
        
        updateAnalysisDisplay: (analysisData) => {
            const container = document.getElementById('sm-analysis-results');
            if (!container) return;
            
            const item = document.createElement('div');
            item.className = 'sm-analysis-item';
            
            const analysis = analysisData.analysis || {};
            item.innerHTML = `
                <div><strong>${analysisData.author || 'Unknown'}</strong></div>
                <div style="margin: 5px 0;">${analysisData.content.substring(0, 100)}...</div>
                <div>
                    <span class="sm-metric">Sentiment: ${analysis.sentiment || 'unknown'}</span>
                    <span class="sm-metric">Engagement: ${analysis.engagement || 'unknown'}</span>
                </div>
                <div style="font-size: 10px; opacity: 0.7; margin-top: 5px;">
                    ${new Date(analysisData.timestamp).toLocaleTimeString()}
                </div>
            `;
            
            container.appendChild(item);
            
            // Keep only last 10 items
            while (container.children.length > 10) {
                container.removeChild(container.firstChild);
            }
        },
        
        updateStatus: (message, elementId) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = message;
            }
        },
        
        updateGeneratedContent: (content, isLoading) => {
            const container = document.getElementById('sm-generated-content');
            if (!container) return;
            
            if (isLoading) {
                container.innerHTML = '<div style="opacity: 0.7;">🔄 ' + content + '</div>';
            } else {
                container.innerHTML = `
                    <div style="background: #e8f5e8; padding: 10px; border-radius: 5px; margin: 10px 0;">
                        <div style="font-weight: bold; color: #00cc6a; margin-bottom: 5px;">Generated Post:</div>
                        <div style="white-space: pre-wrap;">${content}</div>
                        <button class="sm-button" onclick="navigator.clipboard.writeText('${content.replace(/'/g, "\\'")}')">Copy</button>
                    </div>
                `;
            }
        },
        
        updateAnalyticsDisplay: (content, isLoading) => {
            const container = document.getElementById('sm-analytics-display');
            if (!container) return;
            
            if (isLoading) {
                container.innerHTML = '<div style="opacity: 0.7;">📊 ' + content + '</div>';
            } else {
                container.textContent = content;
            }
        },
        
        displayAnalytics: (analytics) => {
            const container = document.getElementById('sm-analytics-display');
            if (!container || !analytics) return;
            
            container.innerHTML = `
                <div style="background: #e8f0ff; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <div><strong>Posts Analyzed:</strong> ${analytics.totalPosts || 0}</div>
                    <div><strong>Avg Sentiment:</strong> ${analytics.avgSentiment || 'N/A'}</div>
                    <div><strong>High Engagement:</strong> ${analytics.highEngagement || 0}</div>
                    <div><strong>Last Updated:</strong> ${analytics.lastUpdated ? new Date(analytics.lastUpdated).toLocaleString() : 'N/A'}</div>
                </div>
            `;
        }
    };
    
    // Analysis timer management
    function startAnalysisTimer() {
        if (analysisTimer) clearInterval(analysisTimer);
        
        analysisTimer = setInterval(async () => {
            if (config.analysis.enableAutoAnalysis && document.visibilityState === 'visible') {
                await contentAnalyzer.analyzeCurrentPage();
            }
        }, config.analysis.contentScanInterval);
        
        utils.log('Analysis timer started');
    }
    
    function stopAnalysisTimer() {
        if (analysisTimer) {
            clearInterval(analysisTimer);
            analysisTimer = null;
            utils.log('Analysis timer stopped');
        }
    }
    
    // Initialization
    async function initialize() {
        if (isInitialized) return;
        
        utils.log('Initializing Social Media Manager...');
        
        // Detect current platform
        currentPlatform = utils.getCurrentPlatform();
        if (!currentPlatform) {
            utils.log('Not on a supported social media platform', 'warn');
            return;
        }
        
        utils.log(`Detected platform: ${currentPlatform}`);
        
        // Load configuration from local API
        try {
            const apiConfig = await localApi.getConfig();
            config = { ...config, ...apiConfig };
            utils.log('Configuration loaded from local API');
        } catch (error) {
            utils.log('Using default configuration', 'warn');
        }
        
        // Create UI if enabled
        if (config.ui.enableFloatingPanel) {
            ui = uiManager.createUI();
            utils.log('UI created');
        }
        
        // Start auto-analysis if enabled
        if (config.analysis.enableAutoAnalysis) {
            startAnalysisTimer();
        }
        
        isInitialized = true;
        utils.log('Social Media Manager initialized successfully');
        
        // Initial page analysis
        setTimeout(() => {
            contentAnalyzer.analyzeCurrentPage();
        }, 2000);
    }
    
    // Cleanup function
    function cleanup() {
        stopAnalysisTimer();
        utils.log('Social Media Manager cleaned up');
    }
    
    // Expose global API
    window.SocialMediaManager = {
        config,
        analyze: contentAnalyzer.analyzeCurrentPage,
        generatePost: ollamaApi.generatePost,
        toggleAutoAnalysis: () => {
            config.analysis.enableAutoAnalysis = !config.analysis.enableAutoAnalysis;
            if (config.analysis.enableAutoAnalysis) {
                startAnalysisTimer();
            } else {
                stopAnalysisTimer();
            }
        },
        getAnalytics: localApi.getAnalytics,
        restart: () => {
            cleanup();
            isInitialized = false;
            setTimeout(initialize, 1000);
        }
    };
    
    // Start initialization after page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 1000);
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
})();