/**
 * Workers Atom
 *
 * Simple atom for storing workspace workers.
 * Populated by AppShell and consumed by message send pipeline.
 */

import { atom } from 'jotai'
import type { LoadedWorker } from '../../shared/types'

/**
 * Atom to store the current workspace's workers.
 */
export const workersAtom = atom<LoadedWorker[]>([])

