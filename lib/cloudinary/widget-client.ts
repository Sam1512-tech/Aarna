/**
 * Client-side wrapper around Cloudinary's Upload Widget — the branded picker
 * that gives admins drag-and-drop, URL paste, camera capture, and library
 * browse in one dialog. Falls back to the native file picker in the caller
 * when this returns null (env not configured, script blocked, etc.).
 *
 * Requires TWO public env vars — leave either unset and the widget won't
 * be used:
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
 *   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET   (unsigned preset name)
 *
 * Set up in the Cloudinary dashboard: Settings → Upload → Upload presets →
 * Add preset. Signing Mode: Unsigned. Optionally lock a folder + allowed
 * formats + max file size on the preset itself.
 */

const SCRIPT_SRC = "https://widget.cloudinary.com/v2.0/global/all.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CloudinaryGlobal = any;

let scriptPromise: Promise<CloudinaryGlobal> | null = null;

function loadScript(): Promise<CloudinaryGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Widget only available in the browser"));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.cloudinary) return Promise.resolve(w.cloudinary);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cloudinary = (window as any).cloudinary;
      if (cloudinary) resolve(cloudinary);
      else reject(new Error("Cloudinary widget did not initialize"));
    };
    script.onerror = () =>
      reject(new Error("Cloudinary widget script failed to load"));
    if (!existing) document.body.appendChild(script);
  });

  return scriptPromise;
}

export function isWidgetConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
    !!process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  );
}

export interface WidgetOpenOptions {
  /** Cloudinary folder to upload into, e.g. "aarna/categories". */
  folder: string;
  /** Aspect ratio to crop to inside the widget (optional). "4:5" for portrait tiles. */
  cropAspectRatio?: string;
  /** Include the library browser tab so admins can pick an existing upload. */
  showBrowse?: boolean;
}

export interface WidgetResult {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Opens the Cloudinary widget and resolves with the first successfully
 * uploaded asset. Resolves null when the widget is closed without upload.
 * Rejects on script/init failure — callers can catch and fall back to their
 * own native file picker.
 */
export async function openCloudinaryWidget(
  opts: WidgetOpenOptions,
): Promise<WidgetResult | null> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary widget not configured");
  }

  const cloudinary = await loadScript();

  return new Promise((resolve, reject) => {
    let resolved = false;
    const widget = cloudinary.createUploadWidget(
      {
        cloudName,
        uploadPreset,
        folder: opts.folder,
        multiple: false,
        maxFiles: 1,
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp", "avif"],
        maxFileSize: 8 * 1024 * 1024,
        sources: opts.showBrowse
          ? ["local", "url", "camera", "google_drive"]
          : ["local", "url", "camera"],
        cropping: !!opts.cropAspectRatio,
        croppingAspectRatio: opts.cropAspectRatio
          ? parseAspect(opts.cropAspectRatio)
          : undefined,
        showAdvancedOptions: false,
        showUploadMoreButton: false,
        // Aarna's brand: cream + maroon. Widget defaults to Cloudinary blue.
        styles: {
          palette: {
            window: "#f6f1ea",
            windowBorder: "#8c6a5a",
            tabIcon: "#4a1f1f",
            menuIcons: "#8c6a5a",
            textDark: "#2b2623",
            textLight: "#f6f1ea",
            link: "#7a3b32",
            action: "#4a1f1f",
            inactiveTabIcon: "#8c6a5a99",
            error: "#7a3b32",
            inProgress: "#8c6a5a",
            complete: "#4a1f1f",
            sourceBg: "#f6f1ea",
          },
        },
      },
      (
        error: unknown,
        event: {
          event: string;
          info?: {
            secure_url: string;
            public_id: string;
            format: string;
            bytes: number;
            width: number;
            height: number;
          };
        },
      ) => {
        if (error) {
          if (!resolved) {
            resolved = true;
            reject(error instanceof Error ? error : new Error(String(error)));
          }
          return;
        }
        if (event?.event === "success" && event.info) {
          resolved = true;
          resolve({
            url: event.info.secure_url,
            publicId: event.info.public_id,
            format: event.info.format,
            bytes: event.info.bytes,
            width: event.info.width,
            height: event.info.height,
          });
          widget.close();
        }
        if (event?.event === "close" && !resolved) {
          resolved = true;
          resolve(null);
        }
      },
    );
    widget.open();
  });
}

function parseAspect(ratio: string): number {
  const [a, b] = ratio.split(":").map(Number);
  if (!a || !b) return 1;
  return a / b;
}
