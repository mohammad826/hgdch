export interface UserData {
  balance: number;
  tasksCompleted: string[];
}

export type TabType = 'home' | 'tasks' | 'friends';

// Global declaration for Adsgram
declare global {
  interface Window {
    Adsgram?: {
      init: (params: { block: string }) => {
        show: () => Promise<void>;
      };
    };
    Telegram?: {
      WebApp: any;
    };
  }
}
