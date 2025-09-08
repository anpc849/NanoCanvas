# NanoCanvas: The AI Canvas of Limitless Creations (+ Technical Notes)


**Note**: I am not very good at writing in English, so this document was written with the help of GPT-5. But don’t worry—I checked everything carefully to make sure it really matches my ideas.

## 1. Introduction

First of all, I want to share my gratitude:  
>Thanks to **Google AI Studio**, expressing my ideas has become much easier, even with very little coding experience.  

I’m excited to introduce my project: **NanoCanvas – the AI canvas where small ideas spark limitless creations.**  
It’s a space where you can build, imagine, and create anything within a limitless canvas.  

👉 [Product Demo](https://ai.studio/apps/drive/16qKBUpJQ47Pe6ddJMwpNEE-sD04S4pdv)  
👉 [Source Code on GitHub](https://github.com/anpc849/NanoCanvas)  

I’d love to share this demo with developers who might help make the app even better.  
(Actually, I built this app without writing a single line of code!)  


>I was honestly surprised when I finished this app—because only **two models** (`Gemini 2.5 Flash` and `Gemini 2.5 Flash Image Preview`) were enough to make everything work.  
Compared to apps like **ComfyUI**, which are complex to install and require many components to run, my app works entirely inside **Google AI Studio App**.  
That means it’s easy to share and anyone with an internet connection can use it right away.  

>I hope this app will remain **open source and non-commercial** (except for necessary API model calls), so that everyone can freely use and build upon it.  


Below is the **technical document**, where I outline the ideas and methods I used to approach the problem.  
This is not production-ready code, just my conceptual design. My hope is that by writing this in detail, developers with stronger coding skills can get a first look at how NanoCanvas works and improve upon it.  

---
### Core Idea

NanoCanvas operates on a single, powerful philosophy: **"Your Layout is the Prompt."**

This is achieved not through a single monolithic AI call, but by an orchestrated pipeline of specialized AI tasks using different Gemini models. The core technical strategy involves **multi-modal understanding** and **prompt chaining**, where the output of one AI model becomes the highly optimized input for another.

This document details the four primary AI engines that power NanoCanvas.


---

## 2. The Interpretation Engine: Translating Vision to Words

The first and most critical step in any canvas-based generation is translating the user's visual arrangement into a clear, actionable instruction for a generative model. This is the responsibility of the **Interpretation Engine**.

- **Model**: `gemini-2.5-flash` (configurable via `modelSettings.interpretation`)  
- **Function**: `interpretCanvas()` in `geminiService.ts`  

### Process
**Multi-Modal Input**: The engine receives three key pieces of information:
1. **Canvas Snapshot**: A PNG image capturing spatial relationships, scale, and rotation of a **selected area on canvas**.  
2. **Serialized Item Data**: Structured text describing item type, original prompt/content, position, and color.  
3. **User Prompt (Optional)**: Raw text typed by the user.  

**System Instruction**: The power of the Interpretation Engine comes from its highly detailed `systemInstruction`, which primes `gemini-2.5-flash` to act as an expert visual assistant.  
Key directives include:
- **Enforce Coherence (Smart Layer Linking)**: Ensure a physically plausible scene with consistent interactions, lighting, and scaling.  
- **Interpret Drawings as Actions**: Lines = motion paths, circles = focal points, shapes = placeholders.  
- **Synthesize and Prioritize**: Fuse all inputs into one coherent command. User text prompt is the strongest signal.  

**Prompt Chaining Output**: Produces a **single, optimized sentence**, used as the input for the Generation or Animation engines.

**Example**  
- **Bad Prompt**: "A cat is inside a rocket with the text 'to the moon!'"  
- **Good Prompt**: "A photorealistic image of a cat wearing an astronaut helmet, looking out the window of a rocket flying through space, with Earth visible in the background."
---

## 3. The Generation Engine: Creating a Coherent Image

Once a high-quality prompt is generated, the **Generation Engine** creates the final image. It has two distinct pathways.

- **Models**:  
  - `gemini-2.5-flash-image-preview` (Canvas-to-Image)  
  - `imagen-4.0-generate-001` (Text-to-Image)  
- **Functions**: `generateImageFromText()`, `generateImageFromCanvas()`

### Pathway A: Text-to-Image
- Used when **no canvas items are selected**.  
- Directly transforms the user prompt into an image.  

### Pathway B (Core Feature of NanoCanvas): Canvas-to-Image
- Used when **items are selected**.  
- Uses a **two-step reasoning process** with `ai.chats.create`.  

**Step 1: The Plan**  
- Inputs: canvas snapshot, source images, optimized prompt.  
- Instruction: "First, confirm you understand the task by briefly describing the image you will create. Do not generate the image yet, only text."  

**Step 2: The Execution**  
- The model replies with a **text-only plan**.  
- The system acknowledges the plan: *"That sounds correct. Please proceed and generate the image now."*  
- Model generates the final image.  

This **reason-first, generate-later** approach improves coherence and reduces errors.

---

## 4. The Inpainting & Outpainting Engine: Surgical Edits

Magic Fill, Magic Replace, and Generative Expand are powered by **mask-based editing**.

- **Model**: `gemini-2.5-flash-image-preview`  
- **Functions**: `editImageWithMask()`, `generateOutpaintedImage()`

### Core Concept: The Power of the Mask
Inputs:
- **Source Image**: The original image.  
- **Mask Image**: Black = untouched, White = editable.  
- **Text Prompt**: Describes edits to the white area.  
- **Reference Image (Optional)**: For replacement edits.  

### Implementations
- **Magic Fill**:  
  - User's drawing → white mask shape on black canvas.  
  - Model fills area according to prompt.  

- **Magic Replace**:  
  - Same as Magic Fill, but with an additional reference image.  
  - The model blends the reference into the masked area.  

- **Generative Expand (Outpainting)**:  
  - Larger canvas created, with the original image centered.  
  - Mask covers original image (black) and leaves surrounding area white.  
  - Prompt instructs model to plausibly extend the scene.  

---
## 5. Limitations & Future Work

### Limitations
1. **No Prompt Optimization Yet**  
   I haven’t applied any systematic prompt optimization for the models used in the app. This leaves room for significant improvements in both accuracy and efficiency.  

2. **Codebase Auto-Generated by Gemini 2.5 Pro**  
   The current codebase was generated entirely by **Gemini 2.5 Pro**. While this allowed the app to come to life quickly, it means the code still needs serious refactoring and optimization by experienced developers.  

3. **Limited Exploration of Gemini 2.5 Flash Image Preview**  
   I haven’t explored this model in depth yet. Most of my design choices were based on intuition—for example, I introduced the **two-step process** described in Pathway B (Core Feature of NanoCanvas).
   
5. **Unstable Performance**  
   Due to the factors above, NanoCanvas currently runs in an **unstable** manner. Stability and reliability should be a major focus for future development.  


### Future Work (Only focus on improve Canvas2Image feature)

- **Context vs. Efficiency in Pathway B**  
  My previous approach was to send only **items + optimized prompt** to `gemini-2.5-flash-image-preview`.  
  - **Pros**: Good image quality and efficient token usage.  
  - **Cons**: Limited "understand context" ability, since the optimized prompt alone cannot fully capture spatial layout (e.g., arrows pointing to a specific region in the canvas).   

  When both the **canvas snapshot** and optimized prompt are included, the model understands layout and context more effectively. However, this comes at the cost of **higher token usage** and sometimes **lower generation efficiency**.  

  Currently, I don’t know how to balance this trade-off, so I **welcome any suggestions or optimization ideas** that can help preserve *contextual accuracy* from the snapshot while still maintaining *generation efficiency* during image creation.  
