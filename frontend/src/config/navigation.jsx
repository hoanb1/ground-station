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
import {TLEIcon} from "../components/common/icons.jsx";
import RadioIcon from '@mui/icons-material/Radio';
import InfoIcon from '@mui/icons-material/Info';
import MicrowaveIcon from '@mui/icons-material/Microwave';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import WavesIcon from '@mui/icons-material/Waves';
import VideocamIcon from '@mui/icons-material/Videocam';

export const NAVIGATION = [
    {
        kind: 'header',
        title: 'Tracking',
    },
    {
        segment: '',
        title: 'Birds eye view',
        icon: <PublicIcon/>,
    },
    {
        segment: 'track',
        title: 'Tracking console',
        icon: <GpsFixedIcon/>,
    },
    {
        segment: 'waterfall',
        title: 'Waterfall view',
        icon: <WavesIcon />,
    },
    {kind: 'divider'},
    {
        kind: 'header',
        title: 'Hardware',
    },
    {
        segment: 'hardware/rig',
        title: 'Rigs',
        icon: <RadioIcon/>,
    },
    {
        segment: 'hardware/rotator',
        title: 'Rotators',
        icon: <SatelliteIcon/>,
    },
    {
        segment: 'hardware/cameras',
        title: 'Cameras',
        icon: <VideocamIcon/>,
    },
    {
        segment: 'hardware/sdrs',
        title: 'SDRs',
        icon: <MicrowaveIcon/>,
    },
    {kind: 'divider'},
    {
        kind: 'header',
        title: 'Satellites',
    },
    {
        segment: 'satellites/tlesources',
        title: 'TLE sources',
        icon: <TLEIcon/>,
    },
    {
        segment: 'satellites/satellites',
        title: 'Satellites',
        icon: <Satellite03Icon/>,
    },
    {
        segment: 'satellites/groups',
        title: 'Groups',
        icon: <GroupWorkIcon/>,
    },
    {kind: 'divider'},
    {
        kind: 'header',
        title: 'Settings',
    },
    {
        segment: 'settings/preferences',
        title: 'Preferences',
        icon: <PreferenceVerticalIcon/>,
    },
    {
        segment: 'settings/location',
        title: 'Location',
        icon: <AddHomeIcon/>,
    },
    // {
    //     segment: 'settings/users',
    //     title: 'Users',
    //     icon: <PeopleIcon/>,
    // },
    {
        segment: 'settings/maintenance',
        title: 'Maintenance',
        icon: <EngineeringIcon/>,
    },
    {
        segment: 'settings/about',
        title: 'About',
        icon: <InfoIcon/>,
    },
];
