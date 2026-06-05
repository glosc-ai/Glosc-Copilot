import type { FirebaseOptions } from "firebase/app";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
    initializeAnalytics,
    isSupported,
    logEvent,
    type Analytics,
} from "firebase/analytics";
import type { Router } from "vue-router";

const firebaseConfig: FirebaseOptions = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let analytics: Analytics | null = null;
let analyticsSetupPromise: Promise<Analytics | null> | null = null;
let routeTrackingInstalled = false;

function hasFirebaseAnalyticsConfig() {
    return Boolean(
        firebaseConfig.apiKey &&
            firebaseConfig.authDomain &&
            firebaseConfig.projectId &&
            firebaseConfig.appId &&
            firebaseConfig.measurementId,
    );
}

async function getFirebaseAnalytics() {
    if (analytics) return analytics;
    if (analyticsSetupPromise) return analyticsSetupPromise;

    analyticsSetupPromise = (async () => {
        if (!hasFirebaseAnalyticsConfig()) return null;
        if (!(await isSupported())) return null;

        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        analytics = initializeAnalytics(app, {
            config: {
                send_page_view: false,
            },
        });

        return analytics;
    })().catch((error) => {
        console.warn("Firebase Analytics init failed", error);
        return null;
    });

    return analyticsSetupPromise;
}

export function setupFirebaseAnalytics(router: Router) {
    void getFirebaseAnalytics();

    if (routeTrackingInstalled) return;
    routeTrackingInstalled = true;

    router.afterEach(async (to) => {
        const currentAnalytics = await getFirebaseAnalytics();
        if (!currentAnalytics) return;

        logEvent(currentAnalytics, "page_view", {
            page_location: `${window.location.origin}${to.fullPath}`,
            page_path: to.fullPath,
            page_title: document.title,
        });
    });
}
