
import React from 'react';
import { Script, TrendingScript } from '../services/rscripts';
import { ScriptBloxScript } from '../services/scriptblox';
import { formatTimeAgo } from '@/utils/ui';
import { ThumbsUpIcon, ThumbsDownIcon, EyeIcon } from '../assets/Icons';
import placeholderImg from '@/assets/placeholder.avif';

const MAX_VISIBLE_IMAGE_CACHE_ENTRIES = 300;
const thumbnailCache = new Map<string, true>();
const failedThumbnailCache = new Set<string>();
const pendingThumbnailPreloads = new Map<string, Promise<boolean>>();

const isPresetScript = (value: unknown): value is PresetScript => {
  return typeof value === "object" && value !== null && "isPreset" in value && value.isPreset === true;
};

const isTrendingScript = (value: unknown, isBlox: boolean): value is TrendingScript => {
  return !isBlox
    && typeof value === "object"
    && value !== null
    && "script" in value
    && typeof value.script === "object"
    && value.script !== null
    && "title" in value.script;
};

function hasThumbnailCached(src: string): boolean {
  return Boolean(src) && thumbnailCache.has(src);
}

function hasThumbnailFailed(src: string): boolean {
  return Boolean(src) && failedThumbnailCache.has(src);
}

function touchThumbnailCache(src: string): boolean {
  if (!hasThumbnailCached(src)) {
    return false;
  }

  thumbnailCache.delete(src);
  thumbnailCache.set(src, true);
  return true;
}

function cacheThumbnail(src: string): void {
  if (!src) {
    return;
  }

  if (thumbnailCache.has(src)) {
    thumbnailCache.delete(src);
  }
  thumbnailCache.set(src, true);

  while (thumbnailCache.size > MAX_VISIBLE_IMAGE_CACHE_ENTRIES) {
    const oldestKey = thumbnailCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    thumbnailCache.delete(oldestKey);
  }
}

function markThumbnailFailed(src: string): void {
  if (!src) {
    return;
  }

  thumbnailCache.delete(src);
  if (failedThumbnailCache.has(src)) {
    failedThumbnailCache.delete(src);
  }
  failedThumbnailCache.add(src);

  while (failedThumbnailCache.size > MAX_VISIBLE_IMAGE_CACHE_ENTRIES) {
    const oldestKey = failedThumbnailCache.values().next().value;
    if (!oldestKey) {
      break;
    }
    failedThumbnailCache.delete(oldestKey);
  }
}

function preloadThumbnail(src: string): Promise<boolean> {
  if (!src || touchThumbnailCache(src)) {
    return Promise.resolve(true);
  }

  if (hasThumbnailFailed(src)) {
    return Promise.resolve(false);
  }

  const existing = pendingThumbnailPreloads.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => {
      failedThumbnailCache.delete(src);
      cacheThumbnail(src);
      pendingThumbnailPreloads.delete(src);
      resolve(true);
    };
    img.onerror = () => {
      markThumbnailFailed(src);
      pendingThumbnailPreloads.delete(src);
      resolve(false);
    };
    img.src = src;
  });

  pendingThumbnailPreloads.set(src, promise);
  return promise;
}

export interface PresetScript {
  _id: string;
  title: string;
  image: string;
  createdAt: string;
  isPreset: true;
}

interface ScriptCardProps {
  script: Script | TrendingScript | ScriptBloxScript | PresetScript;
  onClick?: (script: Script | TrendingScript | ScriptBloxScript | PresetScript) => void;
  isBlox?: boolean;
}

const ScriptCard: React.FC<ScriptCardProps> = React.memo(({ script, onClick, isBlox = false }) => {
  let title: string;
  let image: string | undefined;
  let likes: number = 0;
  let dislikes: number = 0;
  let views: number = 0;
  let createdAt: string | undefined;
  const hasPresetShape = isPresetScript(script);

  if (hasPresetShape) {
    title = script.title;
    image = script.image;
    createdAt = script.createdAt;
  } else if (isBlox) {
    const s = script as ScriptBloxScript;
    title = s.title;
    image = s.image;
    if (image && !image.startsWith('http')) {
      image = `https://scriptblox.com${image}`;
    }
    likes = s.likeCount ?? 0;
    dislikes = s.dislikeCount ?? 0;
    views = s.views;
    createdAt = s.createdAt;
  } else if (isTrendingScript(script, isBlox)) {
    title = script.script.title;
    image = script.script.image;
    likes = script.script.likes ?? 0;
    dislikes = script.script.dislikes ?? 0;
    views = script.views;
    createdAt = script.script.createdAt;
  } else {
    const s = script as Script;
    title = s.title;
    image = s.image;
    likes = s.likes;
    dislikes = s.dislikes;
    views = s.views;
    createdAt = s.createdAt;
  }

  const imgSrc = image ?? placeholderImg;
  const hasRemoteImage = Boolean(image);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = React.useState(() => hasPresetShape || hasThumbnailCached(imgSrc));
  const [displaySrc, setDisplaySrc] = React.useState(() => {
    if (!hasRemoteImage || hasThumbnailFailed(imgSrc)) {
      return placeholderImg;
    }
    return imgSrc;
  });

  React.useEffect(() => {
    if (hasPresetShape) {
      setIsVisible(true);
      setDisplaySrc(imgSrc);
      void preloadThumbnail(imgSrc);
      return;
    }

    if (touchThumbnailCache(imgSrc)) {
      setIsVisible(true);
      setDisplaySrc(imgSrc);
      return;
    }

    if (!hasRemoteImage || hasThumbnailFailed(imgSrc)) {
      setDisplaySrc(placeholderImg);
      return;
    }

    setIsVisible(false);
    setDisplaySrc(imgSrc);

    const node = cardRef.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasPresetShape, hasRemoteImage, imgSrc]);

  React.useEffect(() => {
    if (!hasRemoteImage || !isVisible) {
      return;
    }

    if (touchThumbnailCache(imgSrc)) {
      setDisplaySrc(imgSrc);
      return;
    }

    if (hasThumbnailFailed(imgSrc)) {
      setDisplaySrc(placeholderImg);
      return;
    }

    let cancelled = false;
    void preloadThumbnail(imgSrc).then((loaded) => {
      if (cancelled) {
        return;
      }
      if (!loaded) {
        setDisplaySrc(placeholderImg);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasRemoteImage, imgSrc, isVisible]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.onerror = null;
    if (hasRemoteImage) {
      markThumbnailFailed(imgSrc);
    }
    setDisplaySrc(placeholderImg);
    e.currentTarget.src = placeholderImg;
  };

  return (
    <div 
      ref={cardRef}
      className="flex flex-col bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-primary)] overflow-hidden transition-colors duration-200 hover:border-[var(--text-secondary)] w-full cursor-pointer"
      onClick={() => onClick?.(script)}
      role="button"
      tabIndex={onClick ? 0 : -1}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(script);
        }
      }}
    >
      <div className="w-full aspect-video overflow-hidden">
        <img 
          src={displaySrc} 
          alt={title} 
          className="w-full h-full object-cover"
          loading={displaySrc === placeholderImg || hasPresetShape || isVisible || hasThumbnailCached(imgSrc) ? "eager" : "lazy"}
          fetchPriority={hasPresetShape ? "high" : "auto"}
          onError={handleError}
        />
      </div>
      
      <div className="p-3 flex flex-col flex-1 justify-between min-h-[110px]">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)] line-clamp-2 leading-[1.4] mb-1">
            {title}
          </h2>
          <p className="text-[11px] text-[var(--text-secondary)] mb-3 opacity-70">
            Created {createdAt ? formatTimeAgo(createdAt) : 'recently'}
          </p>
        </div>
        
        {!hasPresetShape && (
          <div className="flex items-center gap-3">
            {isBlox ? (
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)] text-xs font-medium">
                <EyeIcon width={16} height={16} />
                <span>{views.toLocaleString()}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-[var(--text-secondary)] text-xs font-medium">
                  <ThumbsUpIcon width={16} height={16} />
                  <span>{likes.toLocaleString()}</span>
                </div>
                
                <div className="flex items-center gap-1.5 text-[var(--text-secondary)] text-xs font-medium">
                  <ThumbsDownIcon width={16} height={16} />
                  <span>{dislikes.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ScriptCard;
