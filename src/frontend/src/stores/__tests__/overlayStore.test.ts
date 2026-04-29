import { describe, it, expect, beforeEach } from 'vitest';
import { useOverlayStore, OVERLAY_PRIORITY } from '../overlayStore';

describe('overlayStore', () => {
  beforeEach(() => {
    useOverlayStore.getState()._reset();
  });

  it('activates the first request when no overlay is active', () => {
    useOverlayStore.getState().requestOverlay('tour');
    expect(useOverlayStore.getState().activeOverlay).toBe('tour');
    expect(useOverlayStore.getState().queue).toEqual([]);
  });

  it('queues a lower-priority request behind the active one', () => {
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('push_prompt');
    expect(useOverlayStore.getState().activeOverlay).toBe('tour');
    expect(useOverlayStore.getState().queue).toEqual(['push_prompt']);
  });

  it('preempts the active overlay when a higher-priority request arrives', () => {
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('sw_update');
    // sw_update wins, tour falls back into the queue
    expect(useOverlayStore.getState().activeOverlay).toBe('sw_update');
    expect(useOverlayStore.getState().queue).toEqual(['tour']);
  });

  it('keeps the queue ordered by descending priority', () => {
    useOverlayStore.getState().requestOverlay('sw_update');
    useOverlayStore.getState().requestOverlay('push_prompt');
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('director_wizard');
    expect(useOverlayStore.getState().activeOverlay).toBe('sw_update');
    // queue should be: tour (80) > director_wizard (70) > push_prompt (50)
    expect(useOverlayStore.getState().queue).toEqual(['tour', 'director_wizard', 'push_prompt']);
  });

  it('promotes the highest-priority queued overlay on release', () => {
    useOverlayStore.getState().requestOverlay('sw_update');
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('push_prompt');
    useOverlayStore.getState().releaseOverlay('sw_update');
    expect(useOverlayStore.getState().activeOverlay).toBe('tour');
    expect(useOverlayStore.getState().queue).toEqual(['push_prompt']);
  });

  it('clears state when the last overlay is released', () => {
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().releaseOverlay('tour');
    expect(useOverlayStore.getState().activeOverlay).toBeNull();
    expect(useOverlayStore.getState().queue).toEqual([]);
  });

  it('is idempotent: re-requesting an already-active overlay is a no-op', () => {
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('tour');
    expect(useOverlayStore.getState().activeOverlay).toBe('tour');
    expect(useOverlayStore.getState().queue).toEqual([]);
  });

  it('does not double-queue an already-queued overlay', () => {
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('push_prompt');
    useOverlayStore.getState().requestOverlay('push_prompt');
    expect(useOverlayStore.getState().queue).toEqual(['push_prompt']);
  });

  it('removes a queued overlay if released before activation', () => {
    useOverlayStore.getState().requestOverlay('tour');
    useOverlayStore.getState().requestOverlay('push_prompt');
    useOverlayStore.getState().releaseOverlay('push_prompt');
    expect(useOverlayStore.getState().activeOverlay).toBe('tour');
    expect(useOverlayStore.getState().queue).toEqual([]);
  });

  it('handles a full mount/unmount race without leaking state', () => {
    // Component A mounts, requests its overlay
    useOverlayStore.getState().requestOverlay('tour');
    // Component B mounts mid-tour, gets queued
    useOverlayStore.getState().requestOverlay('push_prompt');
    // Component A unmounts (route change), releases — B promotes
    useOverlayStore.getState().releaseOverlay('tour');
    expect(useOverlayStore.getState().activeOverlay).toBe('push_prompt');
    // Component B unmounts — slot empties
    useOverlayStore.getState().releaseOverlay('push_prompt');
    expect(useOverlayStore.getState().activeOverlay).toBeNull();
    expect(useOverlayStore.getState().queue).toEqual([]);
  });

  it('priorities reflect the documented order', () => {
    expect(OVERLAY_PRIORITY.sw_update).toBeGreaterThan(OVERLAY_PRIORITY.tour);
    expect(OVERLAY_PRIORITY.tour).toBeGreaterThan(OVERLAY_PRIORITY.director_wizard);
    expect(OVERLAY_PRIORITY.director_wizard).toBeGreaterThan(OVERLAY_PRIORITY.push_prompt);
  });
});
