/**
 * record-demo.mjs — drive Playwright through the ~70-second Aerospace RCA
 * cinematic (/demo) and produce docs/media/aerospace-rca-cinematic-<date>.mp4.
 *
 * Follows the SynapCores cinematic-demo recorder mold (tradegraph/worldcup-pitch
 * scripts/record-demo.ts): a REAL browser video capture of the live playback via
 * chromium.recordVideo, then an ffmpeg WebM→MP4 transcode — NOT a slideshow.
 *
 * Run:  node scripts/record-demo.mjs
 *
 * Pre-reqs:
 *   - The demo stack is up (docker compose up) → app on :3005.
 *   - `playwright` importable + its chromium installed.
 *   - ffmpeg + ffprobe on PATH.
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'media');
const URL = process.env.RCA_DEMO_URL ?? 'http://127.0.0.1:3005/demo';
// The timeline is ~70s; give Act 4's agent + the closing card a margin so the
// final frame holds on the completed 5-act state.
const RECORD_SECONDS = Number(process.env.RCA_RECORD_SECONDS ?? '95');

function dateStamp() {
  const d = new Date();
  return d.toISOString().slice(0, 10) + 'T' + d.toISOString().slice(11, 13) + d.toISOString().slice(14, 16);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('[record] launching chromium…');
  const browser = await chromium.launch({
    headless: true,
    // Force software canvas rendering — accelerated canvas records as a black
    // rectangle otherwise (same reason as the tradegraph recorder).
    args: ['--disable-blink-features=AcceleratedCanvas2D', '--disable-features=PaintHolding'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log(`[record] navigating to ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Reset any prior run state so the cinematic starts fresh on Act 1.
  await page.evaluate(() => { try { sessionStorage.clear(); localStorage.clear(); } catch { /* noop */ } });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // If a prior run left the page on "Run Again", press Reset first.
  const resetBtn = page.getByRole('button', { name: /^reset$/i });
  if (await resetBtn.count()) { try { await resetBtn.click(); await page.waitForTimeout(500); } catch { /* noop */ } }

  console.log('[record] clicking "Kick Off"…');
  const kickoff = page.getByRole('button', { name: /kick off/i });
  await kickoff.waitFor({ state: 'visible', timeout: 15_000 });
  await kickoff.click();

  // Anchor the clock to the actual start: the button flips to "Running…".
  await page.getByRole('button', { name: /running/i }).waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  console.log(`[record] recording for ${RECORD_SECONDS}s…`);
  await page.waitForTimeout(RECORD_SECONDS * 1000);

  console.log('[record] finishing…');
  await context.close();
  await browser.close();

  const webms = readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm'));
  const newest = webms
    .map((f) => ({ f, mtime: statSync(join(OUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0];
  if (!newest) throw new Error('no .webm produced');
  const rawPath = join(OUT_DIR, 'aerospace-rca-cinematic-raw.webm');
  renameSync(join(OUT_DIR, newest.f), rawPath);
  console.log(`[record] raw recording: ${rawPath}`);

  const mp4Path = join(OUT_DIR, `aerospace-rca-cinematic-${dateStamp()}.mp4`);
  console.log('[record] transcoding to mp4…');
  const ff = spawnSync('ffmpeg', [
    '-v', 'error', '-y',
    '-ss', '0.6',            // trim the pre-click settle
    '-i', rawPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    mp4Path,
  ], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error(`ffmpeg exited ${ff.status}`);
  try { rmSync(rawPath); } catch { /* noop */ }
  console.log(`[record] done → ${mp4Path}`);

  const dur = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp4Path], { encoding: 'utf-8' });
  if (dur.status === 0) console.log(`[record] duration: ${Number(dur.stdout.trim()).toFixed(1)}s`);
}

main().catch((e) => { console.error('[record]', e); process.exit(1); });
