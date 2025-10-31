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

import PublicIcon from '@mui/icons-material/Public';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import EngineeringIcon from '@mui/icons-material/Engineering';
import AddHomeIcon from '@mui/icons-material/AddHome';
import {SatelliteIcon, Satellite03Icon, PreferenceVerticalIcon} from "hugeicons-react";
import RadioIcon from '@mui/icons-material/Radio';
import InfoIcon from '@mui/icons-material/Info';
import MicrowaveIcon from '@mui/icons-material/Microwave';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import WavesIcon from '@mui/icons-material/Waves';
import VideocamIcon from '@mui/icons-material/Videocam';
import i18n from '../i18n/config.js';
import { TleIcon } from '../components/common/custom-icons.jsx';

export const getNavigation = () => [
    {
        kind: 'header',
        title: i18n.t('tracking', { ns: 'navigation' }),
    },
    {
        segment: '',
        title: i18n.t('birds_eye_view', { ns: 'navigation' }),
        icon: <PublicIcon/>,
    },
    {
        segment: 'track',
        title: i18n.t('tracking_console', { ns: 'navigation' }),
        icon: <GpsFixedIcon/>,
    },
    {
        segment: 'waterfall',
        title: i18n.t('waterfall_view', { ns: 'navigation' }),
        icon: <WavesIcon />,
    },
    {kind: 'divider'},
    {
        kind: 'header',
        title: i18n.t('hardware', { ns: 'navigation' }),
    },
    {
        segment: 'hardware/rig',
        title: i18n.t('rigs', { ns: 'navigation' }),
        icon: <RadioIcon/>,
    },
    {
        segment: 'hardware/rotator',
        title: i18n.t('rotators', { ns: 'navigation' }),
        icon: <SatelliteIcon/>,
    },
    // {
    //     segment: 'hardware/cameras',
    //     title: i18n.t('cameras', { ns: 'navigation' }),
    //     icon: <VideocamIcon/>,
    // },
    {
        segment: 'hardware/sdrs',
        title: i18n.t('sdrs', { ns: 'navigation' }),
        icon: <MicrowaveIcon/>,
    },
    {kind: 'divider'},
    {
        kind: 'header',
        title: i18n.t('satellites', { ns: 'navigation' }),
    },
    {
        segment: 'satellites/tlesources',
        title: i18n.t('tle_sources', { ns: 'navigation' }),
        icon: <TleIcon/>,
    },
    {
        segment: 'satellites/satellites',
        title: i18n.t('satellites', { ns: 'navigation' }),
        icon: <Satellite03Icon/>,
    },
    {
        segment: 'satellites/groups',
        title: i18n.t('groups', { ns: 'navigation' }),
        icon: <GroupWorkIcon/>,
    },
    {kind: 'divider'},
    {
        kind: 'header',
        title: i18n.t('settings', { ns: 'navigation' }),
    },
    {
        segment: 'settings/preferences',
        title: i18n.t('preferences', { ns: 'navigation' }),
        icon: <PreferenceVerticalIcon/>,
    },
    {
        segment: 'settings/location',
        title: i18n.t('location', { ns: 'navigation' }),
        icon: <AddHomeIcon/>,
    },
    // {
    //     segment: 'settings/users',
    //     title: 'Users',
    //     icon: <PeopleIcon/>,
    // },
    {
        segment: 'settings/maintenance',
        title: i18n.t('maintenance', { ns: 'navigation' }),
        icon: <EngineeringIcon/>,
    },
    {
        segment: 'settings/about',
        title: i18n.t('about', { ns: 'navigation' }),
        icon: <InfoIcon/>,
    },
];

// Keep NAVIGATION for backward compatibility but make it dynamic
export const NAVIGATION = getNavigation();
