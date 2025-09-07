
import { GoogleGenAI, Modality, GenerateContentResponse, Chat } from "@google/genai";
import { CanvasItem, ImageItem, TextItem, SelectionRect } from '../types';

let aiInstance: GoogleGenAI | null = null;

const getAiClient = (): GoogleGenAI => {
    if (aiInstance) {
        return aiInstance;
    }
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set. Please set it to use the Gemini API.");
    }
    aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return aiInstance;
};

function isImageItem(item: CanvasItem): item is ImageItem {
    return item.type === 'image';
}

function isTextItem(item: CanvasItem): item is TextItem {
    return item.type === 'text';
}

function serializeCanvasItems(items: CanvasItem[]): string {
    let description = "The user has arranged the following items on a canvas:\n";
    items.forEach(item => {
        const rotationInfo = item.rotation !== 0 ? ` with a rotation of ${Math.round(item.rotation)} degrees` : '';
        if (item.type === 'image') {
            description += `- An image (originally from prompt: '${item.prompt}') is at position (${Math.round(item.x)}, ${Math.round(item.y)})${rotationInfo}.\n`;
        } else if (item.type === 'text') {
            description += `- A text note with content "${item.text}" (color: ${item.color}) is at position (${Math.round(item.x)}, ${Math.round(item.y)})${rotationInfo}.\n`;
        } else if (item.type === 'drawing') {
            if (item.points.length > 1) {
                const xs = item.points.map(p => p.x);
                const ys = item.points.map(p => p.y);
                const minX = Math.round(Math.min(...xs));
                const minY = Math.round(Math.min(...ys));
                description += `- A ${item.color} freehand drawing is on the canvas, located near (${minX}, ${minY})${rotationInfo}.\n`;
            }
        }
    });
    return description;
}

export const interpretCanvas = async (snapshotDataUrl: string, items: CanvasItem[], userPrompt: string | null, model: string): Promise<string> => {
    const ai = getAiClient();
    const snapshotBase64 = snapshotDataUrl.split(',')[1];
    const snapshotPart = {
        inlineData: {
            mimeType: 'image/png',
            data: snapshotBase64,
        },
    };

    const serializedContent = serializeCanvasItems(items);
    const systemInstruction = `You are an expert AI assistant for a visual thinking application. You will be given a SNAPSHOT image of a user's canvas selection, along with a text description of the items and an optional user prompt. Your task is to interpret this visual and textual information to generate an optimized, single-sentence command for an IMAGE or VIDEO model.

**Key principles for interpretation:**
1.  **Analyze the Visuals First:** The provided snapshot is your primary source of truth. Understand the spatial relationships, the content of the images, and any drawings or text notes. Use the text description for supplementary information like original image prompts.
2.  **Prioritize Action over Description:** Your goal is to generate an *instruction* or *action*. Do NOT simply describe what you see.
3.  **Enforce Coherence (Smart Layer Linking):** When multiple items are selected, your primary goal is to link them into a single, physically plausible, and coherent scene. This involves:
    *   **Interaction:** Objects should interact logically based on the prompt and their nature (e.g., a person sits *on* a chair, a cup rests *on* a table).
    *   **Physics & Realism:** Ensure consistent lighting, shadows, and perspective across all elements in the final generated image.
    *   **Scale:** Adjust the relative scale of objects to be realistic unless the prompt specifies otherwise.
4.  **Focus on the Change / Fusion:** Assume the user wants to *edit, combine, or modify* existing items.
    *   If the user provides a prompt or drawing, that specifies the change.
    *   If two distinct characters/styles are presented together with no other instruction, infer a *stylistic fusion*. The goal is to apply the style of one item to the subject of the other. The prompt should describe this artistic blend. Avoid generic prompts like "combine them".
5.  **Interpret Drawings as Actions:** Do NOT describe drawings literally. A freehand drawing is a gesture indicating an action.
    *   A line connecting an object to a location means "move the object there."
    *   A circle around an object means "focus on this object" or "change this object."
    *   A rough shape is likely a placeholder for a new object to be generated.
6.  **Synthesize All Elements:** Combine the visual meaning from the snapshot, the meaning of any text notes, the interpreted drawings, AND the user's direct text prompt into a single, cohesive instruction.
7.  **Prioritize User's Text:** The user's direct text prompt, if provided, is the strongest signal of their intent and must be the primary driver of the final prompt.

**Example Scenario 1 (Smart Linking & Interaction):**
- Snapshot shows: An image of a 'person standing' on the left, and an image of a 'wooden chair' on the right.
- User Prompt: "make them interact"
- Good optimized prompt: "A realistic image of the person sitting comfortably on the wooden chair, with consistent lighting and shadows."

**Example Scenario 2 (Stylistic Fusion):**
- Snapshot shows: An image of a 'Labubu macaron toy' on the left, and an image of 'Pikachu' on the right.
- User Prompt: (none)
- Bad prompt: "Combine the Labubu toy and Pikachu."
- Good optimized prompt: "Redraw Pikachu in the artistic style of the Labubu toy, incorporating its characteristic toothy grin and overall aesthetic."

Your output must be ONLY the final, optimized prompt, phrased as a clear instruction.`;

    let textualPrompt = `This is a description of the items in the snapshot, providing extra context like original prompts:\n${serializedContent}`;
    if (userPrompt && userPrompt.trim()) {
        textualPrompt += `\n\nDirect user instruction: "${userPrompt.trim()}"`;
    }
    textualPrompt += `\n\nBased on the snapshot image and all the text, generate the single, optimized instruction.`;
    
    const textPart = { text: textualPrompt };
    
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: { parts: [snapshotPart, textPart] },
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.4,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error interpreting canvas:", error);
        throw new Error("Failed to generate an optimized prompt from the canvas layout.");
    }
};

export const interpretMagicFill = async (
    snapshotDataUrl: string,
    sourceImage: ImageItem | null,
    userPrompt: string,
    model: string
): Promise<string> => {
    const ai = getAiClient();
    const snapshotBase64 = snapshotDataUrl.split(',')[1];
    const snapshotPart = {
        inlineData: {
            mimeType: 'image/png',
            data: snapshotBase64,
        },
    };

    const modelParts: ({ inlineData: { data: string; mimeType: string; }; } | { text: string; })[] = [snapshotPart];
    let systemInstruction: string;
    let textualPrompt: string;

    if (sourceImage) {
        const sourceImagePart = {
            inlineData: {
                data: sourceImage.src.split(',')[1],
                mimeType: sourceImage.mimeType,
            },
        };
        modelParts.push(sourceImagePart);
        systemInstruction = `You are an expert image editing assistant. You will be given a 'target image' with a masked area (indicated by a drawing) and a 'source image'. Your task is to generate a concise instruction for an inpainting model on how to seamlessly blend the source image into the masked area of the target image, considering the user's optional prompt. If the user's prompt is empty or vague, describe a seamless blend that matches lighting, perspective, and style. For example, 'realistically blend the source image into the masked area, matching the target image's warm afternoon lighting and soft focus'. Your output must be ONLY the final, optimized instruction.`;
        textualPrompt = `The main image is the target with the mask. The second image is the source. The user's optional instruction is: "${userPrompt}". Generate the optimized instruction.`;
    } else {
        systemInstruction = `You are an expert image editing assistant. You will be given an image with a masked area (indicated by a drawing). Your task is to analyze the surrounding image content and the user's optional prompt to generate a concise, descriptive instruction for an inpainting model. If the user prompt is empty or vague, generate a plausible instruction based on the image context. For example, if the mask is on an empty patch of grass, you might suggest 'a small, colorful patch of wildflowers'. Your output must be ONLY the final, optimized instruction.`;
        textualPrompt = `The user's optional instruction for filling the masked area is: "${userPrompt}". Generate the optimized instruction.`;
    }

    modelParts.push({ text: textualPrompt });

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: { parts: modelParts },
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.4,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error interpreting magic fill:", error);
        throw new Error("Failed to generate an optimized prompt for the magic fill task.");
    }
};

export const editImageWithMask = async (
    targetImage: ImageItem,
    maskImageBase64: string,
    prompt: string,
    referenceImage?: ImageItem | null
): Promise<{ base64: string; mimeType: string }> => {
    const ai = getAiClient();

    const targetImagePart = {
        inlineData: {
            data: targetImage.src.split(',')[1],
            mimeType: targetImage.mimeType,
        },
    };

    const maskImagePart = {
        inlineData: {
            data: maskImageBase64.split(',')[1],
            mimeType: 'image/png',
        },
    };
    
    // FIX: Explicitly type `modelParts` to allow both image (`inlineData`) and text (`text`) parts.
    // This resolves a TypeScript error where the array type was being inferred too narrowly
    // from its initial contents, preventing text parts from being added later.
    const modelParts: ({ inlineData: { data: string; mimeType: string; }; } | { text: string; })[] = [targetImagePart, maskImagePart];
    let textPrompt: string;

    if (referenceImage) {
        const referenceImagePart = {
            inlineData: {
                data: referenceImage.src.split(',')[1],
                mimeType: referenceImage.mimeType,
            },
        };
        modelParts.push(referenceImagePart);
        textPrompt = `You are an expert image editor. I am providing a 'target image', a 'mask image', and a 'reference image'. Your task is to replace the content within the white area of the mask on the target image with content from the reference image. Blend it seamlessly into the target image, matching lighting and style. The black area of the mask must remain completely unchanged. The user's optional instruction is: "${prompt}". If no instruction is provided, focus on a high-quality, seamless blend. Only return the final, edited image. Do not return any text.`;
    } else {
        textPrompt = `You are an expert image editor. I am providing a source image and a mask image. In the mask, the white area indicates the region to be modified. Your task is to edit the source image within that masked area based on my instruction, and seamlessly blend your edits with the rest of the image. The black area of the mask must remain completely unchanged. My instruction is: "${prompt}". Only return the final, edited image. Do not return any text.`;
    }
    
    modelParts.push({ text: textPrompt });
    
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: modelParts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
            return {
                base64: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
            };
        }
        
        const safetyFeedback = response.promptFeedback;
        let errorMessage = "The model did not return an image.";
        if (safetyFeedback?.blockReason) {
            errorMessage += ` Reason: ${safetyFeedback.blockReason}.`;
        }
        throw new Error(errorMessage);
        
    } catch (error) {
        console.error("Error editing image with mask:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to edit image: ${error.message}`);
        }
        throw new Error("Failed to edit image due to an unknown error.");
    }
};

export const generateOutpaintedImage = async (
    enlargedImageBase64: string,
    maskImageBase64: string,
    prompt: string
): Promise<{ base64: string; mimeType: string }> => {
    const ai = getAiClient();

    const enlargedImagePart = {
        inlineData: {
            data: enlargedImageBase64.split(',')[1],
            mimeType: 'image/png',
        },
    };

    const maskImagePart = {
        inlineData: {
            data: maskImageBase64.split(',')[1],
            mimeType: 'image/png',
        },
    };

    const textPrompt = `You are an expert image editor. I am providing a source image and a mask image. Your task is to seamlessly outpaint or expand the existing image to fill the white areas of the mask based on my instruction, creating a plausible and coherent extension of the original scene. The black area of the mask, which contains the original image, must remain completely unchanged. My instruction is: "${prompt}". Only return the final, edited image. Do not return any text.`;
    
    const textPart = { text: textPrompt };
    
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [enlargedImagePart, maskImagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
            return {
                base64: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
            };
        }
        
        const safetyFeedback = response.promptFeedback;
        let errorMessage = "The model did not return an image.";
        if (safetyFeedback?.blockReason) {
            errorMessage += ` Reason: ${safetyFeedback.blockReason}.`;
        }
        throw new Error(errorMessage);
        
    } catch (error) {
        console.error("Error editing image with mask:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to edit image: ${error.message}`);
        }
        throw new Error("Failed to edit image due to an unknown error.");
    }
};

const generateImageFromText = async (
    prompt: string,
    model: string = 'imagen-4.0-generate-001'
): Promise<{ base64: string; mimeType: string; textResponse: string }> => {
    const ai = getAiClient();

    if (model === 'gemini-2.5-flash-image-preview') {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [{ text: `Generate a high-quality, photorealistic image of: ${prompt}` }] },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
            return {
                base64: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
                textResponse: `Image generated with ${model}.`,
            };
        }
        const safetyFeedback = response.promptFeedback;
        let errorMessage = "The model did not return an image from the text prompt.";
        if (safetyFeedback?.blockReason) {
            errorMessage += ` Reason: ${safetyFeedback.blockReason}.`;
        }
        throw new Error(errorMessage);
    }

    // Default to 'imagen-4.0-generate-001'
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '1:1',
        },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
        throw new Error("The model did not return an image. It may have been blocked for safety reasons.");
    }

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return { base64: base64ImageBytes, mimeType: 'image/png', textResponse: `Image generated with ${model}.` };
};

const generateImageFromCanvas = async (
    prompt: string,
    images: ImageItem[],
    snapshotDataUrl: string,
    onStepUpdate: (message: string) => void,
    model: string = 'gemini-2.5-flash-image-preview'
): Promise<{ base64: string; mimeType: string; textResponse: string }> => {
    const ai = getAiClient();
    const chat: Chat = ai.chats.create({ model: model });

    const snapshotBase64 = snapshotDataUrl.split(',')[1];
    const snapshotPart = {
        inlineData: { mimeType: 'image/png', data: snapshotBase64 },
    };
    const imageParts = images.map(image => ({
        inlineData: { data: image.src.split(',')[1], mimeType: image.mimeType },
    }));

    const confirmationPrompt = `You are an expert image editor. I will provide a 'Canvas Snapshot' for layout, 'Source Images' as assets, and a 'Final Instruction'.
First, confirm you understand the task by briefly describing the image you will create. **Do not generate the image yet, only text.**
- **Canvas Snapshot:** Your primary guide for placement, scale, and composition.
- **Source Images:** Assets to be placed or modified.
- **Final Instruction:** "${prompt}"
Describe your plan now.`;

    const confirmationTextPart = { text: confirmationPrompt };
    const initialParts = [snapshotPart, ...imageParts, confirmationTextPart];

    onStepUpdate("Sending context to model for confirmation...");
    const confirmationResponse: GenerateContentResponse = await chat.sendMessage({
        message: initialParts,
        config: { responseModalities: [Modality.TEXT] },
    });

    const confirmationText = confirmationResponse.text.trim();
    if (!confirmationText) {
        const safetyFeedback = confirmationResponse.promptFeedback;
        let errorMessage = "Model did not provide a confirmation plan.";
        if (safetyFeedback?.blockReason) {
            errorMessage += ` Reason: ${safetyFeedback.blockReason}.`;
        }
        throw new Error(errorMessage);
    }
    onStepUpdate(`Model Plan: ${confirmationText}`);

    onStepUpdate("Confirmation received. Requesting final image...");
    const generationResponse: GenerateContentResponse = await chat.sendMessage({
        message: "That sounds correct. Please proceed and generate the image now.",
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    
    const candidate = generationResponse.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
        const safetyFeedback = generationResponse.promptFeedback;
        let errorMessage = "The model did not return an image in the final step.";
        if (safetyFeedback?.blockReason) {
            errorMessage += ` Reason: ${safetyFeedback.blockReason}.`;
            if (safetyFeedback.safetyRatings) {
                const harmfulCategories = safetyFeedback.safetyRatings
                    .filter(r => r.probability !== 'NEGLIGIBLE' && r.probability !== 'LOW')
                    .map(r => r.category.replace('HARM_CATEGORY_', ''));
                if (harmfulCategories.length > 0) {
                    errorMessage += ` Potentially harmful content detected in categories: ${harmfulCategories.join(', ')}.`;
                }
            }
        } else {
             errorMessage += " The request may have been refused for safety reasons or lack of content.";
        }
        throw new Error(errorMessage);
    }

    let generatedImage: { base64: string; mimeType: string } | null = null;
    let textResponse = "Image generated successfully.";

    for (const part of candidate.content.parts) {
        if (part.inlineData && !generatedImage) {
            generatedImage = { base64: part.inlineData.data, mimeType: part.inlineData.mimeType };
        } else if (part.text) {
            textResponse = part.text;
        }
    }

    if (!generatedImage) {
        throw new Error("The model did not return an image in the final step. It might have refused the request.");
    }

    return { ...generatedImage, textResponse };
};

export const generateImage = async (
    prompt: string,
    images: ImageItem[],
    snapshotDataUrl: string,
    onStepUpdate: (message: string) => void,
    model?: string
): Promise<{ base64: string; mimeType: string; textResponse: string }> => {
    try {
        if (images.length === 0) {
            onStepUpdate("Using text-to-image model for direct generation...");
            return await generateImageFromText(prompt, model);
        } else {
            return await generateImageFromCanvas(prompt, images, snapshotDataUrl, onStepUpdate, model);
        }
    } catch (error) {
        console.error("Error generating image:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate the final image: ${error.message}`);
        }
        throw new Error("Failed to generate the final image due to an unknown error.");
    }
};

export const generateVideo = async (
    prompt: string,
    snapshotDataUrl: string,
    onStepUpdate: (message: string) => void,
    model: string
): Promise<{ videoBlob: Blob, mimeType: string }> => {
    const ai = getAiClient();
    const snapshotBase64 = snapshotDataUrl.split(',')[1];
    
    try {
        onStepUpdate("Starting video generation... This may take several minutes.");
        
        let operation = await ai.models.generateVideos({
            model: model,
            prompt: prompt,
            image: {
                imageBytes: snapshotBase64,
                mimeType: 'image/png',
            },
            config: { numberOfVideos: 1 }
        });
        
        onStepUpdate("Video request sent. AI is now processing your scene.");
        
        const reassuringMessages = [
            "Animating pixels...", "Composing the perfect shot...", "Rendering the final cut...", "Almost there, adding finishing touches..."
        ];
        let messageIndex = 0;

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            onStepUpdate(reassuringMessages[messageIndex % reassuringMessages.length]);
            messageIndex++;
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        if (operation.error) {
            throw new Error(`Video generation failed: ${operation.error.message}`);
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation completed, but no download link was provided.");
        }
        
        onStepUpdate("Video processed! Downloading video data...");
        
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) {
            throw new Error(`Failed to download video file. Status: ${response.status}`);
        }
        const videoBlob = await response.blob();
        
        return { videoBlob, mimeType: 'video/mp4' };

    } catch (error) {
        console.error("Error generating video:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate video: ${error.message}`);
        }
        throw new Error("Failed to generate video due to an unknown error.");
    }
};
