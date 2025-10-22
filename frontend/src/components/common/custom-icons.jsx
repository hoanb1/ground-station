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
 * Custom icon displaying "VFO" with "1" underneath
 */
export const VFO1Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="40%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO
            </text>
            <text
                x="50%"
                y="85%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                1
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO" with "2" underneath
 */
export const VFO2Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="40%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO
            </text>
            <text
                x="50%"
                y="85%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                2
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO" with "3" underneath
 */
export const VFO3Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="40%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO
            </text>
            <text
                x="50%"
                y="85%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                3
            </text>
        </SvgIcon>
    );
};

/**
 * Custom icon displaying "VFO" with "4" underneath
 */
export const VFO4Icon = (props) => {
    return (
        <SvgIcon {...props}>
            <text
                x="50%"
                y="40%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                VFO
            </text>
            <text
                x="50%"
                y="85%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fontFamily="Roboto, Arial, sans-serif"
            >
                4
            </text>
        </SvgIcon>
    );
};
