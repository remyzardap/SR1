import type { QuietImageItem, QuietComposerShape } from "@/components/studio/QuietStudioScreen";

export interface QuietStudioConfig {
  images: QuietImageItem[];
  makingImage: boolean;
  composer: {
    placeholder: string;
    shape: QuietComposerShape;
    value?: string;
  };
}

const SAMPLE_IMAGES: QuietImageItem[] = [
  { id: "img-1", src: "/studio/l/var-window-2.webp", alt: "Soft window light still life", height: 214 },
  { id: "img-2", src: "/studio/l/var-golden-2.webp", alt: "Golden hour landscape", height: 150 },
  { id: "img-3", src: "/studio/l/var-studio-2.webp", alt: "Studio portrait", height: 176 },
  { id: "img-4", src: "/studio/l/var-backlit-2.webp", alt: "Backlit silhouette", height: 150 },
  { id: "img-5", src: "/studio/l/var-night-2.webp", alt: "Night lamp scene", height: 196 },
  { id: "img-6", src: "/studio/l/var-window-3.webp", alt: "Window light portrait", height: 180 },
  { id: "img-7", src: "/studio/l/var-golden-3.webp", alt: "Golden hour city", height: 160 },
  { id: "img-8", src: "/studio/l/var-studio-3.webp", alt: "Studio product shot", height: 170 },
];

export const QUIET_STUDIO_STATES: Record<string, QuietStudioConfig> = {
  populated: {
    images: SAMPLE_IMAGES.slice(0, 6),
    makingImage: false,
    composer: { placeholder: "Describe an image", shape: "4:5" },
  },
  making: {
    images: SAMPLE_IMAGES.slice(0, 6),
    makingImage: true,
    composer: { placeholder: "A ceramic mug on a wooden table", shape: "4:5", value: "A ceramic mug on a wooden table" },
  },
  empty: {
    images: [],
    makingImage: false,
    composer: { placeholder: "Describe an image", shape: "1:1" },
  },
  with_prompt: {
    images: SAMPLE_IMAGES.slice(0, 4),
    makingImage: false,
    composer: { placeholder: "Describe an image", shape: "16:9", value: "A ceramic mug" },
  },
};

export const QUIET_STUDIO_STATE_KEYS = Object.keys(QUIET_STUDIO_STATES);
