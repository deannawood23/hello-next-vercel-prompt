'use client';

import { useEffect, useSyncExternalStore } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'almostcrackd-theme';
const OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];
const THEME_EVENT = 'almostcrackd-theme-change';

function applyTheme(preference: ThemePreference) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
}

function getStoredThemePreference(): ThemePreference {
    if (typeof window === 'undefined') {
        return 'system';
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system'
        ? stored
        : 'system';
}

function subscribe(onStoreChange: () => void) {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) {
            onStoreChange();
        }
    };
    const onThemeChange = () => onStoreChange();
    const onMediaChange = () => {
        if (getStoredThemePreference() === 'system') {
            onStoreChange();
        }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(THEME_EVENT, onThemeChange);
    media.addEventListener('change', onMediaChange);

    return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(THEME_EVENT, onThemeChange);
        media.removeEventListener('change', onMediaChange);
    };
}

export function ThemeToggle() {
    const theme = useSyncExternalStore<ThemePreference>(
        subscribe,
        getStoredThemePreference,
        () => 'system'
    );

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    const updateTheme = (nextTheme: ThemePreference) => {
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        window.dispatchEvent(new Event(THEME_EVENT));
        applyTheme(nextTheme);
    };

    return (
        <div className="flex items-center gap-1 rounded-full border border-[var(--admin-border)] bg-[var(--admin-panel)] p-1">
            {OPTIONS.map((option) => {
                const active = option === theme;
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => updateTheme(option)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                            active
                                ? 'bg-[var(--ls-accent)] text-white shadow-[0_0_0_1px_var(--ls-border-accent)]'
                                : 'text-[var(--admin-muted)] hover:bg-[var(--ls-surface-hover)] hover:text-[var(--admin-text)]'
                        }`}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
}
