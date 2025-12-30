
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

interface ComicPanelData {
  imageUrl: string;
  narrative: string;
  description: string;
}

interface ComicHistoryItem {
  id: string;
  title: string;
  panels: ComicPanelData[];
  style: string;
  date: string;
}

const ART_STYLES = [
    { name: "Classic Comic", value: "Comic Book style, vibrant colors, bold outlines, silver age aesthetic" },
    { name: "Manga Noir", value: "Modern Manga style, high contrast, black and white, sharp lines, cinematic screentones" },
    { name: "Epic Fantasy", value: "Digital Fantasy Art, detailed, painterly, epic lighting, concept art" },
    { name: "Cyberpunk", value: "Cyberpunk 2077 style, neon lights, rainy streets, gritty tech" },
    { name: "Watercolor", value: "Studio Ghibli style watercolor, soft edges, whimsical, hand-painted" },
    { name: "Retro Pixel", value: "16-bit Pixel Art, SNES style, vibrant palette, detailed sprites" }
];

const RANDOM_SEEDS = [
    "A grumpy cat who accidentally becomes a superhero",
    "A detective in a city where everyone is a robot except him",
    "A young wizard whose spells only create various types of cheese",
    "A futuristic pizza delivery pilot racing through an asteroid field",
    "A Victorian ghost trying to learn how to use a smartphone",
    "Two squirrels plotting a heist on the world's most secure birdhouse"
];

const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [comicTitle, setComicTitle] = useState<string>('Untitled Comic');
  const [selectedStyle, setSelectedStyle] = useState<string>(ART_STYLES[0].value);
  const [comicPanels, setComicPanels] = useState<ComicPanelData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ComicHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem('comic_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveToHistory = (panels: ComicPanelData[]) => {
    const newItem: ComicHistoryItem = {
      id: Date.now().toString(),
      title: comicTitle,
      panels: panels,
      style: selectedStyle,
      date: new Date().toLocaleDateString()
    };
    const newHistory = [newItem, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('comic_history', JSON.stringify(newHistory));
  };

  const handleRandomSeed = () => {
    const random = RANDOM_SEEDS[Math.floor(Math.random() * RANDOM_SEEDS.length)];
    setPrompt(random);
  };

  const generateSingleImage = async (ai: any, panelDesc: string): Promise<string> => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A single high-quality comic panel: ${panelDesc}. Style: ${selectedStyle}. No text or speech bubbles inside the image.` }],
      },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from API");
  };

  const handleGenerateComic = async () => {
    if (!prompt.trim()) {
      setError('Please enter a story idea.');
      return;
    }

    setIsLoading(true);
    setLoadingMessage('WRITING SCRIPT...');
    setError(null);
    setComicPanels([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const storyResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Create a cinematic 6-panel comic strip story based on: "${prompt}". For each panel, provide a visual description for an image and a short narrative caption. Return as JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              panels: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    narrative: { type: Type.STRING },
                  },
                  required: ["description", "narrative"]
                },
              },
            },
            required: ["panels"]
          },
        },
      });
      
      const storyData = JSON.parse(storyResponse.text);
      const panelDefinitions = storyData.panels;

      const initialPanels = panelDefinitions.map((p: any) => ({ 
        imageUrl: '', 
        narrative: p.narrative, 
        description: p.description 
      }));
      setComicPanels(initialPanels);

      const finalPanels = [...initialPanels];
      const stepMessages = ['INKING...', 'COLORING...', 'SHADING...', 'STAPLING...', 'DISTRIBUTING...', 'FINALIZING...'];

      for (let i = 0; i < panelDefinitions.length; i++) {
        setLoadingMessage(stepMessages[i] || 'DRAWING...');
        const imageUrl = await generateSingleImage(ai, panelDefinitions[i].description);
        finalPanels[i].imageUrl = imageUrl;
        setComicPanels([...finalPanels]);
      }

      saveToHistory(finalPanels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The comic ink ran out! Try again.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleRegeneratePanel = async (index: number) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const newPanels = [...comicPanels];
    // Set a loading state for just this panel
    newPanels[index].imageUrl = '';
    setComicPanels(newPanels);

    try {
      const newImageUrl = await generateSingleImage(ai, newPanels[index].description);
      newPanels[index].imageUrl = newImageUrl;
      setComicPanels([...newPanels]);
    } catch (err) {
      setError("Failed to redraw this panel.");
    }
  };

  const handleDownload = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const panelSize = 512;
    const padding = 60;
    const gap = 40;
    const titleArea = 120;
    const captionHeight = 100;
    const cols = 3;
    const rows = 2;

    canvas.width = (panelSize * cols) + (gap * (cols - 1)) + (padding * 2);
    canvas.height = (panelSize * rows) + (gap * (rows - 1)) + (padding * 2) + titleArea + (captionHeight * rows);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#000';
    ctx.font = 'bold 80px Bangers, cursive';
    ctx.textAlign = 'center';
    ctx.fillText(comicTitle.toUpperCase(), canvas.width / 2, padding + 60);

    const imagePromises = comicPanels.map(p => {
      return new Promise<HTMLImageElement>(res => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.src = p.imageUrl;
      });
    });

    const loaded = await Promise.all(imagePromises);
    loaded.forEach((img, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * (panelSize + gap);
      const y = titleArea + padding + row * (panelSize + gap + captionHeight);

      // Panel shadow/border
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 5, y + 5, panelSize, panelSize);
      ctx.drawImage(img, x, y, panelSize, panelSize);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, panelSize, panelSize);

      // Caption
      ctx.fillStyle = '#000';
      ctx.font = '22px Roboto, sans-serif';
      const text = comicPanels[i].narrative;
      const words = text.split(' ');
      let line = '';
      let textY = y + panelSize + 40;
      for (let n = 0; n < words.length; n++) {
        const test = line + words[n] + ' ';
        if (ctx.measureText(test).width > panelSize && n > 0) {
          ctx.fillText(line, x + panelSize / 2, textY);
          line = words[n] + ' ';
          textY += 28;
        } else {
          line = test;
        }
      }
      ctx.fillText(line, x + panelSize / 2, textY);
    });

    const link = document.createElement('a');
    link.download = `${comicTitle.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="app-shell">
      <header>
        <div className="logo">STRIP<span>MAKER</span></div>
        <div className="header-actions">
           <button onClick={() => setShowHistory(!showHistory)} className="nav-btn">
             {showHistory ? 'Back to Editor' : 'My Collection'}
           </button>
        </div>
      </header>

      <main>
        {showHistory ? (
          <div className="history-section">
            <h2 className="section-title">Archived Issues</h2>
            {history.length === 0 ? (
                <p className="empty-state">No comics saved yet. Start creating!</p>
            ) : (
                <div className="history-grid">
                    {history.map(item => (
                        <div key={item.id} className="history-card" onClick={() => {
                            setComicTitle(item.title);
                            setComicPanels(item.panels);
                            setShowHistory(false);
                        }}>
                            <img src={item.panels[0].imageUrl} alt={item.title} />
                            <div className="card-info">
                                <h3>{item.title}</h3>
                                <span>{item.date}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        ) : (
          <>
            <section className="editor-controls">
              <div className="control-card input-main">
                <div className="field-group">
                  <label>Issue Title</label>
                  <input 
                    type="text" 
                    value={comicTitle} 
                    onChange={e => setComicTitle(e.target.value)} 
                    placeholder="Amazing Adventures #1"
                  />
                </div>
                <div className="field-group">
                  <label>The Story Idea</label>
                  <div className="prompt-wrapper">
                    <textarea 
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder="Once upon a time..."
                    />
                    <button onClick={handleRandomSeed} className="surprise-btn" title="Surprise Me">🎲</button>
                  </div>
                </div>
              </div>

              <div className="control-card style-picker">
                <label>Art Direction</label>
                <div className="styles-grid">
                  {ART_STYLES.map(style => (
                    <button 
                      key={style.name}
                      className={`style-btn ${selectedStyle === style.value ? 'active' : ''}`}
                      onClick={() => setSelectedStyle(style.value)}
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="action-row">
                <button 
                    onClick={handleGenerateComic} 
                    disabled={isLoading}
                    className="generate-main"
                >
                    {isLoading ? 'GENERATING...' : 'BOOM! CREATE COMIC'}
                </button>
                {comicPanels.length > 0 && !isLoading && (
                  <button onClick={handleDownload} className="download-btn">Download PNG</button>
                )}
              </div>
            </section>

            <section className="comic-viewer">
              {error && <div className="error-bar">⚠️ {error}</div>}
              
              {!isLoading && comicPanels.length === 0 && !error && (
                <div className="empty-placeholder">
                  <div className="comic-icon">🗯️</div>
                  <p>Ready to visualize your story? Enter a prompt above!</p>
                </div>
              )}

              <div className="strip-layout">
                {comicPanels.map((panel, idx) => (
                  <div key={idx} className="comic-panel-wrapper">
                    <div className="panel-frame">
                      {panel.imageUrl ? (
                        <>
                          <img src={panel.imageUrl} alt={`Panel ${idx + 1}`} />
                          <button 
                            className="redraw-panel" 
                            onClick={() => handleRegeneratePanel(idx)}
                            title="Redraw this panel"
                          >
                            🔄
                          </button>
                        </>
                      ) : (
                        <div className="panel-loading">
                          <div className="spinner"></div>
                          <span>{loadingMessage || 'WAITING...'}</span>
                        </div>
                      )}
                      <div className="panel-number">{idx + 1}</div>
                    </div>
                    <div className="panel-caption">
                      <p>{panel.narrative}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
