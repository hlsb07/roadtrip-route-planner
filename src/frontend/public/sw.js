// Service Worker for Roadtrip Route Planner PWA
// Minimal implementation for PWA eligibility and share target support

const CACHE_NAME = 'roadtrip-planner-v1';

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - claim all clients immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Fetch event - network-first strategy (no offline caching for now)
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
