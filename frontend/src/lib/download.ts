import { apiBlob } from "./api";

/** Downloads a PDF from the API (needs the login token, so a plain link won't do). */
export function downloadPdf(path: string, filename: string) {
  return downloadFile(path, filename);
}

/** Downloads any file the API makes (PDF, Excel…) with the login token. */
export async function downloadFile(path: string, filename: string, query?: Record<string, string | undefined>) {
  const blob = await apiBlob(path, { query });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens a PDF in a new tab (for printing). The tab is opened before awaiting so it isn't blocked. */
export async function openPdf(path: string) {
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await apiBlob(path));
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
