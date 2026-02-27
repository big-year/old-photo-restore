import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

export type RestorationMode = 'standard' | 'ultra';

export async function restoreImage(
  base64Image: string, 
  mimeType: string, 
  mode: RestorationMode = 'standard'
): Promise<string> {
  // Use API_KEY (user selected) if available, fallback to GEMINI_API_KEY (platform default)
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key not found. Please ensure GEMINI_API_KEY is set or select a key.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const model = mode === 'ultra' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  const imageSize = mode === 'ultra' ? '2K' : undefined;

  console.log(`Starting ${mode} restoration using model: ${model}`);

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1] || base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: mode === 'ultra' 
              ? `Please perform a professional, Ultra-High-Definition (UHD) restoration on this old photo. 
Key Requirements:
1. Super Resolution: Upscale the image to 2K resolution while maintaining perfect sharpness. Use AI to reconstruct missing details in faces, hair, and textures.
2. Clarity & Sharpness: Eliminate all blurriness. The final image should look like a modern high-resolution digital photograph.
3. Background Preservation: Detect the physical photo boundaries and crop out any surrounding background (like a desk or floor).
4. Color Fidelity: Strictly maintain the original color palette. If the background is blue, it MUST remain blue. Do not shift hues.
5. Damage Repair: Seamlessly remove all scratches, dust, folds, and water stains.
Return ONLY the final processed image data.`
              : `Please perform a professional restoration on this old photo. 
1. Boundary Detection: Detect the physical photo boundaries and crop out any surrounding background.
2. Damage Repair: Repair any scratches, dust, or tears. 
3. Color Fidelity: Preserve the original color palette and background colors as much as possible. 
4. Enhancement: Improve the overall clarity and vibrancy.
Return ONLY the final restored and cropped image.`,
          },
        ],
      },
      config: {
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT" as any,
            threshold: "BLOCK_NONE" as any,
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH" as any,
            threshold: "BLOCK_NONE" as any,
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as any,
            threshold: "BLOCK_NONE" as any,
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT" as any,
            threshold: "BLOCK_NONE" as any,
          },
        ],
        ...(imageSize ? {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: imageSize as any
          }
        } : {})
      }
    });

    console.log(`Response received for ${mode} restoration`, response);

    const candidate = response.candidates?.[0];
    
    if (!candidate) {
      throw new Error("Gemini 未返回任何候选结果。可能是由于安全过滤或请求被拒绝。");
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`生成已停止，原因: ${candidate.finishReason}。请尝试上传其他照片。`);
    }

    const parts = candidate.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("Gemini 返回的响应中没有内容部分 (parts)。");
    }

    for (const part of parts) {
      if (part.inlineData) {
        console.log(`Image data found in response`);
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    // If no image part found, check if there's text (maybe an error message from the model)
    const textPart = parts.find(p => p.text);
    if (textPart) {
      console.warn("Model returned text instead of image:", textPart.text);
      throw new Error(`模型未返回图像，而是返回了文字说明: ${textPart.text}`);
    }

    throw new Error("Gemini 未返回有效的图像数据。");
  } catch (error: any) {
    console.error(`${mode} restoration failed:`, error);
    
    // Handle specific API errors
    if (error.message?.includes("fetch failed")) {
      throw new Error("网络连接失败，请检查您的网络设置或 API 密钥是否有效。");
    }
    
    if (error.message?.includes("Safety")) {
      throw new Error("由于安全政策，该照片无法处理。请尝试上传其他照片。");
    }

    throw error;
  }
}
