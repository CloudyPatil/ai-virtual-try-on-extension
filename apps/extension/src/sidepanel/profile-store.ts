import { digitalProfileSchema, type DigitalProfile } from "@tryon/contracts";
import { emptyProfile } from "./profile.js";

const DATABASE_NAME = "tryon-studio";
const DATABASE_VERSION = 1;
const PROFILE_STORE = "profiles";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open profile storage"));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROFILE_STORE)) {
        request.result.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadProfile(): Promise<DigitalProfile> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(PROFILE_STORE, "readonly").objectStore(PROFILE_STORE).get("default");
      request.onerror = () => reject(request.error ?? new Error("Unable to read profile"));
      request.onsuccess = () => {
        const parsed = digitalProfileSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : emptyProfile());
      };
    });
  } finally {
    database.close();
  }
}

export async function saveProfile(profile: DigitalProfile) {
  const validated = digitalProfileSchema.parse(profile);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROFILE_STORE, "readwrite");
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save profile"));
      transaction.oncomplete = () => resolve();
      transaction.objectStore(PROFILE_STORE).put(validated);
    });
  } finally {
    database.close();
  }
}

export async function deleteProfile() {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROFILE_STORE, "readwrite");
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete profile"));
      transaction.oncomplete = () => resolve();
      transaction.objectStore(PROFILE_STORE).delete("default");
    });
  } finally {
    database.close();
  }
}
