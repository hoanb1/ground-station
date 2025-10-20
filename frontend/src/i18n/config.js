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

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import commonEN from './locales/en/common.json';
import navigationEN from './locales/en/navigation.json';
import hardwareEN from './locales/en/hardware.json';
import settingsEN from './locales/en/settings.json';
import satellitesEN from './locales/en/satellites.json';
import trackingEN from './locales/en/tracking.json';
import overviewEN from './locales/en/overview.json';
import targetEN from './locales/en/target.json';
import dashboardEN from './locales/en/dashboard.json';
import waterfallEN from './locales/en/waterfall.json';

import commonEL from './locales/el/common.json';
import navigationEL from './locales/el/navigation.json';
import hardwareEL from './locales/el/hardware.json';
import settingsEL from './locales/el/settings.json';
import satellitesEL from './locales/el/satellites.json';
import trackingEL from './locales/el/tracking.json';
import overviewEL from './locales/el/overview.json';
import targetEL from './locales/el/target.json';
import dashboardEL from './locales/el/dashboard.json';
import waterfallEL from './locales/el/waterfall.json';

const resources = {
    en: {
        common: commonEN,
        navigation: navigationEN,
        hardware: hardwareEN,
        settings: settingsEN,
        satellites: satellitesEN,
        tracking: trackingEN,
        overview: overviewEN,
        target: targetEN,
        dashboard: dashboardEN,
        waterfall: waterfallEN,
    },
    el: {
        common: commonEL,
        navigation: navigationEL,
        hardware: hardwareEL,
        settings: settingsEL,
        satellites: satellitesEL,
        tracking: trackingEL,
        overview: overviewEL,
        target: targetEL,
        dashboard: dashboardEL,
        waterfall: waterfallEL,
    },
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'en', // default language
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: {
            escapeValue: false, // React already escapes values
        },
        react: {
            useSuspense: true,
        },
    });

export default i18n;
