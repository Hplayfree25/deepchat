'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { createChat, getUserProfile, uploadFile } from './actions';
import ChatComposer from '@/components/ui/ChatComposer';
import { defaultComposerToolState, saveComposerToolState } from '@/lib/composer-tool-state';
import { type ImageAspectRatio } from '@/lib/image-aspect-ratio';

interface AttachedFile {
  name: string;
  ext: string;
}

interface UserProfile {
  name?: string;
}

const homeHeadlines = [
  (name: string) => `Hello ${name}, What can I help you today?`,
  () => 'Bring your ideas with our programs',
  () => 'Step first to a Agent AI',
  () => 'Turn your questions into clear answers',
  () => 'Build something useful with DeepChat',
  () => 'Explore smarter ways to get work done',
  () => 'Start a new thought with DeepChat'
];

const pickHeadlineIndex = (currentIndex?: number) => {
  const nextIndex = Math.floor(Math.random() * homeHeadlines.length);
  if (typeof currentIndex !== 'number' || homeHeadlines.length < 2 || nextIndex !== currentIndex) return nextIndex;
  return (nextIndex + 1) % homeHeadlines.length;
};

export default function WelcomePage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [profileName, setProfileName] = useState('Guest');
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState(defaultComposerToolState.webSearchEnabled);
  const [imageGenerationEnabled, setImageGenerationEnabled] = useState(defaultComposerToolState.imageGenerationEnabled);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>(defaultComposerToolState.imageAspectRatio);
  const [isClientStateLoaded, setIsClientStateLoaded] = useState(false);
  const headline = homeHeadlines[headlineIndex](profileName || 'Guest');

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setInput(localStorage.getItem('deepchat-draft-new') || '');
      setIsClientStateLoaded(true);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadProfile = () => getUserProfile().then((profile) => {
      const savedProfile = profile as UserProfile;
      if (mounted) setProfileName(savedProfile.name || 'Guest');
    });
    void loadProfile();
    const headlineFrame = window.requestAnimationFrame(() => {
      if (mounted) setHeadlineIndex(current => pickHeadlineIndex(current));
    });
    const refreshHome = () => {
      setInput('');
      setAttachedFiles([]);
      setHeadlineIndex(current => pickHeadlineIndex(current));
    };
    const refreshProfile = () => {
      void loadProfile();
      setHeadlineIndex(current => pickHeadlineIndex(current));
    };
    window.addEventListener('deepchat:new-home-prompt', refreshHome);
    window.addEventListener('profileUpdated', refreshProfile);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(headlineFrame);
      window.removeEventListener('deepchat:new-home-prompt', refreshHome);
      window.removeEventListener('profileUpdated', refreshProfile);
    };
  }, []);

  useEffect(() => {
    if (!isClientStateLoaded) return;
    localStorage.setItem('deepchat-draft-new', input);
  }, [input, isClientStateLoaded]);

  useEffect(() => {
    if (!isClientStateLoaded) return;
    saveComposerToolState({ webSearchEnabled, imageGenerationEnabled, imageAspectRatio });
  }, [webSearchEnabled, imageGenerationEnabled, imageAspectRatio, isClientStateLoaded]);

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await uploadFile(formData);
        if (res.success) {
          setAttachedFiles(prev => [...prev, { name: res.fileName!, ext: res.ext! }]);
          toast.success(`Attached ${res.fileName}`);
        } else {
          toast.error(res.error || 'Upload failed');
        }
      } catch {
        toast.error('Upload failed');
      }
    }

    setIsUploading(false);
  };

  const startChat = async (inputMsg?: string, files: AttachedFile[] = attachedFiles, useWebSearch = webSearchEnabled, useImageGeneration = imageGenerationEnabled, selectedImageAspectRatio = imageAspectRatio) => {
    localStorage.removeItem('deepchat-draft-new');
    const id = await createChat('New Chat', files);
    const query = new URLSearchParams();
    if (inputMsg || files.length > 0) query.set('msg', inputMsg || '');
    if (useWebSearch) query.set('web', '1');
    if (useImageGeneration) {
      query.set('image', '1');
      query.set('ratio', selectedImageAspectRatio);
    }
    const qString = query.toString();
    router.push(`/chat/${id}${qString ? `?${qString}` : ''}`);
  };

  return (
    <div className="deepchat-home-light flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-[64rem] -translate-y-10 flex-col items-center gap-20 sm:-translate-y-14 sm:gap-24">
          <motion.h1
            key={headline}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[58rem] text-center text-[30px] font-normal leading-[1.15] tracking-normal text-black sm:text-[40px]"
          >
            {headline}
          </motion.h1>

          <div className="w-full md:w-[min(50vw,64rem)] md:min-w-[34rem]">
            <ChatComposer
              value={input}
              attachedFiles={attachedFiles}
              isUploading={isUploading}
              webSearchEnabled={webSearchEnabled}
              imageGenerationEnabled={imageGenerationEnabled}
              imageAspectRatio={imageAspectRatio}
              onChange={setInput}
              onSubmit={(value) => startChat(value)}
              onToggleWebSearch={setWebSearchEnabled}
              onToggleImageGeneration={setImageGenerationEnabled}
              onImageAspectRatioChange={setImageAspectRatio}
              onFilesUpload={handleFilesUpload}
              onAttachRecentFile={(file) => setAttachedFiles(prev => prev.some(item => item.name === file.name && item.ext === file.ext) ? prev : [...prev, file])}
              onRemoveFile={(index) => setAttachedFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
