import { create } from 'zustand';
import type { ActivityLog } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface ActivityState {
  activityLogs: ActivityLog[];

  addActivityLog: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;
}

export const useActivityStore = create<ActivityState>()(
  (set) => ({
    activityLogs: [],

    addActivityLog: (log) => {
      const newLog: ActivityLog = {
        ...log,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        activityLogs: [newLog, ...state.activityLogs].slice(0, 100),
      }));
    },
  })
);
