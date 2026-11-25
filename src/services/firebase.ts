import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, type Firestore } from 'firebase/firestore';

export interface PlayerProgress {
  completedMissions: number;
  highScore: number;
  detentions: number;
  updatedAt: string;
}

const LOCAL_KEY = 'atakent_okul_hikayesi_progress_v1';

/**
 * Optional Firebase (Firestore) persistence with automatic localStorage fallback.
 * Fill VITE_FIREBASE_* keys in .env.local to sync progress to the cloud.
 */
class ProgressService {
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  readonly cloudEnabled: boolean;

  constructor() {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
    const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;

    if (apiKey && projectId && appId) {
      try {
        this.app = initializeApp({
          apiKey,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId,
        });
        this.db = getFirestore(this.app);
        this.cloudEnabled = true;
        console.info('[firebase] Connected to project:', projectId);
      } catch (err) {
        console.warn('[firebase] Init failed, using localStorage fallback', err);
        this.cloudEnabled = false;
      }
    } else {
      this.cloudEnabled = false;
    }
  }

  private getClientId(): string {
    const k = 'atakent_client_id';
    let id = localStorage.getItem(k);
    if (!id) {
      id = `student_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(k, id);
    }
    return id;
  }

  async load(): Promise<PlayerProgress> {
    const fallback: PlayerProgress = {
      completedMissions: 0,
      highScore: 0,
      detentions: 0,
      updatedAt: new Date().toISOString(),
    };
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) Object.assign(fallback, JSON.parse(raw));
    } catch {
      // ignore malformed storage
    }

    if (this.db) {
      try {
        const snap = await getDoc(doc(this.db, 'players', this.getClientId()));
        if (snap.exists()) {
          const data = snap.data() as Partial<PlayerProgress>;
          return {
            completedMissions: Math.max(fallback.completedMissions, data.completedMissions ?? 0),
            highScore: Math.max(fallback.highScore, data.highScore ?? 0),
            detentions: Math.max(fallback.detentions, data.detentions ?? 0),
            updatedAt: data.updatedAt ?? fallback.updatedAt,
          };
        }
      } catch (err) {
        console.warn('[firebase] load failed, using local data', err);
      }
    }
    return fallback;
  }

  async save(progress: PlayerProgress): Promise<void> {
    const current = await this.load();
    const merged: PlayerProgress = {
      completedMissions: Math.max(current.completedMissions, progress.completedMissions),
      highScore: Math.max(current.highScore, progress.highScore),
      detentions: Math.max(current.detentions, progress.detentions),
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
    } catch {
      // ignore quota errors
    }

    if (this.db) {
      try {
        await setDoc(doc(this.db, 'players', this.getClientId()), merged, { merge: true });
      } catch (err) {
        console.warn('[firebase] save failed', err);
      }
    }
  }
}

export const progressService = new ProgressService();
