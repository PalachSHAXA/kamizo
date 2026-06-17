// v130 — cross-platform blob download.
//
// The legacy path was a synthetic `<a download>` of a blob URL. That
// works in every modern desktop browser AND Android Chromium WebView
// AND Android Capacitor WebView (where DownloadManager picks the
// click up). It DOES NOT work in iOS Capacitor WKWebView — confirmed
// on iPhone 15 Simulator after the Sprint 85 contract download test:
// the toast fired, the bytes downloaded over the wire, but the Files
// app never showed the result. This is a known WKWebView limitation:
// blob URLs don't trigger native save; the click event is consumed
// without an associated download handler.
//
// The fix: detect the runtime and route the blob differently.
//   - iOS / Android (Capacitor native) → @capacitor/filesystem
//       Filesystem.writeFile({ path, data: base64, directory: Documents })
//       lands the file in the app's Documents directory, which the
//       iOS Files app exposes under "On My iPhone → Kamizo → {filename}"
//       (provided UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace
//       are set in Info.plist — see ios/App/App/Info.plist).
//   - web (PWA, dev preview) → keep the existing synthetic `<a download>`
//       path. Browsers handle this correctly.
//
// One helper, one toast pair, every download surface gets the right
// behavior automatically. Existing call sites just call
// `downloadBlob(blob, filename)` and the platform routing happens here.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useToastStore } from '../stores/toastStore';

export interface DownloadOptions {
  /**
   * Filename the user will see in Files / Downloads. Should include
   * the extension (".pdf", ".xlsx", ...).
   */
  filename: string;
  /**
   * Language for toast copy. Defaults to 'ru' — Kamizo is RU-first.
   */
  language?: 'ru' | 'uz';
  /**
   * Skip the success toast. Useful when the calling component wants
   * to show its own custom toast.
   */
  silent?: boolean;
}

/**
 * Convert a Blob to a base64 string (no `data:…;base64,` prefix).
 * Used by the native filesystem path which expects raw base64.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // FileReader gives us "data:<mime>;base64,<base64>" — strip the prefix.
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Save a Blob to the user's filesystem in a platform-appropriate way.
 *
 * Native (iOS / Android Capacitor):
 *   File is written to Directory.Documents. On iOS this surfaces under
 *   "Files → On My iPhone → Kamizo → {filename}". On Android it's
 *   `/storage/emulated/0/Android/data/uz.kamizo.app/files/Documents/`.
 *
 * Web (PWA, desktop preview):
 *   Synthetic `<a download>` click. File lands in the browser's
 *   Downloads folder.
 *
 * Both paths fire a success toast unless `silent` is set. Failures
 * always toast (regardless of silent).
 */
export async function downloadBlob(blob: Blob, opts: DownloadOptions): Promise<void> {
  const { filename, silent = false } = opts;
  const language = opts.language ?? 'ru';
  const isRu = language === 'ru';
  const addToast = useToastStore.getState().addToast;
  const platform = Capacitor.getPlatform();

  try {
    if (platform === 'ios' || platform === 'android') {
      // Native path — base64 + Filesystem.writeFile.
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Documents,
        // PDFs / Office docs / images are binary — no encoding means
        // Capacitor treats `data` as base64 bytes (correct for our blob).
        // Setting Encoding.UTF8 here would corrupt binary files by
        // re-decoding them as a string. Leave encoding unset.
        recursive: false,
      });
      if (!silent) {
        addToast(
          'success',
          isRu
            ? 'Файл сохранён в Файлы → Kamizo'
            : 'Fayl Files → Kamizo papkasiga saqlandi'
        );
      }
      return;
    }

    // Web path. PWA on iOS Safari (not Capacitor) ignores the
    // `download` attribute on blob anchors — it either does nothing
    // or opens the blob inline. Same code that was previously inline
    // in contractGenerator.ts: detect iOS-Safari and use window.open
    // so the user can Save via the share sheet. Everywhere else use
    // the standard synthetic anchor click.
    const url = URL.createObjectURL(blob);
    const ua = navigator.userAgent;
    const isIOSSafari = /iPad|iPhone|iPod/.test(ua) && /^((?!chrome|android).)*safari/i.test(ua);
    if (isIOSSafari) {
      const w = window.open(url, '_blank');
      if (!w) {
        // Popup blocked — last resort, navigate in-place. The blob will
        // be replaced by the back button so the SPA state survives.
        window.location.href = url;
      }
      // Delayed revoke so the new tab's content has time to read.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      // requestAnimationFrame so the browser has a tick to consume the
      // click before we revoke the blob URL. Without this, some Chromium
      // builds drop the download silently.
      requestAnimationFrame(() => {
        a.remove();
        URL.revokeObjectURL(url);
      });
    }
    if (!silent) {
      addToast(
        'success',
        isRu ? 'Файл скачан' : 'Fayl yuklab olindi'
      );
    }
  } catch (err) {
    // One generic error toast for both paths. The most likely failure
    // modes are quota (rare; user disk full) or a Capacitor plugin
    // permission edge case that should have been caught at app boot.
    console.error('[downloadFile] failed:', err);
    addToast(
      'error',
      isRu
        ? 'Не удалось скачать. Попробуйте ещё раз.'
        : "Yuklab boʻlmadi. Qaytadan urinib koʻring."
    );
    throw err;
  }
}
