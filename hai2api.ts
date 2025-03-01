import { crypto } from 'https://deno.land/std@0.218.2/crypto/mod.ts';
import { serve } from 'https://deno.land/std@0.218.2/http/server.ts';

const MODEL_TO_MODE_ID = {
    "o3-mini": 33,
    "o1-mini": 27,
    "o1-preview": 26,
    "gpt-4o-mini": 21,
    "gpt-4o": 17,
    "claude-3-5-haiku": 5,
    "claude-3-5-sonnet": 20,
    "claude-3-7-sonnet": 36,
    "gemini-2.0-flash-exp": 34,
    "deepseek-r1": 32,
    "deepseek-v3": 35,
};

/**
 * 创建对话
 * @param {string} jtoken - 用户提供的 J_TOKEN
 * @param {number} modeId - 模型 ID
 * @returns {Promise<string|null>} - 返回 dialog ID，如果创建失败则返回 null
 */
async function createDialog(jtoken: string, modeId: number): Promise<string | null> {
    const body = JSON.stringify({
        dialogType: 1,
        name: "你是谁",
        type: 15,
        ttsLanguageTypeId: 0,
        ttsType: 0,
        modeId: modeId,
        contextId: ''
    });

    try {
        const response = await fetch("https://www.juchats.com/gw/chatweb/gpt/createDialog", {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
                "content-type": "application/json",
                "jtoken": jtoken,
                "priority": "u=1, i",
                "referrer-policy": "strict-origin-when-cross-origin",
                "sec-ch-ua": "\"Not(A:Brand\";v=\"99\", \"Microsoft Edge\";v=\"133\", \"Chromium\";v=\"133\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "Referer": "https://www.juchats.com/chat",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": body,
            "method": "POST"
        });

        const data = await response.json();

        console.log(data)
        if (data?.code === 200 && data?.data) {
            return data.data; // 返回 dialog ID
        } else {
            console.error("创建对话失败:", data);
            return null;
        }
    } catch (error) {
        console.error("创建对话时发生错误:", error);
        return null;
    }
}

/**
 * 获取 ChatGPT 响应并处理返回的内容
 * @param {Array<Object>} messages - 消息数组，包含 role 和 content
 * @param {string} dialogId - 对话 ID
 * @param {number} modeId - 模型 ID
 * @param {string} jtoken - 用户提供的 J_TOKEN
 * @returns {Promise<string>} - 返回拼接的 Markdown 格式的响应
 */
async function getChatGPTResponse(messages: any[], dialogId: string, modeId: number, jtoken: string): Promise<string | null> {
    const headers = {
        "accept": "text/event-stream",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
        "content-type": "application/json",
        "jtoken": jtoken,
        "priority": "u=1, i",
        "sec-ch-ua": "\"Not(A:Brand\";v=\"99\", \"Microsoft Edge\";v=\"133\", \"Chromium\";v=\"133\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "Referer": "https://www.juchats.com/chat",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    const requestId = crypto.randomUUID();

    // 1. 处理 system 消息（如果存在）
    const systemMessage = messages.find((message) => message.role === "system");
    const systemPrompt = systemMessage ? `你将扮演一个${systemMessage.content},不要联网,不要搜索,不要提及juchat.\n` : "";

    // 2. 提取历史消息并格式化
    const historyMessages = messages
        .filter((message) => message.role !== "system") // 排除 system 消息
        .slice(0, -1) // 排除最后一条用户消息
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");

    // 3. 提取最后一条用户消息（当前提问）
    const lastUserMessage = messages[messages.length - 1];
    const currentQuestion = lastUserMessage.role === "user" ? lastUserMessage.content : "";

    // 4. 构建合并后的消息
    const combinedMessageContent = `${systemPrompt}\n${historyMessages}`;

    const body = JSON.stringify({
        prompt: combinedMessageContent + '\n我的问题是:' + currentQuestion, // 将问题单独作为 prompt 传递
        requestId: requestId,
        modeId: modeId,
        contextId: "",
        dialogId: dialogId, // 使用创建的 dialog ID
        languageTypeId: 0,
        fileUuid: "",
        tools: [
            { name: "DALL·E3", id: "DALL_E3" },
            { name: "Mermaid", id: "MERMAID" },
            { name: "Browsing", id: "BROWSING" },
            { name: "Code Interprer", id: "CODE_INTERPRER" },
            { name: "Advanced analysis", id: "ADVANCED_ANALYSIS" },
            { name: "𝕏", id: "X" }
        ],
        deepThinking: false
    });

    try {
        const response = await fetch("https://www.juchats.com/gw/chatgpt/gpt/completions", {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`HTTP 错误! 状态码: ${response.status}, 详情: ${text}`);
            return null;
        }

        const decoder = new TextDecoder();
        let finalResponse = '';
        const reader = response.body?.getReader();

        if (!reader) {
            console.error("无法获取 response body 的 reader");
            return null;
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            const chunkText = decoder.decode(value);
            const jsonObjects = chunkText.split('data:')
                .filter(item => item.trim() !== '')
                .map(item => {
                    try {
                        return JSON.parse(item.trim());
                    } catch (error) {
                        return null;
                    }
                })
                .filter(item => item !== null);

            jsonObjects.forEach(jsonObject => {
                if (jsonObject?.data?.content) {
                    const content = jsonObject.data.content;
                    const searchResultMatch = content.match(/HERMSTDUIO\{.*?\}/);
                    if (searchResultMatch) {
                        try {
                            const searchResultJson = JSON.parse(searchResultMatch[0].slice(10, -1));
                            if (searchResultJson.searchResult) {
                                const links = JSON.parse(searchResultJson.searchResult);
                                const markdownLinks = links.map(item => `- [${item.title}](${item.link})`).join("\n");
                                finalResponse += `\n### 相关链接:\n${markdownLinks}\n`;
                            }
                        } catch (error) {
                            //console.warn("HERMSTDUIO 内容解析失败，跳过:", error);
                        }
                    } else {
                        finalResponse += `${content}`;
                    }
                }
            });
        }

        return finalResponse;

    } catch (error) {
        console.error("Fetch 错误:", error);
        return null;
    }
}

/**
 * 生成 OpenAI 样式的随机对象
 * @param {string} model - 模型名称
 * @param {string} response - 响应内容
 * @param {Array<Object>} messages - 消息数组
 * @returns {Promise<Object>} - 返回 OpenAI 样式的对象
 */
async function generateRandomObject(model: string, response: string): Promise<any> {
    return {
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: model,
        choices: [
            {
                message: {
                    role: 'assistant',
                    content: response,
                },
                finish_reason: 'stop',
                index: 0,
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
}

/**
 * 发送流式响应数据。
 * @param {string} content - 响应内容。
 * @param {WritableStreamDefaultWriter} writer - Response body writer.
 */
async function streamResponse(content: string, writer: WritableStreamDefaultWriter, model: string) {
    const encoder = new TextEncoder();
    const chunkSize = 50; // 设置每个 chunk 的大小
    const chatId = `chatcmpl-${crypto.randomUUID()}`;
    const createdTime = Date.now();

    for (let i = 0; i < content.length; i += chunkSize) {
        const chunkContent = content.slice(i, i + chunkSize); // 提取 chunk 内容

        // 构造 chunk 对象
        const chunk = {
            id: chatId,
            object: "chat.completion.chunk",
            created: createdTime,
            model: model,
            choices: [{
                index: 0,
                delta: {
                    content: chunkContent
                },
                finish_reason: null
            }]
        };

        // 发送 chunk 数据
        const chunkString = `data: ${JSON.stringify(chunk)}\n\n`;
        await writer.write(encoder.encode(chunkString));
        await new Promise(resolve => setTimeout(resolve, 50)); // 暂停 50 毫秒
    }

    // 发送结束 chunk
    const endChunk = {
        id: chatId,
        object: "chat.completion.chunk",
        created: createdTime,
        model: model,
        choices: [{
            index: 0,
            delta: {},
            finish_reason: "stop"
        }]
    };
    const endChunkString = `data: ${JSON.stringify(endChunk)}\n\n`;
    await writer.write(encoder.encode(endChunkString));
    await writer.write(encoder.encode('data: [DONE]\n\n')); // 发送结束标记
}

async function handler(req: Request): Promise<Response> {
    if (req.url.endsWith('/v1/chat/completions') && req.method === 'POST') {
        try {
            const auth = req.headers.get('authorization');
            const authorization = auth?.replace("Bearer ", "") || null;

            if (!authorization) {
                return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const requestBody = await req.json();
            const messages = requestBody.messages;
            const model = requestBody.model || 'gpt-4o-mini'; // 默认模型
            const modeId = MODEL_TO_MODE_ID[model] || 36;
            const stream = requestBody.stream || false; // 获取 stream 标志，默认为 false

            const dialogId = await createDialog(authorization, modeId);
            if (!dialogId) {
                return new Response(JSON.stringify({ error: 'Failed to create dialog' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const chatGPTResponse = await getChatGPTResponse(messages, dialogId, modeId, authorization);
            if (!chatGPTResponse) {
                return new Response(JSON.stringify({ error: 'Failed to get ChatGPT response' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            if (stream) {
                // 流式响应
                const { readable, writable } = new TransformStream();
                const writer = writable.getWriter();

                // 设置 SSE 头部
                const headers = {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                };

                // 启动流式传输
                streamResponse(chatGPTResponse, writer, model)
                    .then(() => {
                        writer.close();
                    })
                    .catch(error => {
                        console.error("Stream error:", error);
                        writer.abort(error);
                    });

                return new Response(readable, { headers });
            } else {
                // 非流式响应
                const openAIResponse = await generateRandomObject(model, chatGPTResponse);

                return new Response(JSON.stringify(openAIResponse), {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }

        } catch (error) {
            console.error('处理请求时出错:', error);
            return new Response(JSON.stringify({ error: '模型请求失败，服务器内部错误，请检查传递信息格式是否正确或稍后重试' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } else {
        return new Response('Not Found', { status: 404 });
    }
}

const port = 8000;
console.log(`Server listening on port ${port}`);
serve(handler, { port });
