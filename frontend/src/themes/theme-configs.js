/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

/**
 * Theme configuration presets
 * Each theme defines a complete set of colors and styles
 */

export const themeConfigs = {
    dark: {
        mode: 'dark',
        primary: { main: '#1976d2' },
        secondary: { main: '#dc004e' },
        success: { main: '#4caf50' },
        warning: { main: '#ff9800' },
        error: { main: '#f44336' },
        info: { main: '#2196f3' },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
            elevated: '#2a2a2a',
        },
        border: {
            main: '#424242',
            light: '#494949',
            dark: '#262626',
        },
        overlay: {
            light: 'rgba(255, 255, 255, 0.08)',
            medium: 'rgba(255, 255, 255, 0.12)',
            dark: 'rgba(0, 0, 0, 0.5)',
        },
        status: {
            connected: '#4caf50',
            connecting: '#ff9800',
            disconnected: '#f44336',
            polling: '#f57c00',
        },
    },

    light: {
        mode: 'light',
        primary: { main: '#1976d2' },
        secondary: { main: '#dc004e' },
        success: { main: '#4caf50' },
        warning: { main: '#ff9800' },
        error: { main: '#f44336' },
        info: { main: '#2196f3' },
        background: {
            default: '#e8e8e8',
            paper: '#f0f0f0',
            elevated: '#d8d8d8',
        },
        border: {
            main: '#b0b0b0',
            light: '#a0a0a0',
            dark: '#909090',
        },
        overlay: {
            light: 'rgba(0, 0, 0, 0.08)',
            medium: 'rgba(0, 0, 0, 0.14)',
            dark: 'rgba(0, 0, 0, 0.4)',
        },
        status: {
            connected: '#4caf50',
            connecting: '#ff9800',
            disconnected: '#f44336',
            polling: '#f57c00',
        },
    },

    cyberpunk: {
        mode: 'dark',
        primary: { main: '#00ffff' }, // Cyan
        secondary: { main: '#ff00ff' }, // Magenta
        success: { main: '#00ff00' }, // Neon Green
        warning: { main: '#ffff00' }, // Yellow
        error: { main: '#ff0055' }, // Hot Pink
        info: { main: '#00ffff' }, // Cyan
        background: {
            default: '#0a0e1a', // Very dark blue
            paper: '#1a1f35', // Dark blue-gray
            elevated: '#252b45', // Slightly lighter blue-gray
        },
        border: {
            main: '#00ffff', // Cyan borders
            light: '#00cccc',
            dark: '#008888',
        },
        overlay: {
            light: 'rgba(0, 255, 255, 0.08)',
            medium: 'rgba(0, 255, 255, 0.15)',
            dark: 'rgba(0, 0, 0, 0.7)',
        },
        status: {
            connected: '#00ff00', // Neon green
            connecting: '#ffff00', // Yellow
            disconnected: '#ff0055', // Hot pink
            polling: '#ff8800', // Orange
        },
        // Custom additions
        neonGlow: {
            cyan: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff',
            magenta: '0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff',
            green: '0 0 10px #00ff00, 0 0 20px #00ff00, 0 0 30px #00ff00',
        },
    },

    'high-contrast': {
        mode: 'dark',
        primary: { main: '#ffffff' },
        secondary: { main: '#ffff00' },
        success: { main: '#00ff00' },
        warning: { main: '#ffff00' },
        error: { main: '#ff0000' },
        info: { main: '#00ffff' },
        background: {
            default: '#000000',
            paper: '#1a1a1a',
            elevated: '#2d2d2d',
        },
        border: {
            main: '#ffffff',
            light: '#cccccc',
            dark: '#888888',
        },
        overlay: {
            light: 'rgba(255, 255, 255, 0.15)',
            medium: 'rgba(255, 255, 255, 0.25)',
            dark: 'rgba(0, 0, 0, 0.8)',
        },
        status: {
            connected: '#00ff00',
            connecting: '#ffff00',
            disconnected: '#ff0000',
            polling: '#ff8800',
        },
    },

    'ocean-blue': {
        mode: 'dark',
        primary: { main: '#00bcd4' }, // Cyan
        secondary: { main: '#448aff' }, // Blue
        success: { main: '#26c6da' }, // Light cyan
        warning: { main: '#ffa726' }, // Orange
        error: { main: '#ef5350' }, // Red
        info: { main: '#42a5f5' }, // Light blue
        background: {
            default: '#0a1929', // Deep ocean blue
            paper: '#132f4c', // Navy blue
            elevated: '#1e4976', // Medium blue
        },
        border: {
            main: '#2d5a7b',
            light: '#3d6a8b',
            dark: '#1d4a6b',
        },
        overlay: {
            light: 'rgba(0, 188, 212, 0.08)',
            medium: 'rgba(0, 188, 212, 0.15)',
            dark: 'rgba(0, 0, 0, 0.6)',
        },
        status: {
            connected: '#26c6da',
            connecting: '#ffa726',
            disconnected: '#ef5350',
            polling: '#ff9800',
        },
    },

    'forest-green': {
        mode: 'dark',
        primary: { main: '#66bb6a' }, // Green
        secondary: { main: '#8bc34a' }, // Light green
        success: { main: '#81c784' },
        warning: { main: '#ffb74d' },
        error: { main: '#e57373' },
        info: { main: '#4fc3f7' },
        background: {
            default: '#0d1f0d', // Very dark green
            paper: '#1a2e1a', // Dark green
            elevated: '#2d4a2d', // Medium green
        },
        border: {
            main: '#3d5a3d',
            light: '#4d6a4d',
            dark: '#2d4a2d',
        },
        overlay: {
            light: 'rgba(102, 187, 106, 0.08)',
            medium: 'rgba(102, 187, 106, 0.15)',
            dark: 'rgba(0, 0, 0, 0.6)',
        },
        status: {
            connected: '#81c784',
            connecting: '#ffb74d',
            disconnected: '#e57373',
            polling: '#ff9800',
        },
    },

    night: {
        mode: 'dark',
        primary: { main: '#7f77c3' }, // Soft purple
        secondary: { main: '#03dac6' }, // Teal
        success: { main: '#4caf50' },
        warning: { main: '#fb8c00' },
        error: { main: '#cf6679' },
        info: { main: '#64b5f6' },
        background: {
            default: '#000000', // Pure black for OLED screens
            paper: '#121212', // Very dark gray
            elevated: '#1e1e1e', // Slightly elevated
        },
        border: {
            main: '#2d2d2d',
            light: '#383838',
            dark: '#1a1a1a',
        },
        overlay: {
            light: 'rgba(187, 134, 252, 0.05)', // Purple tint
            medium: 'rgba(187, 134, 252, 0.10)',
            dark: 'rgba(0, 0, 0, 0.8)',
        },
        status: {
            connected: '#4caf50',
            connecting: '#fb8c00',
            disconnected: '#cf6679',
            polling: '#ff9800',
        },
    },

    'sunset-orange': {
        mode: 'dark',
        primary: { main: '#ff6f00' }, // Deep orange
        secondary: { main: '#ff9e40' }, // Light orange
        success: { main: '#66bb6a' }, // Green
        warning: { main: '#ffa726' }, // Orange
        error: { main: '#ef5350' }, // Red
        info: { main: '#42a5f5' }, // Blue
        background: {
            default: '#1a0f00', // Very dark brown/orange
            paper: '#2d1810', // Dark warm brown
            elevated: '#3d2418', // Medium warm brown
        },
        border: {
            main: '#4d3420',
            light: '#5d4430',
            dark: '#3d2410',
        },
        overlay: {
            light: 'rgba(255, 111, 0, 0.08)',
            medium: 'rgba(255, 111, 0, 0.15)',
            dark: 'rgba(0, 0, 0, 0.6)',
        },
        status: {
            connected: '#66bb6a',
            connecting: '#ffa726',
            disconnected: '#ef5350',
            polling: '#ff9800',
        },
    },
};

/**
 * Get theme configuration by name
 * @param {string} themeName - Name of the theme (dark, light, cyberpunk, etc.)
 * @returns {object} Theme configuration object
 */
export function getThemeConfig(themeName) {
    return themeConfigs[themeName] || themeConfigs.dark;
}

/**
 * Get list of available theme names
 * @returns {string[]} Array of theme names
 */
export function getAvailableThemes() {
    return Object.keys(themeConfigs);
}
