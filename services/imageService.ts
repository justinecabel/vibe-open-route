
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateJeepneyLogo = async (): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: 'A professional minimalist modern logo of a Philippine Jeepney, vector art style, flat design, vibrant yellow and indigo blue colors, symmetrical, clean lines, white background, high resolution, square composition.',
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Logo generation failed:", error);
    return null;
  }
};
