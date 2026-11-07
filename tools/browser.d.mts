import type { Browser, Page } from "playwright-core";
export interface PreviewSession { browser: Browser; page: Page; errors: string[]; requests: string[] }
export function openPreview(input?: string): Promise<PreviewSession>;
export function assertOffline(session: PreviewSession): void;
export function buildOffline(input?: string, sceneId?: string): string;
export function ensureBuilt(): void;
