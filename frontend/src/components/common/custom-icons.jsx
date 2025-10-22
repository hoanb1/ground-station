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

import { SvgIcon } from '@mui/material';

/**
 * Custom icon displaying "TLE" text
 * Works like a Material-UI icon - inherits color, fontSize, and other props
 */
export const TleIcon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                TLE
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO1" text
 */
export const VFO1Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO1
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO2" text
 */
export const VFO2Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO2
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO3" text
 */
export const VFO3Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO3
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO4" text
 */
export const VFO4Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO4
            </text>
        </SvgIcon>
    );
};
