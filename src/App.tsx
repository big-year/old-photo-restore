/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Image as ImageIcon, Sparkles, CheckCircle2, Loader2, Trash2, Download, History, Key, ExternalLink, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { restoreImage, type RestorationMode } from './services/gemini';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PhotoItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: string;
  error?: string;
  adjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpness: number;
  };
}

export default function App() {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [restorationMode, setRestorationMode] = useState<RestorationMode>('standard');

  React.useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        }
      } catch (err) {
        console.error("Failed to check API key status:", err);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      }
    } catch (err) {
      console.error("Failed to open API key selector:", err);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPhotos = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as const,
      adjustments: {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        sharpness: 0,
      },
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const processPhoto = async (photo: PhotoItem) => {
    if (photo.status === 'processing' || photo.status === 'completed') return;

    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: 'processing' } : p));

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("请求超时，请重试")), 90000) // 90 seconds timeout
    );

    try {
      const base64 = await fileToBase64(photo.file);
      const restorationPromise = restoreImage(base64, photo.file.type, restorationMode);
      
      // Race the restoration against the timeout
      const result = await Promise.race([restorationPromise, timeoutPromise]) as string;
      
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: 'completed', result } : p));
    } catch (err: any) {
      console.error("Restoration error:", err);
      let errorMessage = err.message || '修复失败，请重试';
      
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        errorMessage = 'API 密钥失效，请重新选择';
      } else if (err.message?.includes("quota") || err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = 'API 配额已耗尽。请稍后再试，或在 Google AI Studio 中检查您的配额限制。';
      } else if (err.message?.includes("fetch failed")) {
        errorMessage = '网络连接失败，请检查您的网络设置。';
      }

      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: 'error', error: errorMessage } : p));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const pendingPhotos = photos.filter(p => p.status === 'pending' || p.status === 'error');
    for (const photo of pendingPhotos) {
      await processPhoto(photo);
    }
    setIsProcessingAll(false);
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.preview);
      return prev.filter(p => p.id === id ? false : true);
    });
  };

  const downloadImage = (photo: PhotoItem) => {
    if (!photo.result) return;
    
    const img = new Image();
    img.src = photo.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;

      // Apply filters to canvas
      const { brightness, contrast, saturation, sharpness } = photo.adjustments;
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${sharpness > 0 ? 0 : 0}px)`;
      
      // Note: Sharpness is hard to do with simple CSS filters on canvas without custom convolution
      // We'll stick to the basic ones for now as requested
      ctx.drawImage(img, 0, 0);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `restored-enhanced-${photo.file.name}`;
      // Use a more robust way to trigger download in iframes
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
    };
  };

  const updateAdjustment = (id: string, key: keyof PhotoItem['adjustments'], value: number) => {
    setPhotos(prev => prev.map(p => p.id === id ? {
      ...p,
      adjustments: { ...p.adjustments, [key]: value }
    } : p));
  };

  const getFilterString = (adj: PhotoItem['adjustments']) => {
    return `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) ${adj.sharpness > 0 ? `contrast(${100 + adj.sharpness}%)` : ''}`;
  };

  return (
    <div className="min-h-screen pb-20">
      {/* API Key Banner */}
      {restorationMode === 'ultra' && hasApiKey === false && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md bg-amber-50/80">
          <div className="flex items-center gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>
              当前使用的是标准模式。若需 <b>2K/4K 超高清修复</b>，请先选择您的付费 API 密钥。
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 underline inline-flex items-center gap-0.5 hover:text-amber-900"
              >
                查看计费说明 <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </div>
          <button
            onClick={handleSelectKey}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Key className="w-3 h-3" />
            选择 API 密钥
          </button>
        </div>
      )}

      {/* Header */}
      <header className="pt-16 pb-12 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-olive-600/20 bg-white/50 text-olive-600 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            <span>AI 驱动的老照片修复专家</span>
          </div>
          <h1 className="text-6xl md:text-7xl font-serif font-light tracking-tight text-stone-900 mb-4">
            时光印记 <span className="italic">Pro</span>
          </h1>
          <p className="text-stone-500 max-w-xl mx-auto text-lg leading-relaxed">
            让尘封的记忆重焕光彩。上传您的老照片实拍图，AI 将自动识别边缘、裁剪背景，并完成高质量的修复与上色。
          </p>
        </motion.div>
      </header>

      <main className="max-w-6xl mx-auto px-6">
        {/* Upload Section */}
        <section className="mb-12">
          <div
            {...getRootProps()}
            className={cn(
              "relative group cursor-pointer rounded-[32px] border-2 border-dashed transition-all duration-500 overflow-hidden",
              isDragActive 
                ? "border-olive-600 bg-olive-600/5 scale-[0.99]" 
                : "border-stone-200 bg-white hover:border-olive-600/50 hover:bg-stone-50/50"
            )}
          >
            <input {...getInputProps()} />
            <div className="py-20 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                <Upload className="w-8 h-8 text-stone-400 group-hover:text-olive-600 transition-colors" />
              </div>
              <h3 className="text-2xl font-serif mb-2">点击或拖拽照片至此处</h3>
              <p className="text-stone-400">支持批量上传，建议上传清晰的实拍图</p>
            </div>
          </div>
        </section>

        {/* Actions */}
        {photos.length > 0 && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-serif">待处理照片 ({photos.length})</h2>
                {photos.some(p => p.status === 'completed') && (
                  <span className="text-sm text-stone-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    已完成 {photos.filter(p => p.status === 'completed').length} 张
                  </span>
                )}
              </div>
              
              {/* Mode Selector */}
              <div className="flex items-center bg-stone-100 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setRestorationMode('standard')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                    restorationMode === 'standard' 
                      ? "bg-white text-stone-900 shadow-sm" 
                      : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  标准修复
                </button>
                <button
                  onClick={() => setRestorationMode('ultra')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                    restorationMode === 'ultra' 
                      ? "bg-white text-olive-600 shadow-sm" 
                      : "text-stone-500 hover:text-stone-700"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  2K 超高清
                </button>
              </div>
            </div>
            
            <button
              onClick={processAll}
              disabled={isProcessingAll || photos.every(p => p.status === 'completed')}
              className="olive-button disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 bg-olive-600 hover:bg-olive-700 text-white px-8 py-3 rounded-full transition-all shadow-lg shadow-olive-600/20 h-fit"
            >
              {isProcessingAll ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  批量处理中...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  开始批量修复
                </>
              )}
            </button>
          </div>
        )}

        {/* Photo Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative bg-white rounded-[32px] overflow-hidden shadow-sm border border-stone-100 hover:shadow-xl transition-all duration-500"
              >
                {/* Image Container */}
                <div className="aspect-[4/3] relative overflow-hidden bg-stone-100">
                  <img
                    src={photo.result || photo.preview}
                    alt="Photo preview"
                    style={{ filter: photo.result ? getFilterString(photo.adjustments) : 'none' }}
                    className={cn(
                      "w-full h-full object-cover transition-all duration-700",
                      photo.status === 'processing' && "scale-110 blur-sm opacity-50"
                    )}
                  />
                  
                  {/* Status Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {photo.status === 'processing' && (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg">
                          <Loader2 className="w-6 h-6 text-olive-600 animate-spin" />
                        </div>
                        <span className="text-xs font-medium text-white drop-shadow-md">AI 修复中...</span>
                      </div>
                    )}
                    {photo.status === 'error' && (
                      <div className="bg-red-500/90 backdrop-blur text-white px-4 py-2 rounded-full text-sm flex items-center gap-2">
                        <span>{photo.error}</span>
                        <button onClick={() => processPhoto(photo)} className="underline font-bold">重试</button>
                      </div>
                    )}
                  </div>

                  {/* Top Actions */}
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-stone-400 hover:text-red-500 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Info & Footer */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-serif text-lg truncate max-w-[180px]">{photo.file.name}</h4>
                      <p className="text-xs text-stone-400 uppercase tracking-wider">
                        {photo.status === 'completed' ? '修复完成' : '待处理'}
                      </p>
                    </div>
                    {photo.status === 'completed' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditingPhotoId(editingPhotoId === photo.id ? null : photo.id)}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                            editingPhotoId === photo.id ? "bg-olive-600 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                          )}
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Adjustment Sliders */}
                  <AnimatePresence>
                    {editingPhotoId === photo.id && photo.status === 'completed' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mb-6 space-y-4 pt-2 border-t border-stone-100"
                      >
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                            <span>亮度</span>
                            <span>{photo.adjustments.brightness}%</span>
                          </div>
                          <input 
                            type="range" min="50" max="150" value={photo.adjustments.brightness}
                            onChange={(e) => updateAdjustment(photo.id, 'brightness', parseInt(e.target.value))}
                            className="w-full h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-olive-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                            <span>对比度</span>
                            <span>{photo.adjustments.contrast}%</span>
                          </div>
                          <input 
                            type="range" min="50" max="150" value={photo.adjustments.contrast}
                            onChange={(e) => updateAdjustment(photo.id, 'contrast', parseInt(e.target.value))}
                            className="w-full h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-olive-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                            <span>饱和度</span>
                            <span>{photo.adjustments.saturation}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="200" value={photo.adjustments.saturation}
                            onChange={(e) => updateAdjustment(photo.id, 'saturation', parseInt(e.target.value))}
                            className="w-full h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-olive-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                            <span>锐化</span>
                            <span>{photo.adjustments.sharpness}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="100" value={photo.adjustments.sharpness}
                            onChange={(e) => updateAdjustment(photo.id, 'sharpness', parseInt(e.target.value))}
                            className="w-full h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-olive-600"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex gap-3">
                    {photo.status === 'completed' ? (
                      <>
                        <button
                          onClick={() => downloadImage(photo)}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-stone-900 text-white hover:bg-stone-800 transition-colors text-sm font-medium"
                        >
                          <Download className="w-4 h-4" />
                          下载修复图
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => processPhoto(photo)}
                        disabled={photo.status === 'processing'}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-olive-600/30 text-olive-600 hover:bg-olive-600/5 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        立即修复
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {photos.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-6">
              <History className="w-10 h-10 text-stone-300" />
            </div>
            <p className="text-stone-400 font-serif text-xl italic">暂无照片，开启您的时光之旅</p>
          </motion.div>
        )}
      </main>

      {/* Footer Branding */}
      <footer className="mt-20 border-t border-stone-200 pt-12 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-medium">
          时光印记 Pro &copy; {new Date().getFullYear()} &middot; AI 驱动的影像实验室
        </p>
      </footer>
    </div>
  );
}
