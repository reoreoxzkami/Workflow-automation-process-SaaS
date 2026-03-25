import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateWorkflowWithAI(
  prompt: string,
  availableAgents: { id: string, name: string }[],
  userApiKey?: string
) {
  try {
    const client = userApiKey ? new GoogleGenAI({ apiKey: userApiKey }) : ai;
    const response = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User request: ${prompt}\n\nAvailable Agents: ${JSON.stringify(availableAgents)}`,
      config: {
        systemInstruction: `You are an expert automation architect. Your task is to design a workflow based on the user's request.
        A workflow consists of a name and a series of steps.
        
        Available Step Types:
        - trigger_manual: No config.
        - trigger_schedule: { interval: number } (minutes)
        - trigger_location: { radius: number } (meters)
        - trigger_webhook: { webhookId: string } (use a random short string)
        - agent_call: { agentId: string } (MUST use an ID from the provided list)
        - action_notify: No config.
        - action_email: { to: string, subject: string, body: string } (use {{output}} placeholder for previous step data)
        - action_clipboard: No config.
        - action_download: No config.
        - action_camera: No config.
        - action_share: No config.
        - action_vibrate: No config.
        - action_audio: No config.

        Return ONLY a JSON object matching this structure:
        {
          "name": "Descriptive Workflow Name",
          "steps": [
            { "type": "step_type", "config": { ... } }
          ]
        }`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  config: { type: Type.OBJECT }
                },
                required: ["type", "config"]
              }
            }
          },
          required: ["name", "steps"]
        }
      },
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error generating workflow:", error);
    throw error;
  }
}

export async function generateAgentResponse(
  model: string,
  systemInstruction: string,
  prompt: string,
  tools?: string[],
  toolConfig?: Record<string, any>,
  agentApiKey?: string,
  userApiKey?: string
) {
  try {
    const apiKey = agentApiKey || userApiKey;
    const client = apiKey ? new GoogleGenAI({ apiKey }) : ai;
    
    const geminiTools: any[] = [];
    if (tools?.includes('web_search')) {
      geminiTools.push({ googleSearch: {} });
    }
    if (tools?.includes('code_exec')) {
      geminiTools.push({ codeExecution: {} });
    }

    const config: any = {
      systemInstruction: systemInstruction,
    };

    if (geminiTools.length > 0) {
      config.tools = geminiTools;
    }

    if (tools?.includes('image_gen') && toolConfig?.image_gen) {
      config.imageConfig = {
        aspectRatio: toolConfig.image_gen.aspectRatio,
        imageSize: toolConfig.image_gen.imageSize,
      };
    }

    const response = await client.models.generateContent({
      model: model || "gemini-3-flash-preview",
      contents: prompt,
      config: config,
    });
    
    // Handle potential image output if image_gen is enabled
    if (tools?.includes('image_gen')) {
      const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (imagePart) {
        return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      }
    }

    return response.text;
  } catch (error) {
    console.error("Error generating agent response:", error);
    throw error;
  }
}
